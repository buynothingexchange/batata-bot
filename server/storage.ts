import {
  users, type User, type InsertUser,
  botConfig, type BotConfig, type InsertBotConfig,
  logs, type Log, type InsertLog,
  allowedChannels, type AllowedChannel, type InsertAllowedChannel,
  isoRequests, type IsoRequest, type InsertIsoRequest,
  forumPosts, type ForumPost, type InsertForumPost,
  confirmedExchanges, type ConfirmedExchange, type InsertConfirmedExchange
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
  
  // ISO request operations
  createIsoRequest(request: InsertIsoRequest): Promise<IsoRequest>;
  getIsoRequestsByUser(userId: string, limit?: number): Promise<IsoRequest[]>;
  getActiveIsoRequests(limit?: number): Promise<IsoRequest[]>;
  updateIsoRequestCategory(id: number, category: string): Promise<IsoRequest | undefined>;
  markIsoRequestFulfilled(id: number): Promise<IsoRequest | undefined>;
  
  // Forum post tracking operations
  createForumPost(post: InsertForumPost): Promise<ForumPost>;
  getForumPost(threadId: string): Promise<ForumPost | undefined>;
  updateForumPostActivity(threadId: string): Promise<ForumPost | undefined>;
  getInactiveForumPosts(daysInactive: number): Promise<ForumPost[]>;
  incrementBumpCount(threadId: string): Promise<ForumPost | undefined>;
  deactivateForumPost(threadId: string): Promise<ForumPost | undefined>;
  getForumPostsByUser(userId: string): Promise<ForumPost[]>;
  
  // Confirmed exchange operations
  createConfirmedExchange(exchange: InsertConfirmedExchange): Promise<ConfirmedExchange>;
  getAllConfirmedExchanges(limit?: number): Promise<ConfirmedExchange[]>;
  getConfirmedExchangesByUser(userId: string): Promise<ConfirmedExchange[]>;
  getConfirmedExchangesByCategory(category: string): Promise<ConfirmedExchange[]>;
  getConfirmedExchangesByDateRange(startDate: Date, endDate: Date): Promise<ConfirmedExchange[]>;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private configs: Map<number, BotConfig>;
  private logEntries: Map<number, Log>;
  private channels: Map<string, AllowedChannel>;
  private isoRequestsMap: Map<number, IsoRequest>;
  private forumPostsMap: Map<string, ForumPost>;
  
  private currentUserId: number;
  private currentConfigId: number;
  private currentLogId: number;
  private currentChannelId: number;
  private currentIsoRequestId: number;
  private currentForumPostId: number;

  constructor() {
    this.users = new Map();
    this.configs = new Map();
    this.logEntries = new Map();
    this.channels = new Map();
    this.isoRequestsMap = new Map();
    this.forumPostsMap = new Map();
    
    this.currentUserId = 1;
    this.currentConfigId = 1;
    this.currentLogId = 1;
    this.currentChannelId = 1;
    this.currentIsoRequestId = 1;
    this.currentForumPostId = 1;
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
      id,
      webhookUrl: config.webhookUrl ?? null,
      token: config.token ?? null,
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
      webhookUrl: config.webhookUrl ?? existingConfig.webhookUrl,
      token: config.token ?? existingConfig.token,
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

  // ISO request operations
  async createIsoRequest(request: any): Promise<any> {
    const id = this.currentIsoRequestId++;
    const isoRequest: any = {
      ...request,
      id,
      fulfilled: false,
      timestamp: new Date()
    };
    
    this.isoRequestsMap.set(id, isoRequest);
    return isoRequest;
  }

  async getIsoRequestsByUser(userId: string, limit: number = 10): Promise<any[]> {
    const userRequests = Array.from(this.isoRequestsMap.values())
      .filter(request => request.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
    
    return userRequests;
  }

  async getActiveIsoRequests(limit: number = 20): Promise<any[]> {
    const activeRequests = Array.from(this.isoRequestsMap.values())
      .filter(request => !request.fulfilled)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
    
    return activeRequests;
  }

  async updateIsoRequestCategory(id: number, category: string): Promise<any | undefined> {
    const request = this.isoRequestsMap.get(id);
    if (!request) return undefined;
    
    const updatedRequest = {
      ...request,
      category
    };
    
    this.isoRequestsMap.set(id, updatedRequest);
    return updatedRequest;
  }

  async markIsoRequestFulfilled(id: number): Promise<any | undefined> {
    const request = this.isoRequestsMap.get(id);
    if (!request) return undefined;
    
    const updatedRequest = {
      ...request,
      fulfilled: true
    };
    
    this.isoRequestsMap.set(id, updatedRequest);
    return updatedRequest;
  }

  // Forum post tracking operations
  async createForumPost(post: InsertForumPost): Promise<ForumPost> {
    const id = this.currentForumPostId++;
    const forumPost: ForumPost = {
      id,
      threadId: post.threadId,
      channelId: post.channelId,
      guildId: post.guildId,
      authorId: post.authorId,
      title: post.title,
      category: post.category,
      lastActivity: post.lastActivity || new Date(),
      createdAt: new Date(),
      bumpCount: post.bumpCount || 0,
      isActive: post.isActive !== undefined ? post.isActive : true
    };
    
    this.forumPostsMap.set(post.threadId, forumPost);
    return forumPost;
  }

  async getForumPost(threadId: string): Promise<ForumPost | undefined> {
    return this.forumPostsMap.get(threadId);
  }

  async updateForumPostActivity(threadId: string): Promise<ForumPost | undefined> {
    const post = this.forumPostsMap.get(threadId);
    if (!post) return undefined;
    
    const updatedPost = {
      ...post,
      lastActivity: new Date()
    };
    
    this.forumPostsMap.set(threadId, updatedPost);
    return updatedPost;
  }

  async getInactiveForumPosts(daysInactive: number): Promise<ForumPost[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);
    
    return Array.from(this.forumPostsMap.values())
      .filter(post => post.isActive && post.lastActivity < cutoffDate);
  }

  async incrementBumpCount(threadId: string): Promise<ForumPost | undefined> {
    const post = this.forumPostsMap.get(threadId);
    if (!post) return undefined;
    
    const updatedPost = {
      ...post,
      bumpCount: post.bumpCount + 1,
      lastActivity: new Date()
    };
    
    this.forumPostsMap.set(threadId, updatedPost);
    return updatedPost;
  }

  async deactivateForumPost(threadId: string): Promise<ForumPost | undefined> {
    const post = this.forumPostsMap.get(threadId);
    if (!post) return undefined;
    
    const updatedPost = {
      ...post,
      isActive: false
    };
    
    this.forumPostsMap.set(threadId, updatedPost);
    return updatedPost;
  }

  async getForumPostsByUser(userId: string): Promise<ForumPost[]> {
    return Array.from(this.forumPostsMap.values())
      .filter(post => post.authorId === userId)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()); // Most recent first
  }

  // Confirmed exchange operations for MemStorage
  async createConfirmedExchange(exchange: InsertConfirmedExchange): Promise<ConfirmedExchange> {
    const id = this.currentForumPostId++; // Reuse counter for simplicity
    const confirmedExchange: ConfirmedExchange = { ...exchange, id };
    return confirmedExchange;
  }

  async getAllConfirmedExchanges(limit: number = 50): Promise<ConfirmedExchange[]> {
    return [];
  }

  async getConfirmedExchangesByUser(userId: string): Promise<ConfirmedExchange[]> {
    return [];
  }

  async getConfirmedExchangesByCategory(category: string): Promise<ConfirmedExchange[]> {
    return [];
  }

  async getConfirmedExchangesByDateRange(startDate: Date, endDate: Date): Promise<ConfirmedExchange[]> {
    return [];
  }
}

// Database storage implementation
import { db } from "./db";
import { eq, desc, and, lt, or, gte, lte } from "drizzle-orm";

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getBotConfig(): Promise<BotConfig | undefined> {
    const [config] = await db.select().from(botConfig).limit(1);
    return config || undefined;
  }

  async createBotConfig(config: InsertBotConfig): Promise<BotConfig> {
    const [newConfig] = await db.insert(botConfig).values(config).returning();
    return newConfig;
  }

  async updateBotConfig(config: Partial<BotConfig>): Promise<BotConfig> {
    const existingConfig = await this.getBotConfig();
    if (!existingConfig) {
      throw new Error('No bot config found to update');
    }
    
    const [updatedConfig] = await db
      .update(botConfig)
      .set(config)
      .where(eq(botConfig.id, existingConfig.id))
      .returning();
    return updatedConfig;
  }

  async getLogs(limit: number = 100): Promise<Log[]> {
    return await db.select().from(logs).orderBy(desc(logs.timestamp)).limit(limit);
  }

  async createLog(insertLog: InsertLog): Promise<Log> {
    const [log] = await db.insert(logs).values(insertLog).returning();
    return log;
  }

  async getAllowedChannels(): Promise<AllowedChannel[]> {
    return await db.select().from(allowedChannels);
  }

  async getChannelById(channelId: string): Promise<AllowedChannel | undefined> {
    const [channel] = await db.select().from(allowedChannels).where(eq(allowedChannels.channelId, channelId));
    return channel || undefined;
  }

  async createAllowedChannel(channel: InsertAllowedChannel): Promise<AllowedChannel> {
    const [newChannel] = await db.insert(allowedChannels).values(channel).returning();
    return newChannel;
  }

  async updateAllowedChannel(channelId: string, enabled: boolean): Promise<AllowedChannel | undefined> {
    const [updatedChannel] = await db
      .update(allowedChannels)
      .set({ enabled })
      .where(eq(allowedChannels.channelId, channelId))
      .returning();
    return updatedChannel || undefined;
  }

  async createIsoRequest(request: InsertIsoRequest): Promise<IsoRequest> {
    const [isoRequest] = await db.insert(isoRequests).values(request).returning();
    return isoRequest;
  }

  async getIsoRequestsByUser(userId: string, limit: number = 10): Promise<IsoRequest[]> {
    return await db.select().from(isoRequests)
      .where(eq(isoRequests.userId, userId))
      .orderBy(desc(isoRequests.timestamp))
      .limit(limit);
  }

  async getActiveIsoRequests(limit: number = 20): Promise<IsoRequest[]> {
    return await db.select().from(isoRequests)
      .where(eq(isoRequests.fulfilled, false))
      .orderBy(desc(isoRequests.timestamp))
      .limit(limit);
  }

  async updateIsoRequestCategory(id: number, category: string): Promise<IsoRequest | undefined> {
    const [updatedRequest] = await db
      .update(isoRequests)
      .set({ category })
      .where(eq(isoRequests.id, id))
      .returning();
    return updatedRequest || undefined;
  }

  async markIsoRequestFulfilled(id: number): Promise<IsoRequest | undefined> {
    const [updatedRequest] = await db
      .update(isoRequests)
      .set({ fulfilled: true })
      .where(eq(isoRequests.id, id))
      .returning();
    return updatedRequest || undefined;
  }

  async createForumPost(post: InsertForumPost): Promise<ForumPost> {
    const [forumPost] = await db.insert(forumPosts).values(post).returning();
    return forumPost;
  }

  async getForumPost(threadId: string): Promise<ForumPost | undefined> {
    const [post] = await db.select().from(forumPosts).where(eq(forumPosts.threadId, threadId));
    return post || undefined;
  }

  async updateForumPostActivity(threadId: string): Promise<ForumPost | undefined> {
    const [updatedPost] = await db
      .update(forumPosts)
      .set({ lastActivity: new Date() })
      .where(eq(forumPosts.threadId, threadId))
      .returning();
    return updatedPost || undefined;
  }

  async getInactiveForumPosts(daysInactive: number): Promise<ForumPost[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);
    
    return await db.select().from(forumPosts)
      .where(and(
        eq(forumPosts.isActive, true),
        lt(forumPosts.lastActivity, cutoffDate)
      ));
  }

  async incrementBumpCount(threadId: string): Promise<ForumPost | undefined> {
    const post = await this.getForumPost(threadId);
    if (!post) return undefined;
    
    const [updatedPost] = await db
      .update(forumPosts)
      .set({ 
        bumpCount: post.bumpCount + 1,
        lastActivity: new Date()
      })
      .where(eq(forumPosts.threadId, threadId))
      .returning();
    return updatedPost || undefined;
  }

  async deactivateForumPost(threadId: string): Promise<ForumPost | undefined> {
    const [updatedPost] = await db
      .update(forumPosts)
      .set({ isActive: false })
      .where(eq(forumPosts.threadId, threadId))
      .returning();
    return updatedPost || undefined;
  }

  async getForumPostsByUser(userId: string): Promise<ForumPost[]> {
    return await db.select().from(forumPosts)
      .where(eq(forumPosts.authorId, userId))
      .orderBy(desc(forumPosts.lastActivity));
  }

  // Confirmed exchange operations
  async createConfirmedExchange(exchange: InsertConfirmedExchange): Promise<ConfirmedExchange> {
    const [newExchange] = await db.insert(confirmedExchanges).values(exchange).returning();
    return newExchange;
  }

  async getAllConfirmedExchanges(limit: number = 50): Promise<ConfirmedExchange[]> {
    return await db.select().from(confirmedExchanges)
      .orderBy(desc(confirmedExchanges.confirmedAt))
      .limit(limit);
  }

  async getConfirmedExchangesByUser(userId: string): Promise<ConfirmedExchange[]> {
    return await db.select().from(confirmedExchanges)
      .where(or(
        eq(confirmedExchanges.originalPosterId, userId),
        eq(confirmedExchanges.tradingPartnerId, userId)
      ))
      .orderBy(desc(confirmedExchanges.confirmedAt));
  }

  async getConfirmedExchangesByCategory(category: string): Promise<ConfirmedExchange[]> {
    return await db.select().from(confirmedExchanges)
      .where(eq(confirmedExchanges.category, category))
      .orderBy(desc(confirmedExchanges.confirmedAt));
  }

  async getConfirmedExchangesByDateRange(startDate: Date, endDate: Date): Promise<ConfirmedExchange[]> {
    return await db.select().from(confirmedExchanges)
      .where(and(
        gte(confirmedExchanges.confirmedAt, startDate),
        lte(confirmedExchanges.confirmedAt, endDate)
      ))
      .orderBy(desc(confirmedExchanges.confirmedAt));
  }
}

export const storage = new DatabaseStorage();
