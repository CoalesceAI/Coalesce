import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------------------------------------------------------------------------
// Railway Buckets storage service (S3-compatible)
//
// Env vars (auto-provided by Railway variable references):
//   BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION, ENDPOINT
// ---------------------------------------------------------------------------

function getClient(): S3Client {
  const endpoint = process.env["ENDPOINT"] ?? process.env["S3_ENDPOINT"];
  const accessKeyId = process.env["ACCESS_KEY_ID"] ?? process.env["AWS_ACCESS_KEY_ID"] ?? "";
  const secretAccessKey = process.env["SECRET_ACCESS_KEY"] ?? process.env["AWS_SECRET_ACCESS_KEY"] ?? "";
  const region = process.env["REGION"] ?? process.env["AWS_REGION"] ?? "auto";

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

function getBucket(): string {
  const bucket = process.env["BUCKET"] ?? process.env["S3_BUCKET"];
  if (!bucket) throw new Error("BUCKET env var is not set");
  return bucket;
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 600,
): Promise<string> {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

export async function getObject(key: string): Promise<Buffer> {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  const response = await client.send(command);
  const stream = response.Body;
  if (!stream) throw new Error("Empty response body");
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  await client.send(command);
}

export function buildStorageKey(orgId: string, filename: string): string {
  const ts = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `orgs/${orgId}/docs/${ts}-${safe}`;
}
