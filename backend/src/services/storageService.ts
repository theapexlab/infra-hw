import { config } from '../config/env';
import crypto from 'crypto';
import path from 'path';
import { minioClient } from '../config/storage';

const BUCKET_NAME = config.storage.bucket;

/**
 * Generate a unique filename for uploaded media
 */
export const generateUniqueFilename = (originalName: string): string => {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${randomString}${ext}`;
};

/**
 * Generate a presigned URL for direct browser uploads to MinIO
 */
export const generatePresignedUrl = async (
  originalFilename: string,
  contentType: string
): Promise<{ presignedUrl: string; objectName: string }> => {
  // Generate a unique filename for the object
  const objectName = generateUniqueFilename(originalFilename);

  try {
    // Check if the bucket exists
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
    if (!bucketExists) {
      throw new Error('Storage bucket does not exist');
    }
    
    // Generate a presigned URL for uploading the object
    const presignedUrl = await minioClient.presignedPutObject(
      BUCKET_NAME,
      objectName,
      60 * 60 // 1 hour expiry
    );
    
    console.log(`Generated presigned URL: ${presignedUrl}`);
    console.log(` - Object name: ${objectName}`);
    console.log(` - Content type: ${contentType}`);
    
    return {
      presignedUrl,
      objectName
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Generate a public URL for accessing the uploaded media
 */
export const generatePublicUrl = (objectName: string): string => {
  // Generate URL that will be served through Nginx proxy to MinIO
  return `/media-sharing/${objectName}`;
};

/**
 * Store an object in the storage (for server-side uploads)
 */
export const storeObject = async (objectName: string, buffer: Buffer, contentType: string): Promise<void> => {
  await minioClient.putObject(BUCKET_NAME, objectName, buffer, {
    'Content-Type': contentType,
  });
};
