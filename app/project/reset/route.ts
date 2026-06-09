export const runtime = 'edge'

export const preferredRegion = ['cle1']

export const dynamic = 'force-dynamic'

export const fetchCache = 'force-no-store'

import { Client } from '@upstash/qstash'
import { NextRequest, NextResponse } from 'next/server'
import { neon, neonConfig } from '@neondatabase/serverless'

neonConfig.poolQueryViaFetch = true

let client: Client | null = null

if (process.env.QSTASH_TOKEN) client = new Client({ token: process.env.QSTASH_TOKEN })

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams
  const branchName = searchParams.get('branchName') as string
  const headers = new Headers()
  headers.append('Accept', 'application/json')
  headers.append('Content-Type', 'application/json')
  headers.append('Authorization', `Bearer ${process.env.NEON_API_KEY}`)
  const preserve_under_name = 'mainrestored' + new Date().getTime()
  const body = JSON.stringify({
    preserve_under_name,
    source_branch_id: process.env.NEON_PARENT_ID,
  })
  const start_time_1 = performance.now()
  await fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}/branches/${branchName}/restore`, {
    method: 'POST',
    headers,
    body,
  })
  const end_time_1 = performance.now()
  try {
    await Promise.resolve(setTimeout(() => {}, 200))
    const tmp = await Promise.resolve(
      fetch(`https://console.neon.tech/api/v2/projects/${process.env.NEON_PROJECT_ID}/branches?search=${preserve_under_name}&sort_by=updated_at&sort_order=desc&limit=1`, {
        headers,
      }).then((res) => res.json()),
    )
    await Promise.allSettled([
      client?.publishJSON({
        url: 'https://neon-demo-outage.vercel.app/project/clean',
        body: { new_branch_id: tmp['branches'][0].id },
        delay: 30 * 60,
        retries: 0,
      }),
    ])
  } catch (e) {
    // @ts-ignore
    console.log(e.message || e.toString())
  }
  const sql = neon(`${process.env.DB_CONNECTION_STRING}`)
  const start_time_2 = performance.now()
  await sql`SELECT * FROM tweets limit 5;`
  const end_time_2 = performance.now()
  return NextResponse.json({
    time: end_time_2 - start_time_2 + (end_time_1 - start_time_1),
    code: 1,
  })
}
