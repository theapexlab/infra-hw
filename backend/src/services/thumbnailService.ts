import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { minioClient, BUCKET_NAME } from '../config/storage';
import { generateUniqueFilename } from './storageService';

// Configure logging for debugging
const logThumbnailOperation = (message: string, data?: any) => {
  console.log(`[THUMBNAIL SERVICE] ${message}`, data ? data : '');
};

/**
 * Generate a thumbnail from a video buffer
 * @param videoBuffer - Buffer containing the video data
 * @param originalFilename - Original filename of the video
 * @returns Promise resolving to the thumbnail object name in MinIO
 */
export const generateVideoThumbnail = async (
  videoBuffer: Buffer,
  originalFilename: string
): Promise<string> => {
  // Create temporary files for processing with more unique names
  const tempDir = os.tmpdir();
  const uniqueId = Date.now() + '-' + Math.random().toString(36).substring(2, 10);
  const tempVideoPath = path.join(tempDir, `temp-video-${uniqueId}`);
  const tempThumbnailPath = path.join(tempDir, `temp-thumbnail-${uniqueId}.jpg`);
  
  logThumbnailOperation(`Starting thumbnail generation for ${originalFilename}`);
  logThumbnailOperation(`Temp video path: ${tempVideoPath}`);
  logThumbnailOperation(`Temp thumbnail path: ${tempThumbnailPath}`);
  
  try {
    // Write the video buffer to a temporary file
    fs.writeFileSync(tempVideoPath, videoBuffer);
    logThumbnailOperation(`Video buffer written to temporary file (${videoBuffer.length} bytes)`);
    
    // Generate thumbnail filename (use jpg extension for thumbnails)
    const thumbnailName = generateUniqueFilename(originalFilename.replace(/\.\w+$/, '.jpg'));
    logThumbnailOperation(`Generated thumbnail name: ${thumbnailName}`);
    
    // Check if FFmpeg is available by running a simple command
    try {
      const ffmpegVersion = require('child_process').execSync('ffmpeg -version').toString();
      logThumbnailOperation(`FFmpeg is available: ${ffmpegVersion.split('\n')[0]}`);
    } catch (ffmpegCheckError) {
      console.error('FFmpeg is not available:', ffmpegCheckError);
      throw new Error('FFmpeg is not available on the system. Cannot generate thumbnails.');
    }
    
    // Create a promise to handle the async ffmpeg processing
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .on('start', (commandLine) => {
          logThumbnailOperation(`FFmpeg process started with command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          logThumbnailOperation(`FFmpeg progress: ${JSON.stringify(progress)}`);
        })
        .on('error', (err) => {
          console.error('Error generating thumbnail:', err);
          reject(err);
        })
        .on('end', () => {
          logThumbnailOperation('FFmpeg processing completed successfully');
          resolve();
        })
        .screenshots({
          count: 1,
          folder: tempDir,
          filename: path.basename(tempThumbnailPath),
          timemarks: ['00:00:01'] // Take screenshot at 1 second for better chance of getting a frame
        });
    });
    
    // Verify the thumbnail was created
    if (!fs.existsSync(tempThumbnailPath)) {
      throw new Error(`Thumbnail file was not created at expected path: ${tempThumbnailPath}`);
    }
    
    // Read the generated thumbnail
    const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);
    logThumbnailOperation(`Read thumbnail into buffer (${thumbnailBuffer.length} bytes)`);
    
    // Upload thumbnail to MinIO
    await minioClient.putObject(
      BUCKET_NAME,
      thumbnailName,
      thumbnailBuffer,
      {
        'Content-Type': 'image/jpeg',
      }
    );
    
    logThumbnailOperation(`Successfully uploaded thumbnail to MinIO: ${thumbnailName}`);
    
    return thumbnailName;
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
    logThumbnailOperation(`Error generating thumbnail: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
        logThumbnailOperation(`Cleaned up temporary video file: ${tempVideoPath}`);
      }
      if (fs.existsSync(tempThumbnailPath)) {
        fs.unlinkSync(tempThumbnailPath);
        logThumbnailOperation(`Cleaned up temporary thumbnail file: ${tempThumbnailPath}`);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temporary files:', cleanupError);
    }
  }
};
