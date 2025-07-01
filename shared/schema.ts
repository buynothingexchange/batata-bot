import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Bot Configuration schema
export const botConfig = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  webhookUrl: text("webhook_url"),
  token: text("token"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBotConfigSchema = createInsertSchema(botConfig).pick({
  webhookUrl: true,
  token: true,
});

export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type BotConfig = typeof botConfig.$inferSelect;

// Activity Logs schema
export const logs = pgTable("logs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  userId: text("user_id"),
  username: text("username"),
  command: text("command").notNull(),
  channel: text("channel").notNull(),
  emoji: text("emoji"),
  status: text("status").notNull(), // 'success' or 'error'
  message: text("message").notNull(),
  guildId: text("guild_id"),
  messageId: text("message_id"),
  referencedMessageId: text("referenced_message_id"),
});

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  timestamp: true,
});

export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;

// Channel allowlist schema
export const allowedChannels = pgTable("allowed_channels", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  channelName: text("channel_name").notNull(),
  guildId: text("guild_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const insertAllowedChannelSchema = createInsertSchema(allowedChannels).omit({
  id: true,
});

export type InsertAllowedChannel = z.infer<typeof insertAllowedChannelSchema>;
export type AllowedChannel = typeof allowedChannels.$inferSelect;

// ISO requests table
export const isoRequests = pgTable("iso_requests", {
  id: serial("id").primaryKey(),
  discordMessageId: text("discord_message_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  content: text("content").notNull(),
  category: text("category"),
  fulfilled: boolean("fulfilled").default(false).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertIsoRequestSchema = createInsertSchema(isoRequests).omit({
  id: true,
  timestamp: true,
});

export type InsertIsoRequest = z.infer<typeof insertIsoRequestSchema>;
export type IsoRequest = typeof isoRequests.$inferSelect;

// Forum Post Tracking schema for auto-bump feature
export const forumPosts = pgTable("forum_posts", {
  id: serial("id").primaryKey(),
  threadId: text("thread_id").notNull().unique(),
  channelId: text("channel_id").notNull(),
  guildId: text("guild_id").notNull(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  bumpCount: integer("bump_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertForumPostSchema = createInsertSchema(forumPosts).omit({
  id: true,
  createdAt: true,
});

export type InsertForumPost = z.infer<typeof insertForumPostSchema>;
export type ForumPost = typeof forumPosts.$inferSelect;

// Confirmed Exchanges schema for tracking completed trades
export const confirmedExchanges = pgTable("confirmed_exchanges", {
  id: serial("id").primaryKey(),
  originalPosterId: text("original_poster_id").notNull(),
  originalPosterUsername: text("original_poster_username").notNull(),
  tradingPartnerId: text("trading_partner_id").notNull(),
  tradingPartnerUsername: text("trading_partner_username").notNull(),
  itemDescription: text("item_description").notNull(),
  exchangeType: text("exchange_type").notNull(), // 'trade', 'give', 'request'
  category: text("category").notNull(),
  threadId: text("thread_id").notNull(),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
  guildId: text("guild_id").notNull(),
});

export const insertConfirmedExchangeSchema = createInsertSchema(confirmedExchanges).omit({
  id: true,
  confirmedAt: true,
});

export type InsertConfirmedExchange = z.infer<typeof insertConfirmedExchangeSchema>;
export type ConfirmedExchange = typeof confirmedExchanges.$inferSelect;

// Donation tracking schema
export const donationGoals = pgTable("donation_goals", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  goalAmount: integer("goal_amount").notNull(), // in cents
  currentAmount: integer("current_amount").notNull().default(0), // in cents
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDonationGoalSchema = createInsertSchema(donationGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDonationGoal = z.infer<typeof insertDonationGoalSchema>;
export type DonationGoal = typeof donationGoals.$inferSelect;

// Donation records schema
export const donations = pgTable("donations", {
  id: serial("id").primaryKey(),
  kofiTransactionId: text("kofi_transaction_id").unique(),
  donorName: text("donor_name"),
  amount: integer("amount").notNull(), // in cents
  message: text("message"),
  email: text("email"),
  isPublic: boolean("is_public").notNull().default(true),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertDonationSchema = createInsertSchema(donations).omit({
  id: true,
  timestamp: true,
});

export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Donation = typeof donations.$inferSelect;

// Form Tokens schema - for linking Discord users to form submissions
export const formTokens = pgTable("form_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  discordUserId: text("discord_user_id").notNull(),
  discordUsername: text("discord_username").notNull(),
  discordDisplayName: text("discord_display_name"),
  discordAvatar: text("discord_avatar"),
  guildId: text("guild_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
});

export const insertFormTokenSchema = createInsertSchema(formTokens).pick({
  token: true,
  discordUserId: true,
  discordUsername: true,
  discordDisplayName: true,
  discordAvatar: true,
  guildId: true,
  expiresAt: true,
});

export type InsertFormToken = z.infer<typeof insertFormTokenSchema>;
export type FormToken = typeof formTokens.$inferSelect;
