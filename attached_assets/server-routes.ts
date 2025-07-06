// Copy this file as: server/routes.ts
// API routes for Batata Discord Bot

import { Express } from 'express';
import multer from 'multer';
import FormData from 'form-data';
import { storage, log } from './storage';
import { createForumPost } from './discord-bot-fixed';

// Set up multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload image to Imgur
async function uploadToImgur(imageBuffer: Buffer): Promise<string> {
  const clientId = process.env.IMGUR_CLIENT_ID;
  if (!clientId) {
    throw new Error('Imgur client ID not configured');
  }

  const formData = new FormData();
  formData.append('image', imageBuffer);

  const response = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      'Authorization': `Client-ID ${clientId}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Imgur upload failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data.link;
}

// Get server uptime
function getServerUptime(): string {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

export async function registerRoutes(app: Express) {
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: getServerUptime()
    });
  });

  // Get bot status
  app.get('/api/bot/status', async (req, res) => {
    try {
      const { getBotStatus } = await import('./discord-bot-fixed');
      const status = await getBotStatus();
      res.json(status);
    } catch (error) {
      log(`Error getting bot status: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to get bot status' });
    }
  });

  // Get bot configuration
  app.get('/api/bot/config', async (req, res) => {
    try {
      const config = await storage.getBotConfig();
      
      if (!config) {
        return res.json({ 
          configured: false,
          permissions: {
            manageMessages: true,
            addReactions: true,
            embedLinks: true
          }
        });
      }

      res.json({
        configured: true,
        hasToken: !!config.token,
        hasWebhook: !!config.webhookUrl,
        permissions: {
          manageMessages: true,
          addReactions: true,
          embedLinks: true
        }
      });
    } catch (error) {
      log(`Error getting bot config: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to get bot configuration' });
    }
  });

  // Update bot configuration
  app.post('/api/bot/config', async (req, res) => {
    try {
      const { token, webhookUrl } = req.body;
      
      await storage.updateBotConfig({
        token,
        webhookUrl
      });

      // Restart bot if token was updated
      if (token) {
        const { restartBot } = await import('./discord-bot-fixed');
        await restartBot();
      }

      res.json({ success: true });
    } catch (error) {
      log(`Error updating bot config: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to update bot configuration' });
    }
  });

  // Get logs
  app.get('/api/logs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getLogs(limit);
      res.json(logs);
    } catch (error) {
      log(`Error getting logs: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to get logs' });
    }
  });

  // Process bot commands
  app.post('/api/bot/command', async (req, res) => {
    try {
      const { command } = req.body;
      
      if (!command) {
        return res.status(400).json({ error: 'Command is required' });
      }

      const { processCommand } = await import('./discord-bot-fixed');
      const result = await processCommand(command);
      
      res.json(result);
    } catch (error) {
      log(`Error processing command: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to process command' });
    }
  });

  // Validate form token
  app.get('/api/validate-token/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      const tokenData = await storage.getFormToken(token);
      
      if (!tokenData) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      if (tokenData.used) {
        return res.status(401).json({ error: 'Token already used' });
      }
      
      if (new Date() > tokenData.expiresAt) {
        return res.status(401).json({ error: 'Token expired' });
      }
      
      res.json({
        valid: true,
        userId: tokenData.userId,
        username: tokenData.username
      });
    } catch (error) {
      log(`Error validating token: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to validate token' });
    }
  });

  // Upload image
  app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const imageUrl = await uploadToImgur(req.file.buffer);
      
      log(`Image uploaded to Imgur: ${imageUrl}`, "routes");
      res.json({ url: imageUrl });
    } catch (error) {
      log(`Error uploading image: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to upload image' });
    }
  });

  // Create new post (from external form)
  app.post('/api/new-post', async (req, res) => {
    try {
      const {
        title,
        description,
        category,
        type,
        image_url,
        username,
        user_id,
        lat,
        lng
      } = req.body;

      // Validate required fields
      if (!title || !description || !category || !type || !username) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Create forum post
      await createForumPost({
        title,
        description,
        category,
        type,
        image_url,
        username,
        user_id,
        lat,
        lng
      });

      log(`Created forum post: ${title} by ${username}`, "routes");
      res.json({ success: true, message: 'Post created successfully' });
    } catch (error) {
      log(`Error creating forum post: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to create post' });
    }
  });

  // Ko-fi webhook
  app.post('/kofi', async (req, res) => {
    try {
      const kofiData = req.body;
      
      log(`Received Ko-fi webhook data: ${JSON.stringify(kofiData)}`, "kofi");
      
      // Parse Ko-fi data
      let data;
      if (typeof kofiData.data === 'string') {
        data = JSON.parse(kofiData.data);
      } else {
        data = kofiData.data || kofiData;
      }

      // Create donation record
      const donationData = {
        kofiTransactionId: data.kofi_transaction_id,
        donorName: data.from_name || 'Anonymous',
        amount: Math.round(parseFloat(data.amount) * 100), // Convert to cents
        message: data.message || '',
        isPublic: data.is_public !== false,
        createdAt: new Date()
      };

      const { processKofiDonation } = await import('./discord-bot-fixed');
      await processKofiDonation(donationData);

      log(`Processed Ko-fi donation: ${donationData.amount} cents from ${donationData.donorName}`, "kofi");
      res.json({ success: true });
    } catch (error) {
      log(`Error processing Ko-fi webhook: ${error}`, "kofi");
      res.status(500).json({ error: 'Failed to process donation' });
    }
  });

  // Get exchange statistics
  app.get('/api/stats/exchanges', async (req, res) => {
    try {
      const exchanges = await storage.getAllConfirmedExchanges();
      
      const stats = {
        total: exchanges.length,
        thisMonth: exchanges.filter(ex => {
          const exchangeDate = new Date(ex.confirmedAt);
          const now = new Date();
          return exchangeDate.getMonth() === now.getMonth() && 
                 exchangeDate.getFullYear() === now.getFullYear();
        }).length,
        categories: exchanges.reduce((acc: any, ex) => {
          acc[ex.category] = (acc[ex.category] || 0) + 1;
          return acc;
        }, {}),
        recentExchanges: exchanges.slice(-5).reverse()
      };
      
      res.json(stats);
    } catch (error) {
      log(`Error getting exchange stats: ${error}`, "routes");
      res.status(500).json({ error: 'Failed to get exchange statistics' });
    }
  });

  // Serve exchange form
  app.get('/exchange', (req, res) => {
    const token = req.query.token;
    
    if (!token) {
      return res.status(400).send('Missing access token');
    }
    
    // In a real implementation, you'd serve the React app here
    // For now, we'll redirect to the frontend route
    res.redirect(`/#/exchange?token=${token}`);
  });

  log("API routes registered successfully", "routes");
}