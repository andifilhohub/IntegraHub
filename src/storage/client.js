import { Client } from 'minio';
import dotenv from 'dotenv';

dotenv.config();

const minioClient = new Client({
  endPoint: process.env.STORAGE_ENDPOINT?.replace('http://', '').replace('https://', '') || 'localhost',
  port: parseInt(process.env.STORAGE_PORT || '9000'),
  useSSL: process.env.STORAGE_USE_SSL === 'true',
  accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
});

const BUCKET = process.env.STORAGE_BUCKET || 'integrahub-batches';

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, process.env.STORAGE_REGION || 'us-east-1');
    console.log(`Created bucket: ${BUCKET}`);
  }
}

export async function uploadStream(objectName, stream, size, metadata = {}) {
  await minioClient.putObject(BUCKET, objectName, stream, size, metadata);
  return `${BUCKET}/${objectName}`;
}

export async function uploadObject(objectName, buffer, metadata = {}) {
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, metadata);
  return `${BUCKET}/${objectName}`;
}

export async function getObject(objectName) {
  return minioClient.getObject(BUCKET, objectName);
}

export async function getObjectUrl(objectName) {
  return minioClient.presignedGetObject(BUCKET, objectName, 24 * 60 * 60);
}

export default minioClient;
