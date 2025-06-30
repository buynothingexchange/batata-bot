import express from 'express';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { title, description, webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: 'Webhook URL is required' });
    }

    // Upload image to Imgur
    console.log('Uploading image to Imgur...');
    const imgurResponse = await uploadToImgur(req.file.buffer);
    
    if (!imgurResponse.success) {
      return res.status(500).json({ error: 'Failed to upload image to Imgur' });
    }

    const imageUrl = imgurResponse.data.link;
    console.log('Image uploaded to Imgur:', imageUrl);

    // Send data to webhook
    console.log('Sending data to webhook...');
    const webhookData = {
      title: title || '',
      description: description || '',
      imageUrl: imageUrl,
      timestamp: new Date().toISOString()
    };

    const webhookResponse = await axios.post(webhookUrl, webhookData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Webhook response status:', webhookResponse.status);

    res.json({
      success: true,
      message: 'Image uploaded and webhook sent successfully',
      imageUrl: imageUrl,
      webhookResponse: {
        status: webhookResponse.status,
        statusText: webhookResponse.statusText
      }
    });

  } catch (error) {
    console.error('Error processing upload:', error.message);
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  }
});

async function uploadToImgur(imageBuffer) {
  try {
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: 'upload.jpg',
      contentType: 'image/jpeg'
    });

    const response = await axios.post('https://api.imgur.com/3/image', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Client-ID ${process.env.IMGUR_CLIENT_ID || '546c25a59c58ad7'}`
      }
    });

    return response.data;
  } catch (error) {
    console.error('Imgur upload error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
  console.log('Ready to accept image uploads and send to webhooks');
});