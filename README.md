# Image Upload Form Server

A simple Express.js server that provides an HTML form for uploading images to Imgur and sending the result to a webhook.

## Features

- Clean, responsive HTML form interface
- Image upload to Imgur with automatic hosting
- Send image URL + form data to external webhook
- Drag & drop file upload support
- Image preview before upload
- Real-time upload progress feedback
- Error handling and validation

## How to Use

1. **Start the server:**
   ```bash
   node server.js
   ```

2. **Access the form:**
   Open your browser to `http://localhost:3000`

3. **Fill out the form:**
   - **Title**: Optional title for your image
   - **Description**: Optional description for your image
   - **Webhook URL**: Required - the URL where the data will be sent
   - **Image**: Required - select an image file (JPG, PNG, GIF, etc.)

4. **Submit:**
   - Click "Upload & Send to Webhook"
   - The image will be uploaded to Imgur
   - The form data + image URL will be sent to your webhook

## Webhook Payload

Your webhook will receive a JSON POST request with this structure:

```json
{
  "title": "Image Title",
  "description": "Image Description", 
  "imageUrl": "https://i.imgur.com/xxxxxx.jpg",
  "timestamp": "2023-12-07T12:34:56.789Z"
}
```

## Environment Variables

- `IMGUR_CLIENT_ID`: Optional - Your Imgur API client ID (defaults to a public one)
- `PORT`: Optional - Server port (defaults to 3000)

## File Size Limits

- Maximum file size: 10MB
- Supported formats: All image types (JPG, PNG, GIF, WebP, etc.)

## API Endpoints

- `GET /` - Serves the HTML form
- `POST /upload` - Handles image upload and webhook sending

## Dependencies

- express: Web server framework
- multer: File upload handling
- axios: HTTP requests
- form-data: Multipart form data for Imgur API
- cors: Cross-origin resource sharing

## Error Handling

The server includes comprehensive error handling for:
- Invalid file types
- File size limits
- Imgur API failures
- Webhook delivery failures
- Network connectivity issues

## Security Notes

- Files are processed in memory (not saved to disk)
- File type validation prevents non-image uploads
- CORS enabled for cross-origin requests
- Input validation on all form fields