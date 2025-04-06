import {
  users, type User, type InsertUser,
  botConfig, type BotConfig, type InsertBotConfig,
  logs, type Log, type InsertLog,
  allowedChannels, type AllowedChannel, type InsertAllowedChannel
} from "@shared/schema";

// Storage interface for bot-related data
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Bot configuration operations
  getBotConfig(): Promise<BotConfig | undefined>;
  createBotConfig(config: InsertBotConfig): Promise<BotConfig>;
  updateBotConfig(config: Partial<BotConfig>): Promise<BotConfig>;
  
  // Activity logs operations
  getLogs(limit?: number): Promise<Log[]>;
  createLog(log: InsertLog): Promise<Log>;
  
  // Allowed channels operations
  getAllowedChannels(): Promise<AllowedChannel[]>;
  getChannelById(channelId: string): Promise<AllowedChannel | undefined>;
  createAllowedChannel(channel: InsertAllowedChannel): Promise<AllowedChannel>;
  updateAllowedChannel(channelId: string, enabled: boolean): Promise<AllowedChannel | undefined>;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private configs: Map<number, BotConfig>;
  private logEntries: Map<number, Log>;
  private channels: Map<string, AllowedChannel>;
  
  private currentUserId: number;
  private currentConfigId: number;
  private currentLogId: number;
  private currentChannelId: number;

  constructor() {
    this.users = new Map();
    this.configs = new Map();
    this.logEntries = new Map();
    this.channels = new Map();
    
    this.currentUserId = 1;
    this.currentConfigId = 1;
    this.currentLogId = 1;
    this.currentChannelId = 1;
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  
  // Bot configuration operations
  async getBotConfig(): Promise<BotConfig | undefined> {
    // Always return the first config if it exists
    const configs = Array.from(this.configs.values());
    return configs.length > 0 ? configs[0] : undefined;
  }
  
  async createBotConfig(config: InsertBotConfig): Promise<BotConfig> {
    const id = this.currentConfigId++;
    const timestamp = new Date();
    const newConfig: BotConfig = { 
      ...config, 
      id,
      updatedAt: timestamp
    };
    
    this.configs.set(id, newConfig);
    return newConfig;
  }
  
  async updateBotConfig(config: Partial<BotConfig>): Promise<BotConfig> {
    const existingConfig = await this.getBotConfig();
    
    if (!existingConfig) {
      throw new Error("No configuration found to update");
    }
    
    const updatedConfig: BotConfig = {
      ...existingConfig,
      ...config,
      updatedAt: new Date()
    };
    
    this.configs.set(existingConfig.id, updatedConfig);
    return updatedConfig;
  }
  
  // Activity logs operations
  async getLogs(limit: number = 100): Promise<Log[]> {
    const logs = Array.from(this.logEntries.values());
    return logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
  
  async createLog(insertLog: InsertLog): Promise<Log> {
    const id = this.currentLogId++;
    const timestamp = new Date();
    
    const log: Log = {
      ...insertLog,
      id,
      timestamp
    };
    
    this.logEntries.set(id, log);
    return log;
  }
  
  // Allowed channels operations
  async getAllowedChannels(): Promise<AllowedChannel[]> {
    return Array.from(this.channels.values());
  }
  
  async getChannelById(channelId: string): Promise<AllowedChannel | undefined> {
    return this.channels.get(channelId);
  }
  
  async createAllowedChannel(channel: InsertAllowedChannel): Promise<AllowedChannel> {
    const id = this.currentChannelId++;
    
    const newChannel: AllowedChannel = {
      ...channel,
      id
    };
    
    this.channels.set(channel.channelId, newChannel);
    return newChannel;
  }
  
  async updateAllowedChannel(channelId: string, enabled: boolean): Promise<AllowedChannel | undefined> {
    const channel = await this.getChannelById(channelId);
    
    if (!channel) {
      return undefined;
    }
    
    const updatedChannel: AllowedChannel = {
      ...channel,
      enabled
    };
    
    this.channels.set(channelId, updatedChannel);
    return updatedChannel;
  }
}

export const storage = new MemStorage();
