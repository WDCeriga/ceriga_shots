/* eslint-disable no-console */
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

function loadDotEnvLocal() {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  const raw = fs.readFileSync(p, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const k = trimmed.slice(0, idx).trim()
    const v = trimmed.slice(idx + 1).trim()
    if (!k) continue
    if (process.env[k] == null) process.env[k] = v
  }
}

async function main() {
  loadDotEnvLocal()

  const accountId = process.env.R2_ACCOUNT_ID
  const bucket = process.env.R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')

  for (const [k, v] of Object.entries({ accountId, bucket, accessKeyId, secretAccessKey })) {
    if (!v) throw new Error(`Missing env var: ${k}`)
  }

  const key = `smoke/${crypto.randomUUID()}.txt`
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  const body = Buffer.from(`r2 smoke test ${new Date().toISOString()}`)
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'text/plain; charset=utf-8',
      CacheControl: 'no-store',
    })
  )

  console.log('PUT_OK', { bucket, key })

  if (!publicBaseUrl) {
    console.log('SKIP_FETCH (no R2_PUBLIC_BASE_URL)')
    return
  }

  const url = `${publicBaseUrl}/${key}`
  const res = await fetch(url)
  const text = await res.text().catch(() => '')
  console.log('FETCH', { status: res.status, url, bodyPrefix: text.slice(0, 80) })
}

main().catch((e) => {
  console.error('R2_SMOKE_FAIL', e?.message || e)
  process.exit(1)
})

