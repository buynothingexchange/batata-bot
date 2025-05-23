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
