// Copy this file as: server/storage.ts
// Data storage interface and implementation for Batata Discord Bot

import { 
  users, logs, botConfig, allowedChannels, isoRequests, forumPosts, 
  confirmedExchanges, donationGoals, donations, formTokens, pendingClaims,
  type User, type InsertUser, type Log, type InsertLog, type BotConfig, type InsertBotConfig,
  type AllowedChannel, type InsertAllowedChannel, type ISORequest, type InsertISORequest,
  type ForumPost, type InsertForumPost, type ConfirmedExchange, type InsertConfirmedExchange,
  type DonationGoal, type InsertDonationGoal, type Donation, type InsertDonation,
  type FormToken, type InsertFormToken, type PendingClaim, type InsertPendingClaim
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte } from "drizzle-orm";

// Storage interface definition
export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByDiscordId(discordId: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;

  // Logging
  createLog(insertLog: InsertLog): Promise<Log>;
  getLogs(limit?: number): Promise<Log[]>;

  // Bot configuration
  getBotConfig(): Promise<BotConfig | undefined>;
  updateBotConfig(config: Partial<BotConfig>): Promise<void>;

  // Channel management
  getAllowedChannels(): Promise<AllowedChannel[]>;
  createAllowedChannel(channel: InsertAllowedChannel): Promise<AllowedChannel>;

  // ISO requests
  createISORequest(request: InsertISORequest): Promise<ISORequest>;
  updateISORequest(messageId: string, updates: Partial<ISORequest>): Promise<void>;
  getISORequestsByUserId(userId: string): Promise<ISORequest[]>;

  // Forum posts
  createForumPost(post: InsertForumPost): Promise<ForumPost>;
  updateForumPost(threadId: string, updates: Partial<ForumPost>): Promise<void>;
  getForumPostByThreadId(threadId: string): Promise<ForumPost | undefined>;
  getActiveForumPostsByUserId(userId: string): Promise<ForumPost[]>;
  getAllActiveForumPosts(): Promise<ForumPost[]>;

  // Confirmed exchanges
  createConfirmedExchange(exchange: InsertConfirmedExchange): Promise<ConfirmedExchange>;
  getExchangesByUserId(userId: string): Promise<ConfirmedExchange[]>;
  getAllConfirmedExchanges(): Promise<ConfirmedExchange[]>;

  // Donation management
  createDonationGoal(goal: InsertDonationGoal): Promise<DonationGoal>;
  getCurrentDonationGoal(): Promise<DonationGoal | undefined>;
  deactivateDonationGoal(goalId: number): Promise<void>;
  createDonation(donation: InsertDonation): Promise<Donation>;
  getTotalDonationsForGoal(goalId: number): Promise<number>;

  // Form tokens
  createFormToken(token: InsertFormToken): Promise<FormToken>;
  getFormToken(token: string): Promise<FormToken | undefined>;
  markTokenAsUsed(token: string): Promise<void>;

  // Pending claims
  createPendingClaim(claim: InsertPendingClaim): Promise<PendingClaim>;
  getPendingClaimsByUserId(userId: string): Promise<PendingClaim[]>;
  deletePendingClaim(claimId: number): Promise<void>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  // User management
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByDiscordId(discordId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.discordId, discordId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Logging
  async createLog(insertLog: InsertLog): Promise<Log> {
    const [logEntry] = await db
      .insert(logs)
      .values(insertLog)
      .returning();
    return logEntry;
  }

  async getLogs(limit: number = 100): Promise<Log[]> {
    return await db
      .select()
      .from(logs)
      .orderBy(desc(logs.timestamp))
      .limit(limit);
  }

  // Bot configuration
  async getBotConfig(): Promise<BotConfig | undefined> {
    const [config] = await db.select().from(botConfig).limit(1);
    return config || undefined;
  }

  async updateBotConfig(config: Partial<BotConfig>): Promise<void> {
    const existing = await this.getBotConfig();
    
    if (existing) {
      await db
        .update(botConfig)
        .set(config)
        .where(eq(botConfig.id, existing.id));
    } else {
      await db
        .insert(botConfig)
        .values(config as InsertBotConfig);
    }
  }

  // Channel management
  async getAllowedChannels(): Promise<AllowedChannel[]> {
    return await db.select().from(allowedChannels);
  }

  async createAllowedChannel(channel: InsertAllowedChannel): Promise<AllowedChannel> {
    const [newChannel] = await db
      .insert(allowedChannels)
      .values(channel)
      .returning();
    return newChannel;
  }

  // ISO requests
  async createISORequest(request: InsertISORequest): Promise<ISORequest> {
    const [newRequest] = await db
      .insert(isoRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async updateISORequest(messageId: string, updates: Partial<ISORequest>): Promise<void> {
    await db
      .update(isoRequests)
      .set(updates)
      .where(eq(isoRequests.messageId, messageId));
  }

  async getISORequestsByUserId(userId: string): Promise<ISORequest[]> {
    return await db
      .select()
      .from(isoRequests)
      .where(eq(isoRequests.userId, userId))
      .orderBy(desc(isoRequests.createdAt));
  }

  // Forum posts
  async createForumPost(post: InsertForumPost): Promise<ForumPost> {
    const [newPost] = await db
      .insert(forumPosts)
      .values(post)
      .returning();
    return newPost;
  }

  async updateForumPost(threadId: string, updates: Partial<ForumPost>): Promise<void> {
    await db
      .update(forumPosts)
      .set(updates)
      .where(eq(forumPosts.threadId, threadId));
  }

  async getForumPostByThreadId(threadId: string): Promise<ForumPost | undefined> {
    const [post] = await db
      .select()
      .from(forumPosts)
      .where(eq(forumPosts.threadId, threadId));
    return post || undefined;
  }

  async getActiveForumPostsByUserId(userId: string): Promise<ForumPost[]> {
    return await db
      .select()
      .from(forumPosts)
      .where(
        and(
          eq(forumPosts.originalPosterId, userId),
          eq(forumPosts.status, 'active')
        )
      )
      .orderBy(desc(forumPosts.createdAt));
  }

  async getAllActiveForumPosts(): Promise<ForumPost[]> {
    return await db
      .select()
      .from(forumPosts)
      .where(eq(forumPosts.status, 'active'))
      .orderBy(desc(forumPosts.createdAt));
  }

  // Confirmed exchanges
  async createConfirmedExchange(exchange: InsertConfirmedExchange): Promise<ConfirmedExchange> {
    const [newExchange] = await db
      .insert(confirmedExchanges)
      .values(exchange)
      .returning();
    return newExchange;
  }

  async getExchangesByUserId(userId: string): Promise<ConfirmedExchange[]> {
    return await db
      .select()
      .from(confirmedExchanges)
      .where(
        and(
          eq(confirmedExchanges.originalPosterId, userId)
        )
      )
      .orderBy(desc(confirmedExchanges.confirmedAt));
  }

  async getAllConfirmedExchanges(): Promise<ConfirmedExchange[]> {
    return await db
      .select()
      .from(confirmedExchanges)
      .orderBy(desc(confirmedExchanges.confirmedAt));
  }

  // Donation management
  async createDonationGoal(goal: InsertDonationGoal): Promise<DonationGoal> {
    const [newGoal] = await db
      .insert(donationGoals)
      .values(goal)
      .returning();
    return newGoal;
  }

  async getCurrentDonationGoal(): Promise<DonationGoal | undefined> {
    const [goal] = await db
      .select()
      .from(donationGoals)
      .where(eq(donationGoals.isActive, true))
      .limit(1);
    return goal || undefined;
  }

  async deactivateDonationGoal(goalId: number): Promise<void> {
    await db
      .update(donationGoals)
      .set({ isActive: false })
      .where(eq(donationGoals.id, goalId));
  }

  async createDonation(donation: InsertDonation): Promise<Donation> {
    const [newDonation] = await db
      .insert(donations)
      .values(donation)
      .returning();
    return newDonation;
  }

  async getTotalDonationsForGoal(goalId: number): Promise<number> {
    const goal = await db
      .select()
      .from(donationGoals)
      .where(eq(donationGoals.id, goalId))
      .limit(1);
    
    if (!goal[0]) return 0;
    
    const donationsResult = await db
      .select()
      .from(donations)
      .where(gte(donations.createdAt, goal[0].createdAt));
    
    return donationsResult.reduce((total, donation) => total + donation.amount, 0);
  }

  // Form tokens
  async createFormToken(token: InsertFormToken): Promise<FormToken> {
    const [newToken] = await db
      .insert(formTokens)
      .values(token)
      .returning();
    return newToken;
  }

  async getFormToken(token: string): Promise<FormToken | undefined> {
    const [tokenData] = await db
      .select()
      .from(formTokens)
      .where(eq(formTokens.token, token));
    return tokenData || undefined;
  }

  async markTokenAsUsed(token: string): Promise<void> {
    await db
      .update(formTokens)
      .set({ used: true })
      .where(eq(formTokens.token, token));
  }

  // Pending claims
  async createPendingClaim(claim: InsertPendingClaim): Promise<PendingClaim> {
    const [newClaim] = await db
      .insert(pendingClaims)
      .values(claim)
      .returning();
    return newClaim;
  }

  async getPendingClaimsByUserId(userId: string): Promise<PendingClaim[]> {
    return await db
      .select()
      .from(pendingClaims)
      .where(eq(pendingClaims.originalPosterId, userId))
      .orderBy(desc(pendingClaims.createdAt));
  }

  async deletePendingClaim(claimId: number): Promise<void> {
    await db
      .delete(pendingClaims)
      .where(eq(pendingClaims.id, claimId));
  }
}

// Create storage instance
export const storage = new DatabaseStorage();

// Logging helper function
export function log(message: string, source: string = "server", level: string = "info"): void {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${timestamp} [${source}] ${message}`);
  
  // Store in database asynchronously
  storage.createLog({
    timestamp: new Date(),
    level,
    message,
    source
  }).catch(error => {
    console.error(`Failed to store log: ${error}`);
  });
}