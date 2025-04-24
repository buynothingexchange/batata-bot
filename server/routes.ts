import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { initializeBot, initializeBotConfig, getBotStatus, processCommand, restartBot, updateBotConfig } from "./discord-bot";
import { z } from "zod";
import { insertLogSchema } from "@shared/schema";
import OpenAI from "openai";

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize the bot config first
  await initializeBotConfig();
  
  // Then initialize the Discord bot
  await initializeBot();

  // API route to get bot status
  app.get("/api/bot/status", async (req, res) => {
    try {
      const status = await getBotStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting bot status:", error);
      res.status(500).json({ message: "Failed to get bot status" });
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
        commandTrigger: config.commandTrigger,
        reactionEmoji: config.reactionEmoji,
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
        commandTrigger: z.string().min(1),
        reactionEmoji: z.string().min(1)
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
    } catch (error) {
      console.error("Error testing OpenAI API connection:", error);
      res.status(500).json({
        success: false,
        message: "Failed to connect to OpenAI API",
        error: error.message
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
