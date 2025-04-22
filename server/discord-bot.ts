import { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events, 
  Message, 
  ChannelType, 
  EmbedBuilder, 
  WebSocketShardEvents, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ButtonInteraction,
  Interaction,
  TextChannel
} from "discord.js";
import { storage } from "./storage";
import { insertLogSchema } from "@shared/schema";
import { log } from "./vite";
import { analyzeISORequest } from "./openai-service";

// Bot instance and state
let bot: Client | null = null;
let startTime: Date | null = null;
let commandsProcessed = 0;
let reconnectAttempts = 0;
let lastMessageTimestamp = Date.now();
let forceReconnectInterval: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 60000; // 1 minute
const HEALTH_CHECK_INTERVAL = 300000; // 5 minutes
const MESSAGE_INACTIVITY_THRESHOLD = 3600000; // 1 hour - force reconnect if no messages processed

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
    { channelId: "general", channelName: "general", guildId: "default", enabled: true },
    // Add sub-category channels for tags
    { channelId: "electronics", channelName: "electronics", guildId: "default", enabled: true },
    { channelId: "clothing", channelName: "clothing", guildId: "default", enabled: true },
    { channelId: "furniture", channelName: "furniture", guildId: "default", enabled: true },
    { channelId: "collectibles", channelName: "collectibles", guildId: "default", enabled: true },
    { channelId: "books", channelName: "books", guildId: "default", enabled: true },
    { channelId: "toys", channelName: "toys", guildId: "default", enabled: true },
    { channelId: "games", channelName: "games", guildId: "default", enabled: true },
    { channelId: "accessories", channelName: "accessories", guildId: "default", enabled: true }
  ];
  
  for (const channel of defaultChannels) {
    await storage.createAllowedChannel(channel);
  }
  
  log("Added default allowed channels", "discord-bot");
}

// Helper function to create buttons from tags
function createTagButtons(item: string, features: string[], tags: string[]): ActionRowBuilder<ButtonBuilder>[] {
  // Combine item words, features, and tags to create a comprehensive set of potential tags
  const allWords: string[] = [];
  
  // Add item words
  const itemWords = item.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  allWords.push(...itemWords);
  
  // Add feature keywords
  const featureWords = features
    .join(' ')
    .toLowerCase()
    .split(/\s+|,\s*/)
    .filter(word => word.length > 3);
  allWords.push(...featureWords);
  
  // Add explicit tags
  if (tags.length > 0) {
    allWords.push(...tags);
  }
  
  // Get unique words (use Array.from for better TypeScript compatibility)
  const uniqueWords = Array.from(new Set(allWords));
  
  // Map common terms to standardized categories
  const categoryMap: Record<string, string> = {
    // Electronics
    'computer': 'electronics',
    'laptop': 'electronics',
    'phone': 'electronics',
    'tablet': 'electronics',
    'electronic': 'electronics',
    'digital': 'electronics',
    'tech': 'electronics',
    'device': 'electronics',
    'gaming': 'games',
    
    // Clothing
    'shirt': 'clothing',
    'pants': 'clothing',
    'jacket': 'clothing',
    'dress': 'clothing',
    'clothing': 'clothing',
    'apparel': 'clothing',
    'fashion': 'clothing',
    'wearable': 'clothing',
    'shoes': 'clothing',
    'slippers': 'clothing',
    
    // Furniture
    'chair': 'furniture',
    'table': 'furniture',
    'desk': 'furniture',
    'furniture': 'furniture',
    'sofa': 'furniture',
    'couch': 'furniture',
    'shelf': 'furniture',
    
    // Collectibles
    'collectible': 'collectibles',
    'figure': 'collectibles',
    'statue': 'collectibles',
    'collection': 'collectibles',
    'memorabilia': 'collectibles',
    'rare': 'collectibles',
    'vintage': 'collectibles',
    
    // Books
    'book': 'books',
    'novel': 'books',
    'magazine': 'books',
    'comic': 'books',
    'literature': 'books',
    'reading': 'books',
    'textbook': 'books',
    
    // Toys
    'toy': 'toys',
    'plush': 'toys',
    'doll': 'toys',
    'action': 'toys',
    'puzzle': 'toys',
    'lego': 'toys',
    
    // Games
    'game': 'games',
    'video': 'games',
    'console': 'games',
    'boardgame': 'games',
    'controller': 'games',
    'nintendo': 'games',
    'playstation': 'games',
    'xbox': 'games',
    
    // Accessories
    'accessory': 'accessories',
    'jewelry': 'accessories',
    'watch': 'accessories',
    'necklace': 'accessories',
    'earring': 'accessories',
    'bracelet': 'accessories',
    'ring': 'accessories',
    'bag': 'accessories',
    'handbag': 'accessories',
    'backpack': 'accessories'
  };
  
  // Map words to categories and get unique categories
  const matchedCategories = uniqueWords
    .map(word => {
      for (const [key, value] of Object.entries(categoryMap)) {
        if (word.includes(key)) return value;
      }
      return null;
    })
    .filter((category): category is string => category !== null);
  
  const uniqueCategories = Array.from(new Set(matchedCategories));
  
  // Limit to 5 categories (Discord's limit for buttons in one row)
  const categoriesToShow = uniqueCategories.slice(0, 5);
  
  // If no categories matched, add some default/general ones
  if (categoriesToShow.length === 0) {
    categoriesToShow.push('items-exchange', 'trading-post');
  }
  
  // Create buttons for each category
  const buttons = categoriesToShow.map(category => {
    return new ButtonBuilder()
      .setCustomId(`channel:${category}`)
      .setLabel(category.charAt(0).toUpperCase() + category.slice(1))
      .setStyle(ButtonStyle.Primary);
  });
  
  // Create action row with buttons
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  
  return [actionRow];
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
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      
      // Add default allowed channels if none exist
      const channels = await storage.getAllowedChannels();
      if (channels.length === 0) {
        // Add some default channels for the UI
        await addDefaultChannels();
      }
      
      // Set up a health check interval that runs every 5 minutes
      healthCheckInterval = setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL);
      
      // Set up a forced reconnect interval based on message activity
      forceReconnectInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTimestamp;
        
        // If no messages processed in 1 hour, force reconnect
        if (timeSinceLastMessage > MESSAGE_INACTIVITY_THRESHOLD) {
          log(`No message activity for ${Math.floor(timeSinceLastMessage / 60000)} minutes. Forcing reconnection...`, "discord-bot");
          storage.createLog({
            userId: "system",
            username: "System",
            command: "force-reconnect",
            channel: "N/A",
            status: "warning",
            message: `No message activity detected for ${Math.floor(timeSinceLastMessage / 60000)} minutes. Forcing bot reconnection.`,
            messageId: "system-message"
          }).catch(err => log(`Error logging force reconnect: ${err}`, "discord-bot"));
          
          restartBot().catch(err => log(`Error during forced reconnect: ${err}`, "discord-bot"));
        }
      }, 900000); // Check every 15 minutes
    });
    
    // Handle message creation events
    bot.on(Events.MessageCreate, handleMessage);
    
    // Handle button interactions
    bot.on(Events.InteractionCreate, handleInteraction);
    
    // Log when interactions are received
    log("Registered interaction handler for button clicks", "discord-bot");
    
    // Handle disconnection events
    bot.on('shardDisconnect' as any, (closeEvent: { code: number; reason: string }) => {
      log(`Bot disconnected with code ${closeEvent.code}. Reason: ${closeEvent.reason}`, "discord-bot");
      // Create a log entry for the disconnection
      storage.createLog({
        userId: "system",
        username: "System",
        command: "N/A",
        channel: "N/A",
        status: "error",
        message: `Bot disconnected with code ${closeEvent.code}. Reason: ${closeEvent.reason}`,
        messageId: "system-message",
      }).catch(err => log(`Error logging disconnect: ${err}`, "discord-bot"));
      
      // Attempt to reconnect automatically
      attemptReconnect();
    });
    
    // Handle errors
    bot.on(Events.Error, (error) => {
      log(`Bot encountered an error: ${error.message}`, "discord-bot");
      // Create a log entry for the error
      storage.createLog({
        userId: "system",
        username: "System",
        command: "N/A",
        channel: "N/A",
        status: "error",
        message: `Bot encountered an error: ${error.message}`,
        messageId: "system-message",
      }).catch(err => log(`Error logging bot error: ${err}`, "discord-bot"));
    });
    
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
    // Update last message timestamp (used for heartbeat monitoring)
    lastMessageTimestamp = Date.now();
    
    // Ignore messages from bots
    if (message.author.bot) return;
    
    // Check for welcome message in items-exchange channel
    const channelName = message.channel.type === ChannelType.GuildText 
      ? (message.channel as any).name 
      : "";
      
    if (channelName === "items-exchange" && 
        message.content.toLowerCase().includes("hello")) {
      try {
        // Send welcome message - use reply instead of send to avoid TypeScript errors
        await message.reply(`Hi ${message.author}, welcome!`);
        
        // Log the welcome message
        log(`Sent welcome message to ${message.author.username} in #items-exchange`, "discord-bot");
        
        // Create log entry
        await storage.createLog({
          userId: "system",
          username: "System",
          command: "welcome",
          channel: "items-exchange",
          status: "success",
          message: `Sent welcome message to ${message.author.username}`,
          messageId: message.id,
        }).catch(err => log(`Error logging welcome message: ${err}`, "discord-bot"));
      } catch (error) {
        log(`Error sending welcome message: ${error}`, "discord-bot");
      }
    }
    
    // Check for ISO requests in items-exchange channel
    if (channelName === "items-exchange" &&
        message.content.trim().startsWith("ISO")) {
      try {
        // Analyze the ISO request using OpenAI
        const analysis = await analyzeISORequest(message.author.username, message.content);
        
        // Build features list if available
        let featuresText = "-Features:";
        if (analysis.features && analysis.features.length > 0) {
          featuresText = "-Features: " + analysis.features.join(", ");
        }
        
        // Add urgency if available
        const urgencyText = `-Urgency: ${analysis.urgency || "Not specified"}`;
        
        // Add tags if available
        let tagsText = "-Tags:";
        if (analysis.tags && analysis.tags.length > 0) {
          tagsText = "-Tags: " + analysis.tags.join(", ");
        }
        
        // Create the standardized REQUEST format template with the extracted information
        const formattedResponse = `@${message.author.username} is looking for a ${analysis.item}.\n${featuresText}\n${urgencyText}\n${tagsText}`;
        
        // Create buttons for relevant tags/categories
        const tagButtons = createTagButtons(analysis.item, analysis.features, analysis.tags);
        
        // Send a new message with the formatted response (instead of replying)
        try {
          // Only attempt to send to text channels
          if (message.channel.type === ChannelType.GuildText) {
            await message.channel.send({
              content: formattedResponse,
              components: tagButtons
            });
          } else {
            // Fallback to reply for other channel types
            await message.reply({
              content: formattedResponse,
              components: tagButtons
            });
          }
        } catch (error) {
          log(`Error sending message to channel: ${error}`, "discord-bot");
          // Fallback to reply if we can't use channel.send
          await message.reply({
            content: formattedResponse,
            components: tagButtons
          });
        }
        
        // Delete the original ISO request message
        try {
          await message.delete();
          log(`Deleted original ISO request from ${message.author.username}`, "discord-bot");
        } catch (deleteError) {
          log(`Failed to delete original ISO message: ${deleteError}. The bot may not have permission to delete messages.`, "discord-bot");
        }
        
        // Log the ISO request formatting
        log(`AI-formatted ISO request for ${message.author.username} in #items-exchange: ${analysis.item}`, "discord-bot");
        
        // Create log entry with AI analysis status
        await storage.createLog({
          userId: message.author.id,
          username: message.author.username,
          command: "ISO",
          channel: "items-exchange",
          status: "success",
          message: `AI ${analysis.success ? "successfully" : "attempted to"} format REQUEST category post for item: ${analysis.item}`,
          messageId: message.id,
        }).catch(err => log(`Error logging ISO request formatting: ${err}`, "discord-bot"));
      } catch (error) {
        log(`Error formatting ISO request: ${error}`, "discord-bot");
        
        try {
          // Use our improved fallback extraction
          const requestText = message.content.trim().substring(3).trim();
          
          // Try to extract basic features using our fallback method
          let item = requestText;
          const features = [];
          
          // Check for common separators
          const separators = [' with ', ' that ', ' which ', ', ', ' in ', ' for '];
          for (const separator of separators) {
            if (requestText.includes(separator)) {
              const parts = requestText.split(separator);
              item = parts[0].trim();
              
              // Everything after the first separator becomes a feature
              if (parts.length > 1) {
                const featureText = parts.slice(1).join(separator).trim();
                features.push(featureText);
              }
              
              break;
            }
          }
          
          // Check for size specifications
          if (requestText.toLowerCase().includes("my size") || requestText.toLowerCase().includes("in size")) {
            item = requestText.replace(/(\s+that are|\s+in|\s+of|\s+with) my size/i, "").trim();
            features.push("my size");
          }
          
          // Check for urgency indicators with more comprehensive time phrases
          let urgency = "Not specified";
          
          // Simple urgency terms (single words or acronyms)
          const simpleUrgencyTerms = ["urgent", "asap", "quickly", "soon", "immediately", "today", "tmo", "tomorrow"];
          for (const term of simpleUrgencyTerms) {
            if (requestText.toLowerCase().includes(term.toLowerCase())) {
              // Use the actual phrase from the text to preserve capitalization and context
              const words = requestText.split(/\s+/);
              for (const word of words) {
                if (word.toLowerCase() === term.toLowerCase()) {
                  urgency = word; // Use the term as it appears in the message
                  break;
                }
              }
              if (urgency !== "Not specified") break;
            }
          }
          
          // More complex time phrases
          if (urgency === "Not specified") {
            const timePatterns = [
              /this weekend/i,
              /next weekend/i,
              /by (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
              /by tomorrow/i,
              /in a week/i,
              /by next week/i
            ];
            
            for (const pattern of timePatterns) {
              const match = requestText.match(pattern);
              if (match) {
                urgency = match[0]; // Use the actual matched phrase from the text
                break;
              }
            }
          }
          
          // Format the response
          const fallbackResponse = `@${message.author.username} is looking for a ${item}.\n-Features: ${features.length > 0 ? features.join(", ") : ""}\n-Urgency: ${urgency}\n-Tags:`;
          
          // Create buttons from extracted info
          const tagButtons = createTagButtons(item, features, []);
          
          // Send a new message instead of replying
          try {
            // Only attempt to send to text channels
            if (message.channel.type === ChannelType.GuildText) {
              await message.channel.send({
                content: fallbackResponse,
                components: tagButtons
              });
            } else {
              // Fallback to reply for other channel types
              await message.reply({
                content: fallbackResponse,
                components: tagButtons
              });
            }
          } catch (error) {
            log(`Error sending message to channel: ${error}`, "discord-bot");
            // Fallback to reply if we can't use channel.send
            await message.reply({
              content: fallbackResponse,
              components: tagButtons
            });
          }
          
          // Delete the original ISO request message
          try {
            await message.delete();
            log(`Deleted original ISO request (fallback) from ${message.author.username}`, "discord-bot");
          } catch (deleteError) {
            log(`Failed to delete original ISO message (fallback): ${deleteError}. The bot may not have permission to delete messages.`, "discord-bot");
          }
          
          // Log the fallback formatting
          log(`Fallback formatted ISO request for ${message.author.username} in #items-exchange: ${item}`, "discord-bot");
        } catch (fallbackError) {
          log(`Error with fallback ISO request formatting: ${fallbackError}`, "discord-bot");
        }
      }
    }
    
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

// Handle interaction events (button clicks)
async function handleInteraction(interaction: Interaction) {
  // Only handle button interactions
  if (!interaction.isButton()) return;
  
  try {
    // Get the button's custom ID
    const customId = interaction.customId;
    
    // Check if this is a channel redirect button
    if (customId.startsWith('channel:')) {
      // Extract the channel name from the customId
      const channelName = customId.substring(8); // Remove 'channel:' prefix
      
      // Create a message with information about the channel
      let responseMessage = `Redirecting you to the **#${channelName}** channel where you might find what you're looking for.`;
      
      // For demonstration/testing purposes, add some helpful info based on the channel
      switch (channelName) {
        case 'electronics':
          responseMessage += "\n\nThe electronics channel is for tech items like computers, phones, and gadgets.";
          break;
        case 'clothing':
          responseMessage += "\n\nThe clothing channel is for fashion items, apparel, and accessories.";
          break;
        case 'furniture':
          responseMessage += "\n\nThe furniture channel is for home and office furniture items.";
          break;
        case 'collectibles':
          responseMessage += "\n\nThe collectibles channel is for rare items, figures, and memorabilia.";
          break;
        case 'books':
          responseMessage += "\n\nThe books channel is for literature, textbooks, and reading materials.";
          break;
        case 'toys':
          responseMessage += "\n\nThe toys channel is for games, plushies, and children's items.";
          break;
        case 'games':
          responseMessage += "\n\nThe games channel is for video games, consoles, and gaming accessories.";
          break;
        case 'accessories':
          responseMessage += "\n\nThe accessories channel is for jewelry, bags, and other personal accessories.";
          break;
        default:
          responseMessage += "\n\nThis is a general channel for item exchange.";
      }
      
      // Respond to the interaction (only visible to the user who clicked)
      await interaction.reply({
        content: responseMessage,
        ephemeral: true // Only visible to the user who clicked the button
      });
      
      // Log the button click
      log(`User ${interaction.user.username} clicked the ${channelName} category button`, "discord-bot");
      
      // Create a log entry
      await storage.createLog({
        userId: interaction.user.id,
        username: interaction.user.username,
        command: `button:${customId}`,
        channel: (interaction.channel as any)?.name || "unknown-channel",
        status: "success",
        message: `User clicked the ${channelName} category button`,
        messageId: interaction.message.id
      }).catch(err => log(`Error logging button interaction: ${err}`, "discord-bot"));
    }
  } catch (error) {
    log(`Error handling button interaction: ${error}`, "discord-bot");
    
    try {
      // Try to respond to the user with an error message
      if (!interaction.replied) {
        await interaction.reply({
          content: "There was an error processing your request. Please try again later.",
          ephemeral: true
        });
      }
      
      // Log the error
      await storage.createLog({
        userId: interaction.user.id,
        username: interaction.user.username,
        command: `button:${interaction.customId}`,
        channel: (interaction.channel as any)?.name || "unknown-channel",
        status: "error",
        message: `Error handling button interaction: ${error}`,
        messageId: interaction.message.id
      }).catch(err => log(`Error logging button interaction error: ${err}`, "discord-bot"));
    } catch (replyError) {
      log(`Error replying to interaction: ${replyError}`, "discord-bot");
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
    const isTestWelcome = command.toLowerCase().includes("hello") || command.toLowerCase().includes("test welcome");
    const isTestISO = command.trim().startsWith("ISO");
    
    if (isTestISO) {
      try {
        // Extract item from the test ISO command
        const initialItemText = command.trim().substring(3).trim() || "test item";
        
        // Try to analyze with OpenAI
        const analysis = await analyzeISORequest("Dashboard Test", command);
        
        // Build features list if available
        let featuresText = "";
        if (analysis.features && analysis.features.length > 0) {
          featuresText = ` Features: ${analysis.features.join(", ")}.`;
        }
        
        // Add urgency if available
        let urgencyText = "";
        if (analysis.urgency && analysis.urgency !== "Not specified") {
          urgencyText = ` Urgency: ${analysis.urgency}.`;
        }
        
        // Add tags if available
        let tagsText = "";
        if (analysis.tags && analysis.tags.length > 0) {
          tagsText = ` Tags: ${analysis.tags.join(", ")}.`;
        }
        
        // Process test ISO request
        const logEntry = await storage.createLog({
          userId: "dashboard",
          username: "Dashboard Test",
          command,
          channel: "items-exchange",
          status: "success",
          message: `AI-formatted REQUEST category post: @Dashboard Test is looking for a ${analysis.item}.${featuresText}${urgencyText}${tagsText} (With interactive category buttons)`,
          messageId: "test-message-id",
        });
        
        return { success: true, log: logEntry };
      } catch (error) {
        // Use the imported log function from vite.ts, not a local variable
        log(`Error analyzing test ISO request: ${error}`, "discord-bot");
        
        // Fallback to basic extraction
        const itemText = command.trim().substring(3).trim() || "test item";
        
        // Process test ISO request with fallback
        const fallbackLog = await storage.createLog({
          userId: "dashboard",
          username: "Dashboard Test",
          command,
          channel: "items-exchange",
          status: "success",
          message: `Formatted REQUEST category post: @Dashboard Test is looking for a ${itemText}. (With interactive category buttons)`,
          messageId: "test-message-id",
        });
        
        return { success: true, log: fallbackLog };
      }
    }
    else if (isTestWelcome) {
      // Process test welcome message
      const log = await storage.createLog({
        userId: "dashboard",
        username: "Dashboard Test",
        command,
        channel: "items-exchange",
        status: "success",
        message: "Sent welcome message: Hi Username, welcome!",
        messageId: "test-message-id",
      });
      
      return { success: true, log };
    }
    else if (isClaimCommand || isResolCommand) {
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
    // Clear existing intervals to avoid duplications
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
    
    if (forceReconnectInterval) {
      clearInterval(forceReconnectInterval);
      forceReconnectInterval = null;
    }
    
    if (bot) {
      log("Destroying current bot instance", "discord-bot");
      await bot.destroy();
      bot = null;
    }
    
    // Reset the message timestamp to now to avoid immediate reconnection
    lastMessageTimestamp = Date.now();
    
    log("Reinitializing bot", "discord-bot");
    await initializeBot();
    return true;
  } catch (error) {
    log(`Error restarting bot: ${error}`, "discord-bot");
    throw error;
  }
}

// Health check function to verify bot is still connected and active
async function performHealthCheck() {
  try {
    if (!bot || !bot.user) {
      log("Health check failed: Bot is not initialized or not logged in", "discord-bot");
      await attemptReconnect();
      return;
    }
    
    // Check if the bot is connected
    if (bot.ws.status !== 0) { // 0 = WebSocket.OPEN
      log(`Health check failed: WebSocket connection not open (status: ${bot.ws.status})`, "discord-bot");
      await attemptReconnect();
      return;
    }
    
    // Check if the bot might be in a stale state (connected but not receiving events)
    // This is a more aggressive check than the one in the timer interval
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTimestamp;
    const CHECK_THRESHOLD = 1800000; // 30 minutes of inactivity triggers a ping test
    
    if (timeSinceLastMessage > CHECK_THRESHOLD) {
      log(`No message activity for ${Math.floor(timeSinceLastMessage / 60000)} minutes. Performing ping test...`, "discord-bot");
      
      try {
        // Try to ping the Discord API - this will fail if the connection is stale
        const pingStart = Date.now();
        const guilds = bot.guilds.cache.size;
        await bot.guilds.fetch();
        const pingTime = Date.now() - pingStart;
        
        // If ping takes too long, consider the connection stale
        if (pingTime > 5000) { // 5 seconds threshold
          log(`Ping test took ${pingTime}ms (too long). Forcing reconnection...`, "discord-bot");
          await storage.createLog({
            userId: "system",
            username: "System",
            command: "health-check",
            channel: "N/A",
            status: "warning",
            message: `Connection appears stale (ping: ${pingTime}ms). Forcing reconnection.`,
            messageId: "system-message"
          });
          
          await restartBot();
        } else {
          log(`Ping test successful (${pingTime}ms). Connection appears healthy despite inactivity.`, "discord-bot");
          // Update the timestamp to avoid repeated ping tests
          lastMessageTimestamp = Date.now();
        }
      } catch (pingError) {
        log(`Ping test failed: ${pingError}. Forcing reconnection...`, "discord-bot");
        await attemptReconnect();
      }
    } else {
      // Bot is online and connected
      log("Health check passed: Bot is online and connected", "discord-bot");
    }
  } catch (error) {
    log(`Health check error: ${error}`, "discord-bot");
    await attemptReconnect();
  }
}

// Attempt to reconnect the bot after a disconnect
async function attemptReconnect() {
  try {
    reconnectAttempts++;
    
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      log(`Maximum reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please restart the bot manually.`, "discord-bot");
      
      // Create a critical log entry
      await storage.createLog({
        userId: "system",
        username: "System",
        command: "reconnect",
        channel: "N/A", 
        status: "error",
        message: `Maximum reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please restart the bot manually.`,
        messageId: "system-message"
      });
      
      return;
    }
    
    log(`Attempting to reconnect... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, "discord-bot");
    
    // Create a log entry for the reconnection attempt
    await storage.createLog({
      userId: "system",
      username: "System",
      command: "reconnect",
      channel: "N/A", 
      status: "warning",
      message: `Attempting to reconnect... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
      messageId: "system-message"
    });
    
    // Destroy the existing connection if it exists
    if (bot) {
      await bot.destroy();
      bot = null;
    }
    
    // Wait for a bit before reconnecting (with exponential backoff)
    const backoffTime = Math.min(RECONNECT_INTERVAL * Math.pow(1.5, reconnectAttempts-1), 300000); // Max 5 minutes
    log(`Waiting ${Math.round(backoffTime/1000)} seconds before reconnecting...`, "discord-bot");
    
    setTimeout(async () => {
      try {
        // Attempt to reinitialize the bot
        await initializeBot();
        log("Reconnection successful", "discord-bot");
        
        // Create a success log entry
        await storage.createLog({
          userId: "system",
          username: "System",
          command: "reconnect",
          channel: "N/A", 
          status: "success",
          message: "Bot reconnected successfully",
          messageId: "system-message"
        });
      } catch (error) {
        log(`Reconnection failed: ${error}`, "discord-bot");
        
        // Create an error log entry
        await storage.createLog({
          userId: "system",
          username: "System",
          command: "reconnect",
          channel: "N/A", 
          status: "error",
          message: `Reconnection failed: ${error}`,
          messageId: "system-message"
        });
        
        // Try again
        attemptReconnect();
      }
    }, backoffTime);
  } catch (error) {
    log(`Error in attemptReconnect: ${error}`, "discord-bot");
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