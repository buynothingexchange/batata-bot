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
      log(`Required permissions: READ_MESSAGES, SEND_MESSAGES, READ_MESSAGE_HISTORY, ADD_REACTIONS, EMBED_LINKS`, "discord-bot");
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
    
    // Check if the message is a reply
    if (message.reference && message.reference.messageId) {
      const messageContent = message.content.trim();
      
      // Check for claim command (!claimed)
      const isClaimCommand = messageContent.startsWith(config.commandTrigger);
      // Check for resolve command (!resol)
      const isResolCommand = messageContent.startsWith("!resol");
      
      // Process if either command is detected
      if (isClaimCommand || isResolCommand) {
        commandsProcessed++;
        
        // Get the referenced message
        const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
        
        // Check if the referenced message has an image
        const hasImage = referencedMessage.attachments.some(
          attachment => attachment.contentType?.startsWith('image/')
        ) || referencedMessage.embeds.some(embed => embed.image);
        
        // For !resol command, we allow any message type
        // For !claimed command, we require an image
        if (isResolCommand || hasImage) {
          try {
            // Determine which emoji to use based on the command
            const emojiToUse = isClaimCommand 
              ? config.reactionEmoji 
              : "<:resol:1358566610973102130>";
              
            // Add the reaction to the referenced message
            // Check if this is a custom emoji (format: <:name:id>)
            if (emojiToUse.startsWith('<:') && emojiToUse.endsWith('>')) {
              const emojiId = emojiToUse.split(':').pop()?.slice(0, -1);
              if (emojiId) {
                await referencedMessage.react(emojiId);
              } else {
                throw new Error("Invalid custom emoji format");
              }
            } else {
              await referencedMessage.react(emojiToUse);
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
                // Create embed based on command type
                const embed = new EmbedBuilder()
                  .setColor(isClaimCommand ? 0x5865F2 : 0x57F287) // Blue for claims, green for resolved
                  .setTitle(isClaimCommand ? "Item Claimed" : "Issue Resolved")
                  .setDescription(isClaimCommand
                    ? `This item has been claimed by ${mentionedUser}`
                    : `This issue has been resolved by ${mentionedUser}`)
                  .setTimestamp()
                  .setFooter({ 
                    text: isClaimCommand
                      ? `Claimed via ${config.commandTrigger} command`
                      : `Resolved via !resol command`
                  });
                
                // Send the embed as a reply to the original message
                await referencedMessage.reply({ embeds: [embed] });
                
                const actionType = isClaimCommand ? "claim" : "resolution";
                log(`Created ${actionType} embed for ${mentionedUser.username} in #${channelName}`, "discord-bot");
              }
            }
            
            // Log the successful action
            await storage.createLog({
              userId: message.author.id,
              username: message.author.username,
              command: message.content,
              channel: channelName,
              emoji: emojiToUse,
              status: "success",
              message: mentionedUser
                ? `Added ${isClaimCommand ? "claim" : "resolution"} reaction and created embed for ${mentionedUser.username}`
                : `Added ${isClaimCommand ? "claim" : "resolution"} reaction to user's message`,
              guildId: message.guild?.id,
              messageId: message.id,
              referencedMessageId: referencedMessage.id
            });
            
            // Different log message depending on the command and content type
            if (isClaimCommand) {
              log(`Added claim reaction ${emojiToUse} to image in #${channelName}`, "discord-bot");
            } else {
              log(`Added resolution reaction ${emojiToUse} to message in #${channelName}`, "discord-bot");
            }
          } catch (error) {
            const reactionError = error as Error;
            log(`Error adding reaction: ${reactionError}`, "discord-bot");
            
            // Check if this is a permissions error
            if (reactionError.message?.includes('Missing Permissions') || 
                reactionError.message?.includes('50013')) {
              await message.reply(
                "I don't have enough permissions to add reactions or send messages. " +
                "Please ask a server admin to check my role permissions. I need: " +
                "Read Messages, Send Messages, Read Message History, Add Reactions, and Embed Links."
              );
            } else {
              await message.reply(`Failed to add reaction: ${reactionError.message}`);
            }
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
          
          // Log the error for the missing image (only happens with claim command now)
          await storage.createLog({
            userId: message.author.id,
            username: message.author.username,
            command: message.content,
            channel: channelName,
            emoji: config.reactionEmoji,  // This only happens for claim command
            status: "error",
            message: "No image found in referenced message",
            guildId: message.guild?.id,
            messageId: message.id,
            referencedMessageId: referencedMessage.id
          });
          
          log(`Failed to add reaction in #${channelName} - No image found for claim command`, "discord-bot");
          // Respond to the user with specific guidance
          await message.reply("The !claimed command can only be used on messages containing images.");
        }
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
              
        // Check if this is a permissions error and provide helpful feedback
        if (error instanceof Error && 
           (error.message?.includes('Missing Permissions') || 
            error.message?.includes('50013'))) {
          try {
            await message.reply(
              "I don't have enough permissions to perform this action. " +
              "Please ask a server admin to check my role permissions. I need: " +
              "Read Messages, Send Messages, Read Message History, Add Reactions, and Embed Links."
            );
          } catch (replyError) {
            // If we can't even reply, the permissions are very restricted
            log(`Cannot send permission error message: ${replyError}`, "discord-bot");
          }
        }
              
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
    const isClaimCommand = command.startsWith(config.commandTrigger);
    const isResolCommand = command.startsWith("!resol");
    
    if (isClaimCommand || isResolCommand) {
      commandsProcessed++;

      // Handle claim commands on non-image content
      if (isClaimCommand) {
        // Add a special test to simulate the image requirement for claim command
        const isTestSimulateNoImage = command.toLowerCase().includes("noimage") || 
                                      command.toLowerCase().includes("no image") ||
                                      command.toLowerCase().includes("no-image");
        
        if (isTestSimulateNoImage) {
          // Create an error log entry for missing image
          const log = await storage.createLog({
            userId: "dashboard",
            username: "Dashboard Test",
            command,
            channel: "test-channel",
            emoji: config.reactionEmoji,
            status: "error",
            message: "No image found in referenced message. The !claimed command only works with images.",
            messageId: "test-message-id",
          });
          
          return { success: false, log };
        }
      }
      
      // Check if there's a mention in the command (format: @username)
      const hasMention = command.includes('@');
      const mentionedUsername = hasMention ? command.split('@')[1]?.trim() : null;
      
      // Determine which emoji to use based on the command
      const emojiToUse = isClaimCommand 
        ? config.reactionEmoji 
        : "<:resol:1358566610973102130>";
      
      // Create a simulated log entry
      const log = await storage.createLog({
        userId: "dashboard",
        username: "Dashboard Test",
        command,
        channel: "test-channel",
        emoji: emojiToUse,
        status: "success",
        message: mentionedUsername 
          ? isClaimCommand
            ? `Added claim reaction and created embed for @${mentionedUsername}`
            : `Added resolution reaction and created embed for @${mentionedUsername}`
          : isClaimCommand
            ? "Test claim command processed successfully"
            : "Test resolution command processed successfully",
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
        message: `Invalid command. Command should start with '${config.commandTrigger}' or '!resol'`,
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