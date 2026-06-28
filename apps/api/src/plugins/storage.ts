import { Client } from 'minio'

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'storehub',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'storehub123',
})

export const BUCKET = process.env.MINIO_BUCKET ?? 'storehub'

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET)
  if (!exists) {
    await minioClient.makeBucket(BUCKET)
    // Set public read policy
    await minioClient.setBucketPolicy(BUCKET, JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${BUCKET}/*`] }],
    }))
  }
}

export function getPublicUrl(path: string) {
  const port = process.env.MINIO_PORT ?? '9000'
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost'
  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'
  return `${protocol}://${endpoint}:${port}/${BUCKET}/${path}`
}
