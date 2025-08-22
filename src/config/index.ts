import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(10, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z
    .string()
    .regex(/^\d{8,}$/, "DISCORD_CLIENT_ID must be a valid number string"),
  DEV_GUILD_ID: z
    .string()
    .regex(/^\d{8,}$/, "DEV_GUILD_ID must be a valid number string"),
  NODE_ENV: z.string().optional().default("development"),
  DATABASE_URL: z.string(),
  LAVALINK_HOST: z.string().optional().default("localhost"),
  LAVALINK_PORT: z.string().optional().default("2333"),
  LAVALINK_PASSWORD: z.string().optional().default("youshallnotpass"),
  LAVALINK_SECURE: z.string().optional().default("false"),
});

export const env = envSchema.parse(process.env);
export type EnvSchemaType = z.infer<typeof envSchema>;

export default {
  BOT_TOKEN: env.DISCORD_TOKEN,
  CLIENT_ID: env.DISCORD_CLIENT_ID,
  DEV_GUILD_ID: env.DEV_GUILD_ID,
  NODE_ENV: env.NODE_ENV,
  DB_URI: env.DATABASE_URL,
  LAVALINK: {
    HOST: env.LAVALINK_HOST,
    PORT: Number.parseInt(env.LAVALINK_PORT),
    PASSWORD: env.LAVALINK_PASSWORD,
    SECURE: env.LAVALINK_SECURE === "true",
  },
};
