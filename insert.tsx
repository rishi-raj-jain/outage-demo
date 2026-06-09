import 'dotenv/config'
import { parse } from 'csv-parse'
import { createReadStream, existsSync } from 'fs'
import { slug } from 'github-slugger'
import { neon } from '@neondatabase/serverless'
import { generateUsername } from 'unique-username-generator'

const sql = neon(process.env.DB_CONNECTION_STRING!)
const CSV_PATH = './spotify_millsongdata.csv'
const BATCH_SIZE = 1000

type UserRow = { id: number; username: string }

async function createSchema() {
  await sql`DROP TABLE IF EXISTS mentions`
  await sql`DROP TABLE IF EXISTS tweets`
  await sql`DROP TABLE IF EXISTS users`
  await sql`DROP TABLE IF EXISTS branches`
  await sql`DROP TABLE IF EXISTS playing_with_neon`

  await sql`CREATE TABLE branches (
    branch_name TEXT,
    connection_string TEXT
  )`

  await sql`CREATE TABLE users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT
  )`

  await sql`CREATE TABLE tweets (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    image_url TEXT,
    likes_count INTEGER NOT NULL DEFAULT 0,
    retweets_count INTEGER NOT NULL DEFAULT 0,
    replies_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`

  await sql`CREATE TABLE mentions (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tweet_id TEXT NOT NULL REFERENCES tweets(id),
    mentioned_user_id INTEGER NOT NULL REFERENCES users(id)
  )`
}

async function insertSeedData() {
  const users = (await sql`
    INSERT INTO users (username, display_name, avatar_url, bio) VALUES
      ('neon', 'Neon', 'neon', 'Serverless Postgres for modern apps'),
      ('postgres', 'PostgreSQL', 'postgres', 'The world''s most advanced open source database'),
      ('devrel', 'DevRel', 'devrel', 'Building demos that ship at the speed of light')
    RETURNING id, username
  `) as UserRow[]

  const userIdByUsername = new Map(users.map((user) => [user.username, user.id]))

  await sql`
    INSERT INTO tweets (id, user_id, content, image_url, likes_count, retweets_count, replies_count, created_at) VALUES
      (
        '1',
        ${userIdByUsername.get('neon')},
        'Branching is instant with copy-on-write. Try creating a branch from production without copying terabytes of data.',
        'https://picsum.photos/seed/neon/600/400',
        1284,
        312,
        47,
        NOW() - INTERVAL '2 hours'
      ),
      (
        '2',
        ${userIdByUsername.get('postgres')},
        'Point-in-time restore should not mean waiting hours for a backup replay. @neon makes recovery feel boring again.',
        NULL,
        892,
        201,
        33,
        NOW() - INTERVAL '4 hours'
      ),
      (
        '3',
        ${userIdByUsername.get('devrel')},
        'We just dropped every table in prod and brought the app back in milliseconds. The outage simulator is live.',
        'https://picsum.photos/seed/outage/600/400',
        2048,
        640,
        112,
        NOW() - INTERVAL '6 hours'
      )
  `

  await sql`
    INSERT INTO mentions (tweet_id, mentioned_user_id) VALUES
      ('2', ${userIdByUsername.get('neon')})
  `
}

async function loadFromCsv() {
  const artistToUserId = new Map<string, number>()
  const usernames = new Set<string>()
  let counter = 0
  let batch: any[] = []

  const flush = async () => {
    if (batch.length === 0) return
    const pending = batch
    batch = []
    await sql.transaction(pending)
  }

  const getUserId = async (artist: string) => {
    const key = slug(artist)
    const existing = artistToUserId.get(key)
    if (existing) return existing

    let username = key.slice(0, 15) || generateUsername()
    while (usernames.has(username)) username = generateUsername()
    usernames.add(username)

    const [user] = (await sql`
      INSERT INTO users (username, display_name, avatar_url, bio)
      VALUES (${username}, ${artist}, ${username}, ${`Fan of ${artist}`})
      RETURNING id, username
    `) as UserRow[]

    artistToUserId.set(key, user.id)
    return user.id
  }

  const parser = createReadStream(CSV_PATH).pipe(parse({ delimiter: ',', from_line: 2 }))

  for await (const row of parser) {
    const artist = row[0]?.trim()
    const song = row[1]?.trim()
    const link = row[2]?.trim()

    if (!artist || !song) continue

    counter += 1
    const userId = await getUserId(artist)
    const tweetId = String(counter)

    batch.push(
      sql`
        INSERT INTO tweets (
          id,
          user_id,
          content,
          image_url,
          likes_count,
          retweets_count,
          replies_count,
          created_at
        ) VALUES (
          ${tweetId},
          ${userId},
          ${`Now playing: ${song}`},
          ${link ? `https://lyrics.ovh${link}` : null},
          ${Math.floor(Math.random() * 5000)},
          ${Math.floor(Math.random() * 2000)},
          ${Math.floor(Math.random() * 500)},
          NOW() - (${counter} * INTERVAL '1 minute')
        )
      `,
    )

    if (batch.length >= BATCH_SIZE) {
      await flush()
      if (counter % 10000 === 0) console.log(`Inserted ${counter.toLocaleString()} tweets...`)
    }
  }

  await flush()
  console.log(`Loaded ${counter.toLocaleString()} tweets from CSV`)
}

async function populate() {
  if (!process.env.DB_CONNECTION_STRING) {
    throw new Error('DB_CONNECTION_STRING is required')
  }

  console.log('Creating schema on parent branch...')
  await createSchema()

  if (existsSync(CSV_PATH)) {
    console.log(`Loading bulk data from ${CSV_PATH}...`)
    await loadFromCsv()
  } else {
    console.log('CSV not found, inserting seed data only...')
    await insertSeedData()
  }

  const [{ users }] = await sql`SELECT count(*)::int AS users FROM users`
  const [{ tweets }] = await sql`SELECT count(*)::int AS tweets FROM tweets`
  console.log(`Done. users=${users}, tweets=${tweets}`)
}

populate().catch((error) => {
  console.error(error)
  process.exit(1)
})
