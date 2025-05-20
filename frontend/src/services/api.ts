import axios from 'axios';
import type { MediaItem, Comment, PaginatedResponse } from 'shared-types';

// Create an axios instance with common configuration
const api = axios.create({
  baseURL: '/api', // This would be replaced with your actual API URL in production
  headers: {
    'Content-Type': 'application/json',
  },
});

// Mock data for development
const mockMedia: MediaItem[] = Array.from({ length: 50 }, (_, i) => ({
  id: `media-${i}`,
  type: i % 3 === 0 ? 'video' : 'image',
  url: i % 3 === 0 
    ? `https://placehold.co/600x400/random?text=Video+${i}` 
    : `https://placehold.co/600x400/random?text=Image+${i}`,
  thumbnailUrl: i % 3 === 0 ? `https://placehold.co/300x200/random?text=Thumbnail+${i}` : undefined,
  uploaderName: `User${i % 10}`,
  description: `This is a ${i % 3 === 0 ? 'video' : 'image'} description ${i}`,
  createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  comments: Array.from({ length: i % 5 }, (_, j) => ({
    id: `comment-${i}-${j}`,
    mediaId: `media-${i}`,
    author: `Commenter${j}`,
    content: `This is comment ${j} on media ${i}`,
    createdAt: new Date(Date.now() - j * 3600000).toISOString(),
  })),
}));

// Media API
export const mediaApi = {
  // Get paginated media
  getMedia: async (page = 1, limit = 12): Promise<PaginatedResponse<MediaItem>> => {
    // For development, we'll use mock data
    // In production, this would be: return api.get(`/media?page=${page}&limit=${limit}`).then(res => res.data);
    
    const start = (page - 1) * limit;
    const end = start + limit;
    const items = mockMedia.slice(start, end);
    
    return {
      data: items,
      nextPage: end < mockMedia.length ? page + 1 : null,
      totalPages: Math.ceil(mockMedia.length / limit),
      totalItems: mockMedia.length,
    };
  },
  
  // Get a single media item by ID
  getMediaById: async (id: string): Promise<MediaItem> => {
    // For development, we'll use mock data
    // In production, this would be: return api.get(`/media/${id}`).then(res => res.data);
    
    const media = mockMedia.find(item => item.id === id);
    if (!media) {
      throw new Error('Media not found');
    }
    return media;
  },
  
  // Upload a new media item
  uploadMedia: async (formData: FormData): Promise<MediaItem> => {
    // For development, we'll just return a mock response
    // In production, this would be: return api.post('/media', formData).then(res => res.data);
    
    return {
      id: `media-${mockMedia.length}`,
      type: formData.get('type') as 'image' | 'video',
      url: URL.createObjectURL(formData.get('file') as File),
      uploaderName: formData.get('uploaderName') as string,
      description: formData.get('description') as string,
      createdAt: new Date().toISOString(),
      comments: [],
    };
  },
  
  // Add a comment to a media item
  addComment: async (mediaId: string, comment: { author: string; content: string }): Promise<Comment> => {
    // For development, we'll just return a mock response
    // In production, this would be: return api.post(`/media/${mediaId}/comments`, comment).then(res => res.data);
    
    return {
      id: `comment-${mediaId}-${Date.now()}`,
      mediaId,
      author: comment.author,
      content: comment.content,
      createdAt: new Date().toISOString(),
    };
  }
};

export default api;
