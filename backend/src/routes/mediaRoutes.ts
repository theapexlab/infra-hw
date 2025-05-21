import { Hono } from 'hono';
import { Context } from 'hono';
import { z } from 'zod';
import { getMediaItems, getMediaById, uploadMedia } from '../services/mediaService';
import { generatePublicUrl, generateUniqueFilename, generatePresignedUrl } from '../services/storageService';
import db from '../config/database';

// Create a new Hono router
const mediaRouter = new Hono();

// Configure middleware for file size limits (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Add middleware to check content length before parsing body
mediaRouter.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
    return c.json({ error: 'File size too large. Maximum allowed is 10MB.' }, 413);
  }
  await next();
});

// Schema validation
const uploadSchema = z.object({
  uploaderName: z.string().min(1, 'Uploader name is required'),
  description: z.string().min(1, 'Description is required')
});

const uploadUrlSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileType: z.string().min(1, 'File type is required'),
  uploaderName: z.string().min(1, 'Uploader name is required'),
  description: z.string().min(1, 'Description is required')
});

// GET /media - Get paginated media items
mediaRouter.get('/', async (c) => {
  const { page, limit } = c.req.query();
  
  try {
    const result = await getMediaItems(
      page ? parseInt(page, 10) : 1, 
      limit ? parseInt(limit, 10) : 12
    );
    
    return c.json(result);
  } catch (error) {
    console.error('Error fetching media items:', error);
    return c.json({ error: 'Failed to fetch media items' }, 500);
  }
});

// GET /media/:id - Get a single media item by ID
mediaRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    const mediaItem = await getMediaById(id);
    
    if (!mediaItem) {
      return c.json({ error: 'Media item not found' }, 404);
    }
    
    return c.json(mediaItem);
  } catch (error) {
    console.error(`Error fetching media item ${id}:`, error);
    return c.json({ error: 'Failed to fetch media item' }, 500);
  }
});

// POST /media - Upload a new media item
mediaRouter.post('/', async (c: Context) => {
  try {
    // Parse multipart form data with Hono's built-in functionality
    const formData = await c.req.parseBody();
    
    // Extract file and other form fields
    const file = formData.file;
    
    // First validate if file exists and is a proper file, not a string
    if (!file || typeof file === 'string') {
      return c.json({ error: 'No file uploaded or invalid file' }, 400);
    }
    
    // Extract other form fields
    const formFields = {
      uploaderName: typeof formData.uploaderName === 'string' ? formData.uploaderName : '',
      description: typeof formData.description === 'string' ? formData.description : ''
    };
    
    // Validate with Zod schema
    const validation = uploadSchema.safeParse(formFields);
    if (!validation.success) {
      // Return the first validation error
      return c.json({ 
        error: validation.error.errors[0].message 
      }, 400);
    }
    
    const { uploaderName, description } = validation.data;
    
    // Read the file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const result = await uploadMedia(
      {
        buffer,
        originalname: file.name,
        mimetype: file.type
      },
      uploaderName,
      description
    );
    
    return c.json(result, 201);
  } catch (error) {
    console.error('Error uploading media:', error);
    return c.json({ error: 'Failed to upload media' }, 500);
  }
});

// POST /media/upload - Upload file directly through the backend server
// This is more reliable than presigned URLs in containerized environments
mediaRouter.post('/direct-upload', async (c: Context) => {
  try {
    // Log raw request details for debugging
    console.log('=== DIRECT UPLOAD REQUEST RECEIVED ===');
    console.log('Content-Type:', c.req.header('content-type'));
    console.log('Request method:', c.req.method);
    
    try {
      // Try to parse the multipart form data
      const formData = await c.req.formData();
      console.log('Form data keys:', [...formData.keys()]);
      
      // Log all form data entries for debugging
      console.log('All form data entries:');
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          console.log(`${key}: File - name: ${value.name}, type: ${value.type}, size: ${value.size}`);
        } else {
          console.log(`${key}: ${value}`);
        }
      }
      
      // Extract file data with detailed debugging
      const file = formData.get('file');
      console.log('File entry type:', file ? (file instanceof File ? 'File object' : typeof file) : 'null');
      
      if (!file) {
        console.log('ERROR: No file provided in form data');
        return c.json({ error: 'No file provided', debug: { formDataKeys: [...formData.keys()] } }, 400);
      }
      
      if (!(file instanceof File)) {
        console.log('ERROR: Provided file is not a File object');
        return c.json({ 
          error: 'Provided file is not a valid File object', 
          debug: { fileType: typeof file, formDataKeys: [...formData.keys()] } 
        }, 400);
      }
      
      // Check if we have an upload token (from the upload-url endpoint)
      const uploadToken = formData.get('uploadToken');
      let uploaderNameStr: string;
      let descriptionStr: string;
      let customObjectName: string | undefined;
      
      if (uploadToken) {
        // If we have a token, parse it to get the metadata
        try {
          const tokenData = JSON.parse(Buffer.from(uploadToken.toString(), 'base64').toString());
          uploaderNameStr = tokenData.uploaderName;
          descriptionStr = tokenData.description;
          customObjectName = tokenData.objectName;
          
          console.log('Using metadata from upload token:', { 
            uploaderName: uploaderNameStr, 
            description: descriptionStr,
            objectName: customObjectName
          });
        } catch (error) {
          console.error('Error parsing upload token:', error);
          // Fall back to form data if token parsing fails
          uploaderNameStr = formData.get('uploaderName')?.toString() || 'Anonymous User';
          descriptionStr = formData.get('description')?.toString() || 'No description provided';
        }
      } else {
        // Extract metadata with fallbacks if no token
        let uploaderName = formData.get('uploaderName');
        let description = formData.get('description');
        
        // Super lenient - if these fields don't exist or are null/undefined, provide defaults
        if (!uploaderName) {
          console.log('WARNING: No uploaderName provided, using default');
          uploaderName = 'Anonymous User';
        }
        
        if (!description) {
          console.log('WARNING: No description provided, using default');
          description = 'No description provided';
        }
        
        // Convert to string to ensure we have valid types
        uploaderNameStr = uploaderName.toString();
        descriptionStr = description.toString();
      }
      
      console.log('Processing upload with:', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        uploaderName: uploaderNameStr,
        description: descriptionStr,
        customObjectName
      });
      
      // Skip schema validation for now to simplify the flow
      // We'll just use the values directly
      
      try {
        // Read the file buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Upload directly to MinIO using the backend service
        const result = await uploadMedia(
          {
            buffer,
            originalname: file.name,
            mimetype: file.type
          },
          uploaderNameStr,
          descriptionStr,
          customObjectName // Pass the custom object name if provided via token
        );
        
        console.log('Upload successful:', result.id);
        return c.json(result, 201);
      } catch (err) {
        const fileProcessingError = err as Error;
        console.error('Error processing file:', fileProcessingError);
        return c.json({ error: 'Error processing file for upload', details: fileProcessingError.message }, 500);
      }
    } catch (err) {
      const formDataError = err as Error;
      console.error('Error parsing form data:', formDataError);
      return c.json({ error: 'Failed to parse form data', details: formDataError.message }, 400);
    }
  } catch (error) {
    console.error('Error with direct upload:', error);
    return c.json({ error: 'Failed to upload media' }, 500);
  }
});

// POST /media/upload-url - Get a presigned URL for direct upload to MinIO
mediaRouter.post('/upload-url', async (c: Context) => {
  try {
    const data = await c.req.json();
    
    // Validate the request data
    const validation = uploadUrlSchema.safeParse(data);
    if (!validation.success) {
      return c.json({ error: validation.error.errors[0].message }, 400);
    }
    
    const { fileName, fileType, uploaderName, description } = validation.data;
    
    // Generate a presigned URL for direct upload to MinIO
    const { presignedUrl, objectName } = await generatePresignedUrl(fileName, fileType);
    
    // Determine media type from content type
    const type = fileType.startsWith('video/') ? 'video' : 'image';
    
    // Generate public URL for accessing the media after upload
    const fileUrl = generatePublicUrl(objectName);
    
    // Create a database record for the media immediately
    // This way we can associate comments with it even before the upload completes
    const [mediaItem] = await db('media_items')
      .insert({
        type,
        url: fileUrl,
        thumbnail_url: type === 'video' ? fileUrl : null,
        uploader_name: uploaderName,
        description
      })
      .returning('*');
    
    // Return the presigned URL and media item ID to the frontend
    return c.json({
      presignedUrl,  // Use this URL for direct upload to MinIO
      mediaId: mediaItem.id,
      objectName
    }, 201);
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return c.json({ error: 'Failed to generate presigned URL' }, 500);
  }
});


export default mediaRouter;
