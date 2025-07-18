import {
  users, type User, type InsertUser,
  botConfig, type BotConfig, type InsertBotConfig,
  logs, type Log, type InsertLog,
  allowedChannels, type AllowedChannel, type InsertAllowedChannel,
  isoRequests, type IsoRequest, type InsertIsoRequest,
  forumPosts, type ForumPost, type InsertForumPost,
  confirmedExchanges, type ConfirmedExchange, type InsertConfirmedExchange,
  donationGoals, type DonationGoal, type InsertDonationGoal,
  donations, type Donation, type InsertDonation,
  formTokens, type FormToken, type InsertFormToken,
  pendingClaims, type PendingClaim, type InsertPendingClaim
} from "../shared/schema.js";

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
  getForumPostByThreadId(threadId: string): Promise<ForumPost | undefined>;
  updateForumPost(threadId: string, updates: Partial<ForumPost>): Promise<ForumPost | undefined>;
  updateForumPostActivity(threadId: string): Promise<ForumPost | undefined>;
  getInactiveForumPosts(daysInactive: number): Promise<ForumPost[]>;
  incrementBumpCount(threadId: string): Promise<ForumPost | undefined>;
  deactivateForumPost(threadId: string): Promise<ForumPost | undefined>;
  getForumPostsByUser(userId: string): Promise<ForumPost[]>;
  getAllActiveForumPosts(): Promise<ForumPost[]>;
  
  // Confirmed exchange operations
  createConfirmedExchange(exchange: InsertConfirmedExchange): Promise<ConfirmedExchange>;
  getAllConfirmedExchanges(limit?: number): Promise<ConfirmedExchange[]>;
  getConfirmedExchangesByUser(userId: string): Promise<ConfirmedExchange[]>;
  getConfirmedExchangesByCategory(category: string): Promise<ConfirmedExchange[]>;
  getConfirmedExchangesByDateRange(startDate: Date, endDate: Date): Promise<ConfirmedExchange[]>;
  
  // Donation tracking operations
  createDonationGoal(goal: InsertDonationGoal): Promise<DonationGoal>;
  getActiveDonationGoals(guildId: string): Promise<DonationGoal[]>;
  getDonationGoalByMessage(messageId: string): Promise<DonationGoal | undefined>;
  updateDonationGoalAmount(goalId: number, newAmount: number): Promise<DonationGoal | undefined>;
  deactivateDonationGoal(goalId: number): Promise<DonationGoal | undefined>;
  
  // Donation records operations
  createDonation(donation: InsertDonation): Promise<Donation>;
  getAllDonations(limit?: number): Promise<Donation[]>;
  getDonationsByDateRange(startDate: Date, endDate: Date): Promise<Donation[]>;
  getTotalDonationAmount(): Promise<number>;

  // Form Token operations
  createFormToken(token: InsertFormToken): Promise<FormToken>;
  getFormToken(token: string): Promise<FormToken | undefined>;
  markFormTokenUsed(token: string): Promise<void>;
  cleanupExpiredTokens(): Promise<void>;

  // Pending Claims operations
  createPendingClaim(claim: InsertPendingClaim): Promise<PendingClaim>;
  getPendingClaimByUser(authorId: string, channelId: string): Promise<PendingClaim | undefined>;
  markPendingClaimProcessed(id: number): Promise<void>;
  cleanupExpiredClaims(): Promise<void>;
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

  async getForumPostByThreadId(threadId: string): Promise<ForumPost | undefined> {
    return this.getForumPost(threadId);
  }

  async updateForumPost(threadId: string, updates: Partial<ForumPost>): Promise<ForumPost | undefined> {
    const post = this.forumPostsMap.get(threadId);
    if (!post) return undefined;
    
    const updatedPost = {
      ...post,
      ...updates
    };
    
    this.forumPostsMap.set(threadId, updatedPost);
    return updatedPost;
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

  async getAllActiveForumPosts(): Promise<ForumPost[]> {
    return Array.from(this.forumPostsMap.values())
      .filter(post => post.isActive)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  // Confirmed exchange operations for MemStorage
  async createConfirmedExchange(exchange: InsertConfirmedExchange): Promise<ConfirmedExchange> {
    const id = this.currentForumPostId++; // Reuse counter for simplicity
    const confirmedExchange: ConfirmedExchange = { 
      ...exchange, 
      id,
      confirmedAt: new Date()
    };
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

  // Donation tracking operations for MemStorage
  async createDonationGoal(goal: InsertDonationGoal): Promise<DonationGoal> {
    const id = this.currentForumPostId++; // Reuse counter for simplicity
    const donationGoal: DonationGoal = { 
      ...goal, 
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return donationGoal;
  }

  async getActiveDonationGoals(guildId: string): Promise<DonationGoal[]> {
    return [];
  }

  async getDonationGoalByMessage(messageId: string): Promise<DonationGoal | undefined> {
    return undefined;
  }

  async updateDonationGoalAmount(goalId: number, newAmount: number): Promise<DonationGoal | undefined> {
    return undefined;
  }

  async deactivateDonationGoal(goalId: number): Promise<DonationGoal | undefined> {
    return undefined;
  }

  // Donation records operations for MemStorage
  async createDonation(donation: InsertDonation): Promise<Donation> {
    const id = this.currentForumPostId++; // Reuse counter for simplicity
    const donationRecord: Donation = { 
      ...donation, 
      id,
      timestamp: new Date()
    };
    return donationRecord;
  }

  async getAllDonations(limit: number = 50): Promise<Donation[]> {
    return [];
  }

  async getDonationsByDateRange(startDate: Date, endDate: Date): Promise<Donation[]> {
    return [];
  }

  async getTotalDonationAmount(): Promise<number> {
    return 0;
  }

  // Form Token operations for MemStorage (stub implementations)
  async createFormToken(token: InsertFormToken): Promise<FormToken> {
    const id = this.currentForumPostId++; // Reuse counter for simplicity
    const formToken: FormToken = { 
      ...token, 
      id,
      createdAt: new Date(),
      used: false
    };
    return formToken;
  }

  async getFormToken(token: string): Promise<FormToken | undefined> {
    // Stub implementation for MemStorage
    return undefined;
  }

  async markFormTokenUsed(token: string): Promise<void> {
    // Stub implementation for MemStorage
  }

  async cleanupExpiredTokens(): Promise<void> {
    // Stub implementation for MemStorage
  }

  // Pending Claims operations for MemStorage (stub implementations)
  async createPendingClaim(claim: InsertPendingClaim): Promise<PendingClaim> {
    const id = this.currentForumPostId++; // Reuse counter for simplicity
    const pendingClaim: PendingClaim = { 
      ...claim, 
      id,
      createdAt: new Date(),
      processed: false
    };
    return pendingClaim;
  }

  async getPendingClaimByUser(authorId: string, channelId: string): Promise<PendingClaim | undefined> {
    // Stub implementation for MemStorage
    return undefined;
  }

  async markPendingClaimProcessed(id: number): Promise<void> {
    // Stub implementation for MemStorage
  }

  async cleanupExpiredClaims(): Promise<void> {
    // Stub implementation for MemStorage
  }
}

// Database storage implementation
import { db } from "./db.js";
import { and, eq, desc, gte, lte, lt, or, sum, gt } from "drizzle-orm";

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

  async getForumPostByThreadId(threadId: string): Promise<ForumPost | undefined> {
    return this.getForumPost(threadId);
  }

  async updateForumPost(threadId: string, updates: Partial<ForumPost>): Promise<ForumPost | undefined> {
    const [updatedPost] = await db
      .update(forumPosts)
      .set(updates)
      .where(eq(forumPosts.threadId, threadId))
      .returning();
    return updatedPost || undefined;
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

  async getAllActiveForumPosts(): Promise<ForumPost[]> {
    return await db.select().from(forumPosts)
      .where(eq(forumPosts.isActive, true))
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

  // Donation tracking operations
  async createDonationGoal(goal: InsertDonationGoal): Promise<DonationGoal> {
    const [donationGoal] = await db.insert(donationGoals).values(goal).returning();
    return donationGoal;
  }

  async getActiveDonationGoals(guildId: string): Promise<DonationGoal[]> {
    return await db.select().from(donationGoals)
      .where(and(
        eq(donationGoals.guildId, guildId),
        eq(donationGoals.isActive, true)
      ))
      .orderBy(desc(donationGoals.createdAt));
  }

  async getDonationGoalByMessage(messageId: string): Promise<DonationGoal | undefined> {
    const [goal] = await db.select().from(donationGoals)
      .where(eq(donationGoals.messageId, messageId))
      .limit(1);
    return goal || undefined;
  }

  async updateDonationGoalAmount(goalId: number, newAmount: number): Promise<DonationGoal | undefined> {
    const [updatedGoal] = await db
      .update(donationGoals)
      .set({ 
        currentAmount: newAmount,
        updatedAt: new Date()
      })
      .where(eq(donationGoals.id, goalId))
      .returning();
    return updatedGoal || undefined;
  }

  async deactivateDonationGoal(goalId: number): Promise<DonationGoal | undefined> {
    const [deactivatedGoal] = await db
      .update(donationGoals)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(donationGoals.id, goalId))
      .returning();
    return deactivatedGoal || undefined;
  }

  // Donation records operations
  async createDonation(donation: InsertDonation): Promise<Donation> {
    const [donationRecord] = await db.insert(donations).values(donation).returning();
    return donationRecord;
  }

  async getAllDonations(limit: number = 50): Promise<Donation[]> {
    return await db.select().from(donations)
      .orderBy(desc(donations.timestamp))
      .limit(limit);
  }

  async getDonationsByDateRange(startDate: Date, endDate: Date): Promise<Donation[]> {
    return await db.select().from(donations)
      .where(and(
        gte(donations.timestamp, startDate),
        lte(donations.timestamp, endDate)
      ))
      .orderBy(desc(donations.timestamp));
  }

  async getTotalDonationAmount(): Promise<number> {
    const result = await db
      .select({ total: sum(donations.amount) })
      .from(donations);
    return Number(result[0]?.total || 0);
  }

  // Form Token operations
  async createFormToken(token: InsertFormToken): Promise<FormToken> {
    const [formToken] = await db.insert(formTokens).values(token).returning();
    return formToken;
  }

  async getFormToken(token: string): Promise<FormToken | undefined> {
    const [formToken] = await db.select().from(formTokens)
      .where(and(
        eq(formTokens.token, token),
        eq(formTokens.used, false),
        gt(formTokens.expiresAt, new Date())
      ));
    return formToken || undefined;
  }

  async markFormTokenUsed(token: string): Promise<void> {
    await db.update(formTokens)
      .set({ used: true })
      .where(eq(formTokens.token, token));
  }

  async cleanupExpiredTokens(): Promise<void> {
    await db.delete(formTokens)
      .where(or(
        eq(formTokens.used, true),
        lt(formTokens.expiresAt, new Date())
      ));
  }

  // Pending Claims operations
  async createPendingClaim(claim: InsertPendingClaim): Promise<PendingClaim> {
    const [newClaim] = await db.insert(pendingClaims).values(claim).returning();
    return newClaim;
  }

  async getPendingClaimByUser(authorId: string, channelId: string): Promise<PendingClaim | undefined> {
    const [claim] = await db.select().from(pendingClaims)
      .where(and(
        eq(pendingClaims.authorId, authorId),
        eq(pendingClaims.channelId, channelId),
        eq(pendingClaims.processed, false),
        gt(pendingClaims.expiresAt, new Date())
      ))
      .limit(1);
    return claim || undefined;
  }

  async markPendingClaimProcessed(id: number): Promise<void> {
    await db.update(pendingClaims)
      .set({ processed: true })
      .where(eq(pendingClaims.id, id));
  }

  async cleanupExpiredClaims(): Promise<void> {
    await db.delete(pendingClaims)
      .where(or(
        eq(pendingClaims.processed, true),
        lt(pendingClaims.expiresAt, new Date())
      ));
  }
}

export const storage = new DatabaseStorage();
