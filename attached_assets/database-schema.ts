// Copy this file as: shared/schema.ts
// Database schema definitions for Batata Discord Bot

import { pgTable, text, integer, timestamp, boolean, serial } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  username: text('username').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Bot configuration table
export const botConfig = pgTable('bot_config', {
  id: serial('id').primaryKey(),
  token: text('token'),
  webhookUrl: text('webhook_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Logs table
export const logs = pgTable('logs', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  level: text('level').notNull(),
  message: text('message').notNull(),
  source: text('source'),
});

// Allowed channels table
export const allowedChannels = pgTable('allowed_channels', {
  id: serial('id').primaryKey(),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  channelName: text('channel_name').notNull(),
  enabled: boolean('enabled').default(true),
});

// ISO requests table
export const isoRequests = pgTable('iso_requests', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  messageId: text('message_id').notNull(),
  originalMessage: text('original_message').notNull(),
  processed: boolean('processed').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Forum posts table
export const forumPosts = pgTable('forum_posts', {
  id: serial('id').primaryKey(),
  threadId: text('thread_id').notNull().unique(),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  exchangeType: text('exchange_type').notNull(), // 'request', 'trade', 'give'
  originalPosterId: text('original_poster_id').notNull(),
  originalPosterUsername: text('original_poster_username').notNull(),
  status: text('status').default('active'), // 'active', 'completed', 'archived'
  lastBumpedAt: timestamp('last_bumped_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Confirmed exchanges table
export const confirmedExchanges = pgTable('confirmed_exchanges', {
  id: serial('id').primaryKey(),
  guildId: text('guild_id').notNull(),
  threadId: text('thread_id').notNull(),
  category: text('category').notNull(),
  originalPosterId: text('original_poster_id').notNull(),
  originalPosterUsername: text('original_poster_username').notNull(),
  tradingPartnerId: text('trading_partner_id').notNull(),
  tradingPartnerUsername: text('trading_partner_username').notNull(),
  itemDescription: text('item_description').notNull(),
  exchangeType: text('exchange_type').notNull(),
  confirmedAt: timestamp('confirmed_at').defaultNow().notNull(),
});

// Donation goals table
export const donationGoals = pgTable('donation_goals', {
  id: serial('id').primaryKey(),
  guildId: text('guild_id').notNull(),
  channelId: text('channel_id').notNull(),
  messageId: text('message_id').notNull(),
  goalAmount: integer('goal_amount').notNull(), // Amount in cents
  currentAmount: integer('current_amount').default(0), // Amount in cents
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Donations table
export const donations = pgTable('donations', {
  id: serial('id').primaryKey(),
  kofiTransactionId: text('kofi_transaction_id').notNull().unique(),
  donorName: text('donor_name').notNull(),
  amount: integer('amount').notNull(), // Amount in cents
  message: text('message'),
  isPublic: boolean('is_public').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Form tokens table (for external form authentication)
export const formTokens = pgTable('form_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  used: boolean('used').default(false),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Pending claims table (for trade confirmations)
export const pendingClaims = pgTable('pending_claims', {
  id: serial('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  originalPosterId: text('original_poster_id').notNull(),
  originalPosterUsername: text('original_poster_username').notNull(),
  tradingPartnerUsername: text('trading_partner_username').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Insert schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertBotConfigSchema = createInsertSchema(botConfig).omit({ id: true });
export const insertLogSchema = createInsertSchema(logs).omit({ id: true });
export const insertAllowedChannelSchema = createInsertSchema(allowedChannels).omit({ id: true });
export const insertISORequestSchema = createInsertSchema(isoRequests).omit({ id: true });
export const insertForumPostSchema = createInsertSchema(forumPosts).omit({ id: true });
export const insertConfirmedExchangeSchema = createInsertSchema(confirmedExchanges).omit({ id: true });
export const insertDonationGoalSchema = createInsertSchema(donationGoals).omit({ id: true });
export const insertDonationSchema = createInsertSchema(donations).omit({ id: true });
export const insertFormTokenSchema = createInsertSchema(formTokens).omit({ id: true });
export const insertPendingClaimSchema = createInsertSchema(pendingClaims).omit({ id: true });

// Type definitions
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type BotConfig = typeof botConfig.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;

export type Log = typeof logs.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;

export type AllowedChannel = typeof allowedChannels.$inferSelect;
export type InsertAllowedChannel = z.infer<typeof insertAllowedChannelSchema>;

export type ISORequest = typeof isoRequests.$inferSelect;
export type InsertISORequest = z.infer<typeof insertISORequestSchema>;

export type ForumPost = typeof forumPosts.$inferSelect;
export type InsertForumPost = z.infer<typeof insertForumPostSchema>;

export type ConfirmedExchange = typeof confirmedExchanges.$inferSelect;
export type InsertConfirmedExchange = z.infer<typeof insertConfirmedExchangeSchema>;

export type DonationGoal = typeof donationGoals.$inferSelect;
export type InsertDonationGoal = z.infer<typeof insertDonationGoalSchema>;

export type Donation = typeof donations.$inferSelect;
export type InsertDonation = z.infer<typeof insertDonationSchema>;

export type FormToken = typeof formTokens.$inferSelect;
export type InsertFormToken = z.infer<typeof insertFormTokenSchema>;

export type PendingClaim = typeof pendingClaims.$inferSelect;
export type InsertPendingClaim = z.infer<typeof insertPendingClaimSchema>;