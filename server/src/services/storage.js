/**
 * S3-compatible object storage: Cloudflare R2 in production, MinIO locally.
 * The AWS SDK is used purely as a generic S3 client; no AWS services are involved.
 */
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { config } from '../config.js';

export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

function createClient(endpoint) {
  return new S3Client({
    endpoint,
    region: config.storage.region,
    credentials: {
      accessKeyId: config.storage.accessKey,
      secretAccessKey: config.storage.secretKey,
    },
    // Path-style URLs (endpoint/bucket/key) work on both MinIO and R2.
    forcePathStyle: true,
    // Newer SDKs add CRC checksums by default, which not every S3-compatible store supports.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

const client = createClient(config.storage.endpoint);
// Download links must use a host the browser can reach (e.g. localhost:9000, not minio:9000).
const signingClient =
  config.storage.publicEndpoint === config.storage.endpoint ? client : createClient(config.storage.publicEndpoint);

export async function uploadFile(key, body, contentType) {
  await client.send(
    new PutObjectCommand({ Bucket: config.storage.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteFiles(keys) {
  if (keys.length === 0) return;
  // DeleteObjects accepts at most 1000 keys per request.
  for (let i = 0; i < keys.length; i += 1000) {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: config.storage.bucket,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

/** A presigned GET URL that opens the file inline in the browser and expires after an hour. */
export async function getDownloadUrl(key, fileName, contentType) {
  const command = new GetObjectCommand({
    Bucket: config.storage.bucket,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  });
  return getSignedUrl(signingClient, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}
