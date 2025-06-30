import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { initializeBot, initializeBotConfig, getBotStatus, processCommand, restartBot, updateBotConfig, ensureCategoryChannels, createForumPost } from "./discord-bot-fixed";
import { z } from "zod";
import { insertLogSchema } from "@shared/schema";
import OpenAI from "openai";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";

// Server start time - initialize when module is loaded
const serverStartTime = new Date();

// Image upload function
async function uploadToImgur(imageBuffer: Buffer): Promise<string> {
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

    if (response.data && response.data.success && response.data.data && response.data.data.link) {
      return response.data.data.link;
    } else {
      throw new Error('Invalid response from Imgur');
    }
  } catch (error: any) {
    console.error('Imgur upload error:', error.response?.data || error.message);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

// Calculate server uptime in a human-readable format
function getServerUptime(): string {
  
  const now = new Date();
  const uptime = now.getTime() - serverStartTime.getTime();
  
  const seconds = Math.floor(uptime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize the bot config first
  await initializeBotConfig();
  
  // Initialize the Discord bot asynchronously to not block server startup
  initializeBot().catch(error => {
    console.error('Discord bot initialization failed:', error);
  });

  // API route to get server status and health
  app.get("/api/server/status", (req, res) => {
    try {
      const memoryUsage = process.memoryUsage();
      
      res.json({
        status: "online",
        uptime: getServerUptime(),
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        },
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error getting server status:", error);
      res.status(500).json({ message: `Failed to get server status: ${error?.message || 'Unknown error'}` });
    }
  });
  
  // API route to get health status (simplified for monitoring systems)
  app.get("/api/health", async (req, res) => {
    try {
      // Check Discord bot status
      const botStatus = await getBotStatus();
      
      if (botStatus.status === "online") {
        // Everything is healthy
        return res.status(200).json({
          status: "healthy",
          services: {
            discord: "connected",
            server: "running"
          }
        });
      } else {
        // Bot is having issues
        return res.status(503).json({
          status: "degraded",
          services: {
            discord: "disconnected",
            server: "running"
          },
          message: "Discord bot is not connected"
        });
      }
    } catch (error: any) {
      console.error("Health check failed:", error);
      res.status(500).json({
        status: "unhealthy",
        message: `Failed to perform health check: ${error?.message || 'Unknown error'}`
      });
    }
  });

  // API route to get bot status
  app.get("/api/bot/status", async (req, res) => {
    try {
      const status = await getBotStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Error getting bot status:", error);
      res.status(500).json({ message: `Failed to get bot status: ${error?.message || 'Unknown error'}` });
    }
  });
  
  // API route to get bot configuration
  app.get("/api/bot/config", async (req, res) => {
    try {
      const config = await storage.getBotConfig();
      if (!config) {
        return res.status(404).json({ message: "Bot configuration not found" });
      }
      
      // Get the permissions and channels separately
      const permissions = {
        manageMessages: true,
        addReactions: true,
        readMessageHistory: true
      };
      
      const channels = await storage.getAllowedChannels();
      
      res.json({
        permissions,
        allowedChannels: channels.map(channel => ({
          name: channel.channelName,
          enabled: channel.enabled
        }))
      });
    } catch (error) {
      console.error("Error getting bot config:", error);
      res.status(500).json({ message: "Failed to get bot configuration" });
    }
  });
  
  // API route to update bot configuration
  app.post("/api/bot/config", async (req, res) => {
    try {
      const updateSchema = z.object({
        webhookUrl: z.string().optional(),
        token: z.string().optional()
      });
      
      const validatedData = updateSchema.parse(req.body);
      await storage.updateBotConfig(validatedData);
      
      // Update the bot instance with new configuration
      await updateBotConfig(validatedData);
      
      res.json({ success: true, message: "Configuration updated successfully" });
    } catch (error) {
      console.error("Error updating bot config:", error);
      res.status(500).json({ message: "Failed to update bot configuration" });
    }
  });
  
  // API route to restart the bot
  app.post("/api/bot/restart", async (req, res) => {
    try {
      await restartBot();
      res.json({ success: true, message: "Bot restarted successfully" });
    } catch (error) {
      console.error("Error restarting bot:", error);
      res.status(500).json({ message: "Failed to restart bot" });
    }
  });
  
  // API route to create category channels
  app.post("/api/bot/create-category-channels", async (req, res) => {
    try {
      const result = await ensureCategoryChannels();
      res.json(result);
    } catch (error) {
      console.error("Error creating category channels:", error);
      res.status(500).json({ success: false, message: "Failed to create category channels" });
    }
  });
  
  // API route to test a command
  app.post("/api/bot/test-command", async (req, res) => {
    try {
      const commandSchema = z.object({
        command: z.string().min(1)
      });
      
      const { command } = commandSchema.parse(req.body);
      const result = await processCommand(command);
      
      res.json({ success: true, result });
    } catch (error) {
      console.error("Error processing test command:", error);
      res.status(500).json({ message: "Failed to process test command" });
    }
  });
  
  // API route to get activity logs
  app.get("/api/logs", async (req, res) => {
    try {
      const logs = await storage.getLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error getting logs:", error);
      res.status(500).json({ message: "Failed to get activity logs" });
    }
  });
  
  // API route to test OpenAI API connectivity
  app.get("/api/openai-test", async (req, res) => {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      // Simple test request to OpenAI API
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a test assistant. Reply with 'OpenAI API connection successful!'" },
          { role: "user", content: "Test connection" }
        ],
        max_tokens: 15
      });
      
      // Check if the response is valid
      if (response.choices && response.choices.length > 0) {
        res.json({
          success: true,
          message: "OpenAI API connection test successful",
          response: response.choices[0].message.content
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Received empty response from OpenAI API"
        });
      }
    } catch (error: any) {
      console.error("Error testing OpenAI API connection:", error);
      res.status(500).json({
        success: false,
        message: "Failed to connect to OpenAI API",
        error: error?.message || 'Unknown error'
      });
    }
  });

  // Setup multer for file uploads
  const upload = multer({ storage: multer.memoryStorage() });

  // API endpoint to upload images to Imgur
  app.post("/api/upload-image", upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No image file provided" });
      }

      // Use the same uploadToImgur function from server.js
      const { uploadToImgur } = await import('../server.js');
      const imageUrl = await uploadToImgur(req.file.buffer);
      
      res.json({ 
        success: true, 
        imageUrl: imageUrl 
      });
    } catch (error: any) {
      console.error("Error uploading image:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to upload image",
        error: error.message 
      });
    }
  });

  // API endpoint to handle new post submissions from external image upload server
  app.post("/api/new-post", async (req, res) => {
    try {
      // Validate the incoming data
      const postSchema = z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        category: z.string().min(1),
        type: z.string().min(1), // give, request, trade
        image_url: z.string().url().optional().or(z.literal("")),
        location: z.string().optional()
      });

      const validatedData = postSchema.parse(req.body);
      
      // Import the createForumPost function (we'll need to implement this)
      const { createForumPost } = await import('./discord-bot-fixed');
      
      // Create forum post in Discord with the provided data
      const result = await createForumPost({
        title: validatedData.title,
        description: validatedData.description,
        category: validatedData.category,
        type: validatedData.type,
        imageUrl: validatedData.image_url,
        location: validatedData.location,
        userId: 'external-form', // Special identifier for external submissions
        username: 'External Form'
      });

      if (result.success) {
        res.json({ 
          success: true, 
          message: "Post created successfully in Discord forum",
          threadId: result.threadId 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: result.error || "Failed to create forum post" 
        });
      }

    } catch (error: any) {
      console.error("Error processing new post submission:", error);
      
      if (error.name === 'ZodError') {
        res.status(400).json({ 
          success: false, 
          message: "Invalid data format",
          errors: error.errors 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: "Failed to process submission",
          error: error?.message || 'Unknown error'
        });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
