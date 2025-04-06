import { Client, GatewayIntentBits, Partials, Events, Message, ChannelType, EmbedBuilder } from "discord.js";
import { storage } from "./storage";
import { insertLogSchema } from "@shared/schema";
import { log } from "./vite";

// Bot instance and state
let bot: Client | null = null;
let startTime: Date | null = null;
let commandsProcessed = 0;

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMessageReactions
];

const partials = [Partials.Message, Partials.Channel, Partials.Reaction];

// Initialize the Discord bot
export async function initializeBot() {
  try {
    // Check if the bot is already initialized
    if (bot) {
      log("Bot is already initialized", "discord-bot");
      return;
    }

    // Get the bot token from environment variables
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      throw new Error("Missing DISCORD_BOT_TOKEN environment variable");
    }

    // Create and initialize a bot configuration if it doesn't exist
    const config = await storage.getBotConfig();
    if (!config) {
      await storage.createBotConfig({
        commandTrigger: "!claimed",
        reactionEmoji: "<:claimed:1358472533304676473>",
        token
      });
    }

    // Create a new Discord client
    bot = new Client({ intents, partials });
    
    // Set up event handlers
    bot.on(Events.ClientReady, async () => {
      log(`Bot logged in as ${bot?.user?.tag}`, "discord-bot");
      startTime = new Date();
      
      // Add default allowed channels if none exist
      const channels = await storage.getAllowedChannels();
      if (channels.length === 0) {
        // Add some default channels for the UI
        await addDefaultChannels();
      }
    });
    
    bot.on(Events.MessageCreate, handleMessage);
    
    // Log in to Discord
    await bot.login(token);
    log("Bot initialized successfully", "discord-bot");
  } catch (error) {
    log(`Error initializing bot: ${error}`, "discord-bot");
    throw error;
  }
}

// Handle incoming messages
async function handleMessage(message: Message) {
  try {
    // Ignore messages from bots
    if (message.author.bot) return;
    
    // Get the bot configuration
    const config = await storage.getBotConfig();
    if (!config) {
      log("Bot configuration not found", "discord-bot");
      return;
    }
    
    // Check if the message is a reply and contains the command
    if (
      message.content.trim().startsWith(config.commandTrigger) &&
      message.reference &&
      message.reference.messageId
    ) {
      commandsProcessed++;
      
      // Get the referenced message
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      
      // Check if the referenced message has an image
      const hasImage = referencedMessage.attachments.some(
        attachment => attachment.contentType?.startsWith('image/')
      ) || referencedMessage.embeds.some(embed => embed.image);
      
      if (hasImage) {
        try {
          // Add the reaction to the referenced message
          // Check if this is a custom emoji (format: <:name:id>)
          if (config.reactionEmoji.startsWith('<:') && config.reactionEmoji.endsWith('>')) {
            const emojiId = config.reactionEmoji.split(':').pop()?.slice(0, -1);
            if (emojiId) {
              await referencedMessage.react(emojiId);
            } else {
              throw new Error("Invalid custom emoji format");
            }
          } else {
            await referencedMessage.react(config.reactionEmoji);
          }
          
          // Get channel name safely
          const channelName = message.channel.type === ChannelType.DM
            ? 'DM'
            : message.channel.type === ChannelType.GuildVoice 
              ? (message.channel as any).name || 'voice-channel'
              : message.channel.type === ChannelType.GuildText
                ? (message.channel as any).name
                : 'unknown-channel';
                
          // Check if there are user mentions in the message
          let mentionedUser = null;
          
          // Check if the message contains mentions
          if (message.mentions.users.size > 0) {
            // Get the first mentioned user
            mentionedUser = message.mentions.users.first();
            
            if (mentionedUser) {
              // Create an embed message using EmbedBuilder for proper type safety
              const embed = new EmbedBuilder()
                .setColor(0x5865F2) // Discord blue color
                .setTitle("Item Claimed")
                .setDescription(`This item has been claimed by ${mentionedUser}`)
                .setTimestamp()
                .setFooter({ text: `Claimed via ${config.commandTrigger} command` });
              
              // Send the embed as a reply to the original message
              await referencedMessage.reply({ embeds: [embed] });
              log(`Created claim embed for ${mentionedUser.username} in #${channelName}`, "discord-bot");
            }
          }
          
          // Log the successful action
          await storage.createLog({
            userId: message.author.id,
            username: message.author.username,
            command: message.content,
            channel: channelName,
            emoji: config.reactionEmoji,
            status: "success",
            message: mentionedUser ? 
              `Added claim reaction and created embed for ${mentionedUser.username}` : 
              "Added claim reaction to user's message",
            guildId: message.guild?.id,
            messageId: message.id,
            referencedMessageId: referencedMessage.id
          });
          
          log(`Added reaction ${config.reactionEmoji} to image in #${channelName}`, "discord-bot");
        } catch (error) {
          const reactionError = error as Error;
          log(`Error adding reaction: ${reactionError}`, "discord-bot");
          await message.reply(`Failed to add reaction: ${reactionError.message}`);
          throw reactionError;
        }
      } else {
        // Get channel name safely
        const channelName = message.channel.type === ChannelType.DM
          ? 'DM'
          : message.channel.type === ChannelType.GuildVoice 
            ? (message.channel as any).name || 'voice-channel'
            : message.channel.type === ChannelType.GuildText
              ? (message.channel as any).name
              : 'unknown-channel';
        
        // Log the error for the missing image
        await storage.createLog({
          userId: message.author.id,
          username: message.author.username,
          command: message.content,
          channel: channelName,
          emoji: config.reactionEmoji,
          status: "error",
          message: "No image found in referenced message",
          guildId: message.guild?.id,
          messageId: message.id,
          referencedMessageId: referencedMessage.id
        });
        
        log(`Failed to add reaction in #${channelName} - No image found`, "discord-bot");
        // Optionally, respond to the user
        await message.reply("The message you replied to doesn't contain an image.");
      }
    }
  } catch (error) {
    log(`Error handling message: ${error}`, "discord-bot");
    
    // Attempt to log the error
    try {
      if (message) {
        // Get channel name safely
        const errorChannelName = message.channel.type === ChannelType.DM
          ? 'DM'
          : message.channel.type === ChannelType.GuildVoice 
            ? (message.channel as any).name || 'voice-channel'
            : message.channel.type === ChannelType.GuildText
              ? (message.channel as any).name
              : 'unknown-channel';
              
        await storage.createLog({
          userId: message.author.id,
          username: message.author.username,
          command: message.content,
          channel: errorChannelName,
          status: "error",
          message: `Error processing command: ${error}`,
          guildId: message.guild?.id,
          messageId: message.id,
          referencedMessageId: message.reference?.messageId
        });
      }
    } catch (logError) {
      log(`Failed to log error: ${logError}`, "discord-bot");
    }
  }
}

// Process a test command (for the dashboard)
export async function processCommand(command: string) {
  try {
    const config = await storage.getBotConfig();
    if (!config) {
      throw new Error("Bot configuration not found");
    }
    
    // For testing purposes, simulate a successful command
    if (command.startsWith(config.commandTrigger)) {
      commandsProcessed++;
      
      // Check if there's a mention in the command (format: @username)
      const hasMention = command.includes('@');
      const mentionedUsername = hasMention ? command.split('@')[1]?.trim() : null;
      
      // Create a simulated log entry
      const log = await storage.createLog({
        userId: "dashboard",
        username: "Dashboard Test",
        command,
        channel: "test-channel",
        emoji: config.reactionEmoji,
        status: "success",
        message: mentionedUsername ? 
          `Added claim reaction and created embed for @${mentionedUsername}` : 
          "Test command processed successfully",
        messageId: "test-message-id",
      });
      
      return { success: true, log };
    } else {
      // Create an error log entry
      const log = await storage.createLog({
        userId: "dashboard",
        username: "Dashboard Test",
        command,
        channel: "test-channel",
        status: "error",
        message: `Invalid command. Command should start with '${config.commandTrigger}'`,
        messageId: "test-message-id",
      });
      
      return { success: false, log };
    }
  } catch (error) {
    log(`Error processing test command: ${error}`, "discord-bot");
    throw error;
  }
}

// Get the bot status information
export async function getBotStatus() {
  if (!bot || !bot.user) {
    return {
      status: "offline",
      uptime: "0 seconds",
      memory: {
        used: "0MB",
        total: "0MB"
      },
      commandsProcessed: 0
    };
  }
  
  // Calculate uptime
  const uptime = startTime ? calculateUptime(startTime) : "0 seconds";
  
  // Get memory usage
  const memoryUsage = process.memoryUsage();
  const usedMemory = `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`;
  const totalMemory = `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`;
  
  return {
    status: "online",
    uptime,
    memory: {
      used: usedMemory,
      total: totalMemory
    },
    commandsProcessed
  };
}

// Update the bot configuration
export async function updateBotConfig(newConfig: { commandTrigger: string; reactionEmoji: string }) {
  try {
    if (!bot || !bot.user) {
      throw new Error("Bot is not initialized");
    }
    
    await storage.updateBotConfig(newConfig);
    log(`Bot configuration updated: ${JSON.stringify(newConfig)}`, "discord-bot");
    
    return true;
  } catch (error) {
    log(`Error updating bot configuration: ${error}`, "discord-bot");
    throw error;
  }
}

// Restart the bot
export async function restartBot() {
  try {
    if (bot) {
      log("Destroying current bot instance", "discord-bot");
      await bot.destroy();
      bot = null;
    }
    
    log("Reinitializing bot", "discord-bot");
    await initializeBot();
    return true;
  } catch (error) {
    log(`Error restarting bot: ${error}`, "discord-bot");
    throw error;
  }
}

// Helper function to calculate uptime
function calculateUptime(startTime: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - startTime.getTime();
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
}

// Helper function to add default channels for the UI
async function addDefaultChannels() {
  const defaultChannels = [
    { channelId: "items-exchange", channelName: "items-exchange", guildId: "default", enabled: true },
    { channelId: "trading-post", channelName: "trading-post", guildId: "default", enabled: true },
    { channelId: "general", channelName: "general", guildId: "default", enabled: true }
  ];
  
  for (const channel of defaultChannels) {
    await storage.createAllowedChannel(channel);
  }
  
  log("Added default allowed channels", "discord-bot");
}
