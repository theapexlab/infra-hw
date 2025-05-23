import { Client } from 'minio';
import { config } from './env';

// Configure the MinIO client - using only the internal Docker network name
const minioClient = new Client({
  endPoint: config.storage.internalEndpoint || 'minio',
  port: config.storage.port,
  useSSL: config.storage.useSSL,
  accessKey: config.storage.accessKey,
  secretKey: config.storage.secretKey,
  pathStyle: true
});

// Bucket name for media storage
const BUCKET_NAME = config.storage.bucket;

// Ensure bucket exists on startup
export const initializeStorage = async (): Promise<void> => {
  // Check if bucket exists
  const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
  
  if (!bucketExists) {
    await minioClient.makeBucket(BUCKET_NAME, config.storage.region);
    console.log(`Created bucket: ${BUCKET_NAME}`);
  } else {
    console.log(`Bucket ${BUCKET_NAME} already exists`);
  }
  
  console.log(`Storage configuration:`);
  console.log(` - MinIO client: ${config.storage.internalEndpoint}:${config.storage.port}`);
  console.log(` - Public URL: ${config.storage.publicUrl}`);
  console.log(` - Bucket: ${BUCKET_NAME}`);
};

// Export the client and bucket name
export { minioClient, BUCKET_NAME };
