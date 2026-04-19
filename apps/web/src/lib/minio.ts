/**
 * MinIO client for the Next.js app.
 * Mirrors apps/api/src/lib/minio.ts so API routes can upload and generate
 * presigned URLs without an HTTP round-trip to the Express API.
 *
 * Required env vars:
 *   MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET
 *   MINIO_USE_SSL (optional, default false)
 */

import * as Minio from 'minio'

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
})

export const BUCKET = process.env.MINIO_BUCKET ?? 'crm-files'

/** Ensures the bucket exists before any upload. */
export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET)
  if (!exists) {
    await minioClient.makeBucket(BUCKET)
    console.log(`[minio] bucket '${BUCKET}' created`)
  }
}

/** Generate a presigned URL for downloading a file (default: 5-minute expiry). */
export async function getPresignedUrl(
  storageKey: string,
  expirySeconds = 300,
): Promise<string> {
  return minioClient.presignedGetObject(BUCKET, storageKey, expirySeconds)
}

/** Upload a file buffer to MinIO. Returns the storage key. */
export async function uploadFile(
  storageKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  await ensureBucket()
  await minioClient.putObject(BUCKET, storageKey, buffer, buffer.length, {
    'Content-Type': mimeType,
  })
}

/** Delete a file from MinIO. */
export async function deleteFile(storageKey: string): Promise<void> {
  await minioClient.removeObject(BUCKET, storageKey)
}
