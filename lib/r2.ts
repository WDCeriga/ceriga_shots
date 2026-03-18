import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl?: string
}

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function getR2Config(): R2Config {
  return {
    accountId: requiredEnv('R2_ACCOUNT_ID'),
    accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    bucket: requiredEnv('R2_BUCKET'),
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  }
}

export function isR2Configured(): boolean {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET)
}

let cachedClient: S3Client | null = null
export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient
  const cfg = getR2Config()
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  })
  return cachedClient
}

export function r2PublicUrlForKey(key: string): string {
  const { publicBaseUrl, accountId, bucket } = getR2Config()
  const base = publicBaseUrl?.replace(/\/+$/, '')
  if (base) return `${base}/${key}`
  return `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`
}

export async function putObjectToR2(args: {
  key: string
  body: Uint8Array
  contentType: string
  cacheControl?: string
}): Promise<{ key: string; url: string }> {
  const { bucket } = getR2Config()
  const client = getR2Client()

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      CacheControl: args.cacheControl ?? 'public, max-age=31536000, immutable',
    })
  )

  return { key: args.key, url: r2PublicUrlForKey(args.key) }
}

export async function getObjectFromR2(key: string): Promise<{ body: Buffer; contentType?: string }> {
  const { bucket } = getR2Config()
  const client = getR2Client()
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))

  const bodyStream = res.Body
  if (!bodyStream) return { body: Buffer.from([]), contentType: res.ContentType }

  // AWS SDK v3 in Node returns a Readable with transform helpers.
  const anyStream = bodyStream as any
  if (typeof anyStream.transformToByteArray === 'function') {
    const bytes = (await anyStream.transformToByteArray()) as Uint8Array
    return { body: Buffer.from(bytes), contentType: res.ContentType }
  }

  const chunks: Buffer[] = []
  for await (const chunk of bodyStream as any as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any))
  }
  return { body: Buffer.concat(chunks), contentType: res.ContentType }
}

export function r2KeyFromPublicUrl(url: string): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '')
  if (!base) return null
  if (!url.startsWith(base + '/')) return null
  return url.slice(base.length + 1)
}

