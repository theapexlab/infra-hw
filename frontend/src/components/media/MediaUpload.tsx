import { useState, useRef } from 'react';
import { mediaApi } from '../../services/api';
import '../../styles/MediaUpload.css';

interface MediaUploadProps {
  onUploadSuccess: () => void;
  onCancel: () => void;
}

export const MediaUpload = ({ onUploadSuccess, onCancel }: MediaUploadProps) => {
  const [uploaderName, setUploaderName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Check if the selected file is an image or video
    if (!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
      setError('Please select an image or video file');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Create a preview URL
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file || !uploaderName.trim() || !description.trim()) {
      setError('Please fill out all fields and select a file');
      return;
    }

    try {
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploaderName', uploaderName);
      formData.append('description', description);
      formData.append('type', file.type.startsWith('image/') ? 'image' : 'video');
      
      await mediaApi.uploadMedia(formData);
      
      setIsUploading(false);
      onUploadSuccess();
    } catch (error) {
      console.error('Upload failed:', error);
      setError('Failed to upload media. Please try again.');
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    // Clean up any preview URLs before canceling
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    onCancel();
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="upload-backdrop">
      <div className="upload-container">
        <h2>Upload Media</h2>
        
        {error && <div className="upload-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="upload-form">
          <div className="form-group">
            <label htmlFor="uploaderName">Your Name:</label>
            <input
              type="text"
              id="uploaderName"
              value={uploaderName}
              onChange={(e) => setUploaderName(e.target.value)}
              placeholder="Enter your name"
              required
              disabled={isUploading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="description">Description:</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description for your media"
              required
              disabled={isUploading}
            ></textarea>
          </div>
          
          <div className="form-group file-upload">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              style={{ display: 'none' }}
              disabled={isUploading}
            />
            
            <button 
              type="button" 
              onClick={triggerFileInput}
              className="select-file-btn"
              disabled={isUploading}
            >
              Select File
            </button>
            
            <span className="selected-file">
              {file ? file.name : 'No file selected'}
            </span>
          </div>
          
          {previewUrl && (
            <div className="preview">
              {file?.type.startsWith('image/') ? (
                <img src={previewUrl} alt="Preview" className="preview-image" />
              ) : (
                <video src={previewUrl} className="preview-video" controls>
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          )}
          
          <div className="form-actions">
            <button 
              type="button" 
              onClick={handleCancel}
              className="cancel-btn"
              disabled={isUploading}
            >
              Cancel
            </button>
            
            <button 
              type="submit" 
              className="upload-btn"
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MediaUpload;
