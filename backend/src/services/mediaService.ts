import db from '../config/database';
import { minioClient, BUCKET_NAME } from '../config/storage';
import { config } from '../config/env';
import { generatePublicUrl } from './storageService';
import type { MediaItem, PaginatedResponse } from 'shared-types';
import path from 'path';
import crypto from 'crypto';

/**
 * Generate a unique filename for uploaded media
 */
const generateUniqueFilename = (originalName: string): string => {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${randomString}${ext}`;
};

/**
 * Determine if file is a video based on mimetype
 */
const isVideo = (mimetype: string): boolean => {
  return mimetype.startsWith('video/');
};

/**
 * Get media items with pagination
 */
export const getMediaItems = async (
  page: number = 1, 
  limit: number = 12
): Promise<PaginatedResponse<MediaItem>> => {
  // Calculate offset based on page and limit
  const offset = (page - 1) * limit;
  
  // Get total count for pagination info
  const [{ count }] = await db('media_items')
    .count('id as count')
    .then(rows => rows as { count: string }[]);
  
  const totalItems = parseInt(count, 10);
  const totalPages = Math.ceil(totalItems / limit);
  
  // Get media items for current page
  const mediaItems = await db('media_items')
    .select('*')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);
  
  // Get comments for all media items
  const mediaIds = mediaItems.map(item => item.id);
  const comments = mediaIds.length > 0
    ? await db('comments')
        .select('*')
        .whereIn('media_id', mediaIds)
        .orderBy('created_at', 'asc')
    : [];
  
  // Map database records to MediaItem type
  const mappedItems: MediaItem[] = mediaItems.map(item => ({
    id: item.id,
    type: item.type,
    url: item.url,
    thumbnailUrl: item.thumbnail_url || undefined,
    uploaderName: item.uploader_name,
    description: item.description,
    createdAt: item.created_at.toISOString(),
    comments: comments
      .filter(comment => comment.media_id === item.id)
      .map(comment => ({
        id: comment.id,
        mediaId: comment.media_id,
        author: comment.author,
        content: comment.content,
        createdAt: comment.created_at.toISOString()
      }))
  }));
  
  // Calculate next page or null if at the end
  const nextPage = page < totalPages ? page + 1 : null;
  
  return {
    data: mappedItems,
    nextPage,
    totalPages,
    totalItems
  };
};

/**
 * Get a single media item by ID
 */
export const getMediaById = async (id: string): Promise<MediaItem | null> => {
  const mediaItem = await db('media_items')
    .select('*')
    .where({ id })
    .first();
  
  if (!mediaItem) {
    return null;
  }
  
  const comments = await db('comments')
    .select('*')
    .where({ media_id: id })
    .orderBy('created_at', 'asc');
  
  return {
    id: mediaItem.id,
    type: mediaItem.type,
    url: mediaItem.url,
    thumbnailUrl: mediaItem.thumbnail_url || undefined,
    uploaderName: mediaItem.uploader_name,
    description: mediaItem.description,
    createdAt: mediaItem.created_at.toISOString(),
    comments: comments.map(comment => ({
      id: comment.id,
      mediaId: comment.media_id,
      author: comment.author,
      content: comment.content,
      createdAt: comment.created_at.toISOString()
    }))
  };
};

/**
 * Upload a media file to storage and create database record
 */
export const uploadMedia = async (
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  },
  uploaderName: string,
  description: string,
  customFilename?: string
): Promise<MediaItem> => {
  // Determine media type from mimetype
  const type = isVideo(file.mimetype) ? 'video' : 'image';
  
  // Use the provided custom filename or generate a unique one
  const filename = customFilename || generateUniqueFilename(file.originalname);
  
  // Upload file to MinIO
  await minioClient.putObject(
    BUCKET_NAME,
    filename,
    file.buffer,
    {
      'Content-Type': file.mimetype,
    }
  );
  
  // Generate public URL for the uploaded file using our helper function
  // This ensures proper URL formatting without double slashes
  const fileUrl = generatePublicUrl(filename);
  
  // Insert record into database
  const [mediaItem] = await db('media_items')
    .insert({
      type,
      url: fileUrl,
      thumbnail_url: type === 'video' ? fileUrl : null, // In a real app, we'd generate a thumbnail for videos
      uploader_name: uploaderName,
      description
    })
    .returning('*');
  
  // Return the created media item
  return {
    id: mediaItem.id,
    type: mediaItem.type,
    url: mediaItem.url,
    thumbnailUrl: mediaItem.thumbnail_url || undefined,
    uploaderName: mediaItem.uploader_name,
    description: mediaItem.description,
    createdAt: mediaItem.created_at.toISOString(),
    comments: []
  };
};
