import { Client, GatewayIntentBits } from "discord.js";
import config from "./config";
import {
  getCommands,
  loadCommands,
  loadEvents,
  registerSlashCommands,
} from "./utils";
import { destroyMusicManager } from "./utils/musicManager";
import prisma from "./utils/prisma";

async function initialiseBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildInvites,
    ],
  });

  try {
    await loadCommands();
    await loadEvents(client, getCommands());
    await registerSlashCommands();

    await prisma.$connect();
    console.log("📊 Connected to database");

    process.on("SIGINT", async () => {
      console.log("🛑 Shutting down bot...");

      await prisma.$disconnect();
      await client.destroy();
      process.exit(0);
    });

    await client.login(config.BOT_TOKEN);
  } catch (err) {
    console.log(err);
  }
}

initialiseBot();
