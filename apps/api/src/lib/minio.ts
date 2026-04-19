import * as Minio from 'minio'

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
})

const BUCKET = process.env.MINIO_BUCKET ?? 'crm-files'

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET)
  if (!exists) {
    await minioClient.makeBucket(BUCKET, 'us-east-1')
    console.log(`✓ MinIO bucket '${BUCKET}' created`)
  } else {
    console.log(`✓ MinIO bucket '${BUCKET}' exists`)
  }
}

export { BUCKET }
