/**
 * Media item interface representing an image or video
 */
export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  uploaderName: string;
  description: string;
  createdAt: string;
  comments: Comment[];
}

/**
 * Comment interface for comments on media items
 */
export interface Comment {
  id: string;
  mediaId: string;
  author: string;
  content: string;
  createdAt: string;
}

/**
 * Generic paginated response interface for API endpoints
 */
export interface PaginatedResponse<T> {
  data: T[];
  nextPage: number | null;
  totalPages: number;
  totalItems: number;
}

/**
 * Media upload request interface
 */
export interface MediaUploadRequest {
  file: File;
  uploaderName: string;
  description: string;
  type: 'image' | 'video';
}

/**
 * Comment creation request interface
 */
export interface CommentCreateRequest {
  author: string;
  content: string;
}
