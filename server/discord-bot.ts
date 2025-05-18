// Import required modules
import { 
  Client, ChannelType, Events, GatewayIntentBits, 
  Interaction, Message, MessageReaction, 
  PartialMessageReaction, PartialUser, Partials, 
  User, EmbedBuilder, TextChannel, ButtonBuilder, 
  ButtonStyle, ActionRowBuilder, 
  PermissionFlagsBits
} from 'discord.js';
import { WebSocketServer } from 'ws';
import { log } from './vite';
import { storage } from './storage';
import { analyzeISORequest } from './openai-service';
import { Server } from 'http';

// Bot instance
let bot: Client | null = null;

// Track when we last received messages (for heartbeat)
let lastMessageTimestamp = Date.now();
let lastSuccessfulActivity = Date.now(); // Track successful interactions with Discord
const RECONNECT_INTERVAL = 30000; // 30 seconds
let reconnectAttempts = 0;
let healthCheckFailures = 0; // Track consecutive health check failures
let commandsProcessed = 0;
let connectionStartTime = new Date(); // When the current connection was established
const processStartTime = new Date(); // When the entire process started

// COMPLETE REWRITE: Instead of tracking messages with a timestamp, we'll use a simpler global toggle
// for processing ISO requests. This way we can completely bypass any caching issues.
let isProcessingIsoRequest = false;

// Helper function to determine the correct article (a, an, or none for plurals)
function getArticle(noun: string): string {
  if (!noun) return "a"; // Default if noun is empty
  
  // Common plural endings or plural words that don't need articles
  const pluralPatterns = [
    /s$/i,             // Regular plurals ending in 's' (books, cars)
    /i$/i,             // Latin plurals (cacti, fungi)
    /es$/i,            // Some plurals ending in 'es' (buses, glasses)
    /(ee|oo)th$/i,     // Irregular plurals (teeth, booth)
    /ice$/i,           // Irregular plurals (mice, lice)
    /people$/i,        // Special case 'people'
    /men$/i,           // Irregular plurals ending in 'men' (women, men)
    /children$/i,      // Special case 'children'
    /scissors$/i,      // Items that are always plural
    /glasses$/i,       // Items that are always plural
    /pants$/i,         // Items that are always plural
    /shorts$/i,        // Items that are always plural
    /jeans$/i,         // Items that are always plural
    /trousers$/i,      // Items that are always plural
    /tights$/i,        // Items that are always plural
    /pajamas$/i,       // Items that are always plural
    /clothes$/i,       // Items that are always plural
    /underwear$/i      // Items that are always plural
  ];
  
  // Check if the noun matches any plural patterns
  if (pluralPatterns.some(pattern => pattern.test(noun.toLowerCase()))) {
    return ""; // No article for plurals: "looking for jeans" (not "a jeans")
  }
  
  // Check if the noun starts with a vowel sound for "an"
  if (/^[aeiou]/i.test(noun)) {
    return "an"; // Use "an" for vowel sounds: "an apple"
  }
  
  // Default to "a" for singular nouns starting with consonants
  return "a";
}

// Simple timer-based toggle - prevent rapid-fire processing
function setIsoProcessingLock(locked: boolean) {
  isProcessingIsoRequest = locked;
  log(`ISO processing lock ${locked ? 'ENABLED' : 'DISABLED'}`, "discord-bot");
  
  // If we lock it, automatically unlock after a brief delay (2 seconds)
  if (locked) {
    setTimeout(() => {
      isProcessingIsoRequest = false;
      log("ISO processing lock auto-released after timeout", "discord-bot");
    }, 2000);
  }
}

// Set up gateway intents (permissions)
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.DirectMessageReactions
];

// Set up partials (for handling partial objects)
const partials = [Partials.Message, Partials.Channel, Partials.Reaction];

// Helper function to add default channels for the UI
async function addDefaultChannels() {
  const defaultChannels = [
    { channelId: "items-exchange", channelName: "items-exchange", guildId: "default", enabled: true },
    { channelId: "trading-post", channelName: "trading-post", guildId: "default", enabled: true },
    { channelId: "general", channelName: "general", guildId: "default", enabled: true },
    // Primary category channels as specified by the user
    { channelId: "clothing", channelName: "clothing", guildId: "default", enabled: true },
    { channelId: "electronics", channelName: "electronics", guildId: "default", enabled: true },
    { channelId: "accessories", channelName: "accessories", guildId: "default", enabled: true },
    { channelId: "home-and-furniture", channelName: "home and furniture", guildId: "default", enabled: true }
  ];
  
  for (const channel of defaultChannels) {
    await storage.createAllowedChannel(channel);
  }
  
  log("Added default allowed channels", "discord-bot");
}

// Helper function to create a Fulfilled button for DMs
function createFulfilledButton(): ActionRowBuilder<ButtonBuilder>[] {
  const button = new ButtonBuilder()
    .setCustomId('fulfill:item')
    .setLabel('Mark as Fulfilled')
    .setStyle(ButtonStyle.Success);
  
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  
  return [actionRow];
}

// Helper function to create tag buttons
function createTagButtons(item: string, features: string[], tags: string[]): ActionRowBuilder<ButtonBuilder>[] {
  // Define category keywords to match against the item and features - updated to match the user's 4 primary categories
  const categoryMap: Record<string, string[]> = {
    'electronics': [
      'computer', 'laptop', 'phone', 'mobile', 'tablet', 'camera', 'headphones', 'speaker', 'tv', 'monitor', 
      'keyboard', 'mouse', 'gaming', 'console', 'electronic', 'charger', 'battery', 'cable', 'adapter', 
      'device', 'screen', 'printer', 'router', 'modem', 'smart', 'tech', 'technology', 'digital'
    ],
    'clothing': [
      'shirt', 'pants', 'dress', 'jacket', 'coat', 'sweater', 'hoodie', 'jeans', 'shorts', 't-shirt', 
      'shoes', 'boots', 'hat', 'cap', 'clothing', 'wear', 'outfit', 'sneakers', 'sock', 'socks', 
      'underwear', 'uniform', 'gloves', 'scarf', 'belt', 'apparel', 'sweatshirt', 'sweatpants'
    ],
    'home-and-furniture': [
      'chair', 'table', 'desk', 'sofa', 'couch', 'bed', 'mattress', 'shelf', 'cabinet', 'dresser', 
      'furniture', 'lamp', 'light', 'carpet', 'rug', 'curtain', 'pillow', 'blanket', 'mirror', 
      'clock', 'decoration', 'decor', 'kitchen', 'appliance', 'refrigerator', 'fridge', 'microwave',
      'toaster', 'blender', 'plate', 'cup', 'mug', 'bowl', 'utensil', 'pot', 'pan', 'cookware',
      'home', 'house', 'apartment', 'living', 'bathroom', 'bedroom', 'dining'
    ],
    'accessories': [
      'jewelry', 'watch', 'necklace', 'bracelet', 'ring', 'accessory', 'accessories', 'bag', 'backpack', 
      'purse', 'wallet', 'sunglasses', 'glasses', 'earrings', 'hat', 'scarf', 'belt', 'keychain', 
      'handbag', 'clutch', 'tote', 'satchel', 'wearable', 'pin', 'brooch', 'hairpin', 'clip', 'tie'
    ]
  };
  
  // Helper function to check if text matches any keywords from a category
  function matchesCategory(text: string, keywords: string[]): boolean {
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }
  
  // Start with the explicitly provided tags
  const matchedCategories = tags.map(tag => {
    // Check if tag matches any category name
    for (const [category, _] of Object.entries(categoryMap)) {
      if (tag.toLowerCase().includes(category.toLowerCase())) {
        return category;
      }
    }
    return null;
  });
  
  // Next check the item text
  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (matchesCategory(item, keywords)) {
      matchedCategories.push(category);
    }
  }
  
  // Check features
  for (const feature of features) {
    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (matchesCategory(feature, keywords)) {
        matchedCategories.push(category);
      }
    }
  }
  
  // Filter out nulls and get unique categories
  const validCategories = matchedCategories
    .filter((category): category is string => category !== null);
  
  const uniqueCategories = Array.from(new Set(validCategories));
  
  // Limit to 5 categories (Discord's limit for buttons in one row)
  const categoriesToShow = uniqueCategories.slice(0, 5);
  
  // If no categories matched, add all four primary categories
  if (categoriesToShow.length === 0) {
    categoriesToShow.push('clothing', 'electronics', 'accessories', 'home-and-furniture');
  }
  
  // Create buttons for each category with different styles based on category
  const buttons = categoriesToShow.map(category => {
    // Choose button style based on category
    let style = ButtonStyle.Primary; // Default blue
    
    // Assign specific colors to each category
    if (category === 'clothing') {
      style = ButtonStyle.Success; // Green for clothing
    } else if (category === 'electronics') {
      style = ButtonStyle.Primary; // Blue for electronics
    } else if (category === 'accessories') {
      style = ButtonStyle.Secondary; // Gray for accessories
    } else if (category === 'home-and-furniture') {
      style = ButtonStyle.Danger; // Red for home & furniture
    }
    
    // Format the display label to be more user-friendly
    let displayLabel = category.charAt(0).toUpperCase() + category.slice(1);
    if (category === 'home-and-furniture') {
      displayLabel = 'Home & Furniture';
    }
    
    return new ButtonBuilder()
      .setCustomId(`channel:${category}`)
      .setLabel(displayLabel)
      .setStyle(style);
  });
  
  // Create action row with buttons
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  
  return [actionRow];
}

// Flag to track if bot is already initialized
let isInitialized = false;

// Validate Discord token format
function isValidDiscordToken(token: string): boolean {
  // Basic validation - tokens usually follow a specific format with dots separating segments
  // This is a very basic check and does not guarantee the token is valid/active
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

// Initialize the Discord bot with comprehensive error handling and recovery
export async function initializeBot() {
  try {
    // If the bot is already initialized and connected, don't initialize again
    if (isInitialized && bot && bot.isReady()) {
      log("Bot is already initialized and connected", "discord-bot");
      return;
    }
    
    // Get the Discord bot token from the environment
    const token = process.env.DISCORD_BOT_TOKEN;
    
    // Thorough token validation
    if (!token) {
      const error = new Error("DISCORD_BOT_TOKEN is not set in the environment variables");
      log(`ERROR: ${error.message}`, "discord-bot");
      
      // Create a critical error log
      await storage.createLog({
        userId: "system",
        username: "System",
        command: "init",
        channel: "N/A",
        status: "error",
        message: "CRITICAL ERROR: Discord token is missing from environment variables. Bot cannot start.",
        messageId: "system-message"
      }).catch(err => log(`Error logging token missing error: ${err}`, "discord-bot"));
      
      throw error;
    }
    
    // Basic format validation
    if (!isValidDiscordToken(token)) {
      const error = new Error("DISCORD_BOT_TOKEN is present but has an invalid format");
      log(`ERROR: ${error.message}`, "discord-bot");
      
      // Create a critical error log
      await storage.createLog({
        userId: "system",
        username: "System",
        command: "init",
        channel: "N/A",
        status: "error",
        message: "CRITICAL ERROR: Discord token has invalid format. Bot cannot start.",
        messageId: "system-message"
      }).catch(err => log(`Error logging token format error: ${err}`, "discord-bot"));
      
      throw error;
    }
    
    log("Required permissions: READ_MESSAGES, SEND_MESSAGES, READ_MESSAGE_HISTORY, ADD_REACTIONS, EMBED_LINKS", "discord-bot");
    
    // Destroy existing bot instance if it exists
    if (bot) {
      log("Destroying existing bot instance before creating a new one", "discord-bot");
      try {
        await bot.destroy();
      } catch (destroyError) {
        log(`Warning: Error destroying existing bot instance: ${destroyError}. Continuing anyway...`, "discord-bot");
      }
      bot = null;
    }
    
    // Reset ISO processing lock to ensure it starts in the unlocked state
    isProcessingIsoRequest = false;
    log("Reset ISO processing lock during initialization", "discord-bot");
    
    // Reset metrics
    reconnectAttempts = 0;
    healthCheckFailures = 0;
    
    // Create a new bot instance with all necessary intents
    bot = new Client({ 
      intents,
      partials,
      // This increases the retry limit for REST API calls to Discord
      rest: {
        retries: 5, // Increase the default number of retries
        timeout: 15000 // Increase the default timeout (15 seconds)
      },
      // Increase the number of shards if we have many servers (not needed for most bots)
      shards: 'auto'
    });
    
    // Register event handlers
    bot.on(Events.ClientReady, () => {
      if (bot) {
        log(`Bot logged in as ${bot.user?.tag}`, "discord-bot");
        
        // Set up a heartbeat to monitor connection
        setInterval(performHealthCheck, 60000); // Check every minute
        
        // Set up process to run cache cleanup periodically
        // COMPLETE REWRITE: Simple heartbeat to log ISO processing status
        setInterval(() => {
          // Log whether ISO processing is active
          log(`ISO processing status: ${isProcessingIsoRequest ? 'ACTIVE' : 'IDLE'}`, "discord-bot");
          
          // Auto-release lock if it's been on for too long (safety measure)
          if (isProcessingIsoRequest) {
            log(`Auto-releasing ISO processing lock as safety measure`, "discord-bot");
            setIsoProcessingLock(false);
          }
        }, 15 * 1000); // Check every 15 seconds
        
        // Reset last message timestamp
        lastMessageTimestamp = Date.now();
      }
    });
    
    // Handle messages
    bot.on(Events.MessageCreate, handleMessage);
    
    // Handle reactions
    bot.on(Events.MessageReactionAdd, async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
      // Ignore reactions from the bot itself
      if (user.bot) return;
      
      try {
        // Ensure the reaction is fully fetched
        if (reaction.partial) {
          await reaction.fetch();
        }
        
        // Get the full user
        if (user.partial) {
          await user.fetch();
        }
        
        log(`Reaction ${reaction.emoji.name} added by ${user.tag}`, "discord-bot");
      } catch (error) {
        log(`Error handling reaction: ${error}`, "discord-bot");
      }
    });
    
    // Register interaction handler for button clicks
    bot.on(Events.InteractionCreate, handleInteraction);
    log("Registered interaction handler for button clicks", "discord-bot");
    
    // Handle disconnections
    bot.on(Events.Warn, (message) => {
      if (message.includes("disconnect") || message.includes("connection")) {
        log(`Bot disconnection warning: ${message}`, "discord-bot");
        
        // Attempt to reconnect automatically
        attemptReconnect();
      }
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
    
    // Set the initialization flag
    isInitialized = true;
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
      : message.channel.type === ChannelType.DM
        ? "DM"
        : "unknown";
    
    // Check if the bot is mentioned
    const isBotMentioned = bot && message.mentions.has(bot.user as User);
    
    // Check if the message contains a greeting
    const greetingWords = ['hi', 'hello', 'hey', 'greetings', 'howdy'];
    const containsGreeting = greetingWords.some(word => 
      message.content.toLowerCase().includes(word)
    );
    
    // Respond to users who @mention the bot with a greeting
    if (isBotMentioned && containsGreeting) {
      try {
        // Choose a random greeting response
        const greetingResponses = [
          `Hi ${message.author}! How can I help you today?`,
          `Hello ${message.author}! Welcome!`,
          `Hey there ${message.author}! Nice to meet you!`
        ];
        
        const randomResponse = greetingResponses[Math.floor(Math.random() * greetingResponses.length)];
        
        // Send the greeting
        await message.reply(randomResponse);
        
        // Log the welcome message
        log(`Sent greeting response to ${message.author.username} after being mentioned`, "discord-bot");
        
        // Create log entry
        await storage.createLog({
          userId: "system",
          username: "System",
          command: "greeting",
          channel: channelName,
          status: "success",
          message: `Sent greeting response to ${message.author.username} after being mentioned`,
          messageId: message.id,
        }).catch(err => log(`Error logging greeting message: ${err}`, "discord-bot"));
      } catch (error) {
        log(`Error sending greeting message: ${error}`, "discord-bot");
      }
    }
    
    // Check for ISO requests in items-exchange channel
    if (channelName === "items-exchange" && 
        message.content.trim().startsWith("ISO")) {
      
      // COMPLETE REWRITE: Simple global lock to prevent duplicate processing
      if (isProcessingIsoRequest) {
        log(`ISO processing lock is ON - waiting for current ISO request to finish`, "discord-bot");
        return;
      }
      
      // Set processing lock
      setIsoProcessingLock(true);
      
      try {
        // Process the ISO request in a separate function to isolate the logic
        log(`Processing ISO request from ${message.author.username} in #${channelName}`, "discord-bot");
        await processISORequest(message);
      } catch (isoError) {
        log(`Error in ISO request processing: ${isoError}`, "discord-bot");
      } finally {
        // Make sure we always release the lock, even if there's an error
        setIsoProcessingLock(false);
      }
    }
    
    // Get the bot configuration
    const config = await storage.getBotConfig();
    if (!config) {
      log("Bot configuration not found", "discord-bot");
      return;
    }
    
    // Check for administrator purge command (!86)
    if (message.content.trim() === '!86') {
      // Check if the user has admin permissions
      if (message.member && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        try {
          // Get the channel where the command was used
          const channel = message.channel as TextChannel;
          
          // Confirm with the user first
          const confirmMessage = await message.reply({
            content: "⚠️ **WARNING**: This will delete all messages in this channel that Discord allows the bot to delete (up to 2 weeks old). Are you sure you want to proceed? Reply with 'yes' to confirm within 10 seconds.",
          });
          
          // Create a message collector to wait for confirmation
          const filter = (m: Message) => m.author.id === message.author.id && m.content.toLowerCase() === 'yes';
          const collector = channel.createMessageCollector({ filter, time: 10000, max: 1 });
          
          collector.on('collect', async () => {
            // User confirmed, start deletion process
            await message.reply("Starting message deletion process. This may take some time...");
            
            log(`Admin ${message.author.username} triggered message purge in #${channel.name}`, "discord-bot");
            
            // Delete messages in batches
            let messagesDeleted = 0;
            let lastId: string | undefined;
            
            while (true) {
              const options: { limit: number; before?: string } = { limit: 100 };
              if (lastId) options.before = lastId;
              
              const messages = await channel.messages.fetch(options);
              
              if (messages.size === 0) break;
              
              // Update the last ID for pagination
              lastId = messages.last()?.id;
              
              // Filter messages by age (Discord only allows bulk deletion of messages under 14 days old)
              const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
              const filteredMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
              
              if (filteredMessages.size > 0) {
                await channel.bulkDelete(filteredMessages);
                messagesDeleted += filteredMessages.size;
                
                // Log progress every 100 messages
                if (messagesDeleted % 100 === 0) {
                  log(`Deleted ${messagesDeleted} messages so far in #${channel.name}`, "discord-bot");
                }
              }
              
              // If we got fewer messages than requested or all messages were too old, we're done
              if (messages.size < 100 || filteredMessages.size === 0) break;
            }
            
            // Send a completion message (this might fail if all messages including the original were deleted)
            try {
              await channel.send(`Deletion complete. Removed ${messagesDeleted} messages.`);
              log(`Completed message purge in #${channel.name}, deleted ${messagesDeleted} messages`, "discord-bot");
            } catch (err) {
              log(`Completed message purge in #${channel.name}, deleted ${messagesDeleted} messages (couldn't send completion message)`, "discord-bot");
            }
            
            // Log the action
            await storage.createLog({
              userId: message.author.id,
              username: message.author.username,
              command: "purge-messages",
              channel: channel.name,
              status: "success",
              message: `Admin purged ${messagesDeleted} messages from #${channel.name}`,
              messageId: "purge-" + Date.now(),
            }).catch(err => log(`Error logging message purge: ${err}`, "discord-bot"));
          });
          
          collector.on('end', (collected) => {
            if (collected.size === 0) {
              // User didn't confirm in time
              confirmMessage.edit("Message deletion cancelled - no confirmation received within 10 seconds.");
            }
          });
          
          return; // Exit early since we've handled this command
        } catch (error) {
          log(`Error executing purge command: ${error}`, "discord-bot");
          await message.reply("An error occurred while trying to delete messages. Please check the bot's permissions and try again.");
          return;
        }
      } else {
        // User doesn't have admin permissions
        await message.reply("You need administrator permissions to use this command.");
        return;
      }
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
    
    // Check if this is a category selection button
    if (customId.startsWith('channel:')) {
      // Extract the selected category from the button ID
      const selectedCategory = customId.replace('channel:', '');
      
      try {
        // Cross-post the message to the selected category channel
        if (interaction.message && bot) {
          const message = interaction.message;
          
          // Check if this interaction is happening in DMs
          const isDM = interaction.channel?.type === ChannelType.DM;
          
          if (isDM) {
            // In DMs, we need to search all guilds for the appropriate channel
            const guilds = Array.from(bot.guilds.cache.values());
            let categoryChannel: TextChannel | null = null;
            let foundGuild = null;
            
            // Search all guilds for the right channel
            for (const guild of guilds) {
              const foundChannel = guild.channels.cache.find(
                ch => ch.type === ChannelType.GuildText && 
                     (ch as TextChannel).name === selectedCategory
              ) as TextChannel;
              
              if (foundChannel) {
                categoryChannel = foundChannel;
                foundGuild = guild;
                break;
              }
            }
            
            if (categoryChannel && foundGuild) {
              // Now find the items-exchange channel to get the original message
              const itemsExchangeChannel = foundGuild.channels.cache.find(
                ch => ch.type === ChannelType.GuildText && 
                     (ch as TextChannel).name === 'items-exchange'
              ) as TextChannel;
              
              if (itemsExchangeChannel) {
                try {
                  // Get the username from the interaction
                  const username = interaction.user.username;
                  
                  // Extract item from the DM message more accurately
                  const itemMatch = message.content.match(/Your ISO request for "(.+?)"/i) || 
                                    message.content.match(/looking for .+?(\w[\w\s-]+\w)/i);
                  const itemName = itemMatch ? itemMatch[1].trim() : "(unknown item)";
                  
                  // Search for the original message in the items-exchange channel
                  const messages = await itemsExchangeChannel.messages.fetch({ limit: 50 });
                  
                  // Find the original message
                  const originalMessage = messages.find(msg => {
                    // Must be from the bot
                    if (!msg.author.bot) return false;
                    
                    // Must mention the user
                    if (!msg.content.includes(`@${username}`)) return false;
                    
                    // Check for the item with flexible article matching
                    return (
                      msg.content.includes(`is looking for a ${itemName}`) || 
                      msg.content.includes(`is looking for an ${itemName}`) || 
                      msg.content.includes(`is looking for ${itemName}`)
                    );
                  });
                  
                  if (originalMessage) {
                    // We found the original message, copy it to the category channel
                    log(`Found original message for cross-posting to #${selectedCategory}`, "discord-bot");
                    
                    // Create a cross-post message
                    const crosspostContent = `*[Cross-posted from #items-exchange]*\n${originalMessage.content}`;
                    
                    // Send to the category channel with the same content as the original
                    const sentCategoryMessage = await categoryChannel.send({
                      content: crosspostContent
                    });
                    
                    log(`Successfully cross-posted original message to #${selectedCategory}`, "discord-bot");
                  } else {
                    // If we can't find the original message, use what we can extract from the DM
                    log(`Could not find original message, using content from DM`, "discord-bot");
                    
                    // Try to extract the formatted request section - avoid using 's' flag for compatibility
                    let originalContent = "";
                    const contentMatch = message.content.match(/Your ISO request for[\s\S]+?\n\n([\s\S]+?)(?:\n\nPlease select|$)/);
                    if (contentMatch && contentMatch[1]) {
                      originalContent = contentMatch[1].trim();
                    } else {
                      // Fallback to looking for the original post pattern
                      const fallbackMatch = message.content.match(/@[\w\s]+ is looking for.+?$/m);
                      if (fallbackMatch) {
                        originalContent = fallbackMatch[0].trim();
                      } else {
                        // Last resort fallback
                        originalContent = `@${username} is looking for ${itemName}`;
                      }
                    }
                    
                    // Create a cross-post message
                    const crosspostContent = `*[Cross-posted from #items-exchange]*\n${originalContent}`;
                    
                    // Send to the category channel
                    const sentCategoryMessage = await categoryChannel.send({
                      content: crosspostContent
                    });
                    
                    log(`Cross-posted using extracted content to #${selectedCategory}`, "discord-bot");
                  }
                } catch (searchError) {
                  log(`Error searching for original message: ${searchError}`, "discord-bot");
                  
                  // Fall back to a basic cross-post
                  const basicContent = `*[Cross-posted from #items-exchange]*\n@${interaction.user.username} is looking for an item. (Original content could not be retrieved)`;
                  
                  // Send to the category channel
                  const sentCategoryMessage = await categoryChannel.send({
                    content: basicContent
                  });
                  
                  log(`Sent basic cross-post due to error: ${searchError}`, "discord-bot");
                }
                
                // Confirm to the user
                await interaction.reply({
                  content: `Your item has been cross-posted to #${selectedCategory}!`,
                  ephemeral: true
                });
                
                log(`User ${interaction.user.username} cross-posted ISO request to #${categoryChannel.name} from DM`, "discord-bot");
                
                // Log the cross-post
                await storage.createLog({
                  userId: interaction.user.id,
                  username: interaction.user.username,
                  command: "dm-crosspost",
                  channel: categoryChannel.name,
                  status: "success",
                  message: `Cross-posted ISO request to #${categoryChannel.name} from DM`,
                  messageId: "cross-posted-" + Date.now(),
                }).catch(err => log(`Error logging DM ISO cross-post: ${err}`, "discord-bot"));
              } else {
                // Items-exchange channel not found
                await interaction.reply({
                  content: `I found the #${selectedCategory} channel, but couldn't locate the original items-exchange channel. Please contact an admin.`,
                  ephemeral: true
                });
              }
            } else {
              // Category channel not found in any guild
              await interaction.reply({
                content: `I couldn't find the #${selectedCategory} channel on the server. Please contact an admin.`,
                ephemeral: true
              });
            }
          } else {
            // Normal guild interaction
            const guild = interaction.guild;
            
            if (guild) {
              // Find the category channel
              const categoryChannel = guild.channels.cache.find(
                ch => ch.type === ChannelType.GuildText && 
                     (ch as TextChannel).name === selectedCategory
              ) as TextChannel;
              
              if (categoryChannel) {
                // Create a copy of the message for the category channel
                // Add an intro line to clarify this is a cross-post
                const crosspostContent = `*[Cross-posted from #items-exchange by ${interaction.user}]*\n${message.content}`;
                
                // Send to the category channel
                const sentCategoryMessage = await categoryChannel.send({
                  content: crosspostContent,
                  components: message.components as any
                });
                
                // Confirm to the user
                await interaction.reply({
                  content: `Your item has been cross-posted to #${selectedCategory}!`,
                  ephemeral: true // Only visible to the user who clicked
                });
                
                log(`User ${interaction.user.username} manually cross-posted ISO request to #${categoryChannel.name}`, "discord-bot");
                
                // Log the cross-post
                await storage.createLog({
                  userId: interaction.user.id,
                  username: interaction.user.username,
                  command: "manual-crosspost",
                  channel: categoryChannel.name,
                  status: "success",
                  message: `Manually cross-posted ISO request to #${categoryChannel.name}`,
                  messageId: sentCategoryMessage.id,
                }).catch(err => log(`Error logging manual ISO cross-post: ${err}`, "discord-bot"));
              } else {
                // Channel not found
                await interaction.reply({
                  content: `I couldn't find the #${selectedCategory} channel. Please contact an admin.`,
                  ephemeral: true
                });
              }
            }
          }
        }
      } catch (error) {
        log(`Error handling category button click: ${error}`, "discord-bot");
        
        // Let the user know something went wrong
        try {
          await interaction.reply({
            content: "Sorry, there was an error processing your category selection.",
            ephemeral: true
          });
        } catch (replyError) {
          log(`Error replying to interaction: ${replyError}`, "discord-bot");
        }
      }
    }
    // Check if this is a fulfill button click
    else if (customId === 'fulfill:item') {
      try {
        // Extract details from the DM message to identify the original channel message
        const dmMessageContent = interaction.message.content;
        
        // Log the exact DM message we're trying to parse
        log(`Fulfill button clicked, parsing DM message: "${dmMessageContent}"`, "discord-bot");

        // Extract username - in the case of the "Fulfilled" button, it's always the user who clicked it
        const username = interaction.user.username;
        
        // Extract the item using multiple approaches to be more robust
        let item = "";
        
        // For "When you've found this item" format
        if (dmMessageContent.includes("When you've found this item")) {
          // This is the second DM, which doesn't directly mention the item
          // We need to find the last ISO request from this user
          item = "item"; // Generic fallback
          log(`Using fallback item name for fulfill button from user ${username}`, "discord-bot");
        } 
        // Try to extract item from "ISO request for" format
        else if (dmMessageContent.includes("ISO request for")) {
          const requestMatch = dmMessageContent.match(/ISO request for "?([^"]+)"?/i);
          if (requestMatch && requestMatch[1]) {
            item = requestMatch[1].trim();
            log(`Extracted item from ISO request format: "${item}"`, "discord-bot");
          }
        }
        // Try looking for pattern in message content
        else {
          let itemText = "";
          const withArticleMatch = dmMessageContent.match(/looking for (?:a|an) ([^.\n]+)/i);
          const withoutArticleMatch = dmMessageContent.match(/looking for ([^.\n]+)/i);
          
          if (withArticleMatch) {
              itemText = withArticleMatch[1].trim();
          } else if (withoutArticleMatch && withoutArticleMatch[1]) {
              // Make sure we don't capture "a" or "an" as part of the item
              itemText = withoutArticleMatch[1].trim().replace(/^(?:a|an)\s+/i, '');
          }
          
          if (itemText) {
            // Clean up any trailing periods
            item = itemText.replace(/\.$/, '');
            log(`Extracted item from looking for pattern: "${item}"`, "discord-bot");
          }
        }
        
        // If we still don't have an item, set a default for logging purposes
        if (!item) {
          item = "unknown item";
          log(`Could not extract item name from message, using fallback`, "discord-bot");
        }
        
        // Find the formatted message in the items-exchange channel
        if (username && item && bot) {
          try {
            // Look for the guild with items-exchange channel
            const guilds = Array.from(bot.guilds.cache.values());
            let originalMessage = null;
            
            for (const guild of guilds) {
              // Look for the items-exchange channel
              const channel = guild.channels.cache.find(
                (ch: any) => ch.type === ChannelType.GuildText && 
                     (ch as TextChannel).name === 'items-exchange'
              ) as TextChannel;
              
              if (channel) {
                try {
                  // Get recent messages from the channel
                  const messages = await channel.messages.fetch({ limit: 50 });
                  
                  // Look for messages by the bot that mention the user
                  const userMessages = messages.filter(msg => {
                    // Only consider messages sent by the bot
                    if (!msg.author.bot) return false;
                    
                    // Check if the message mentions the user
                    return msg.content.includes(`@${username}`);
                  });
                  
                  // Log how many potential matches we found
                  log(`Found ${userMessages.size} potential ISO requests from @${username} to check`, "discord-bot");
                  
                  // First try to find a perfect match with the item name
                  if (item !== "item" && item !== "unknown item") {
                    originalMessage = userMessages.find(msg => 
                      msg.content.includes(`is looking for a ${item}`) || 
                      msg.content.includes(`is looking for an ${item}`) || 
                      msg.content.includes(`is looking for ${item}`)
                    );
                    
                    if (originalMessage) {
                      log(`Found exact item match for "${item}"`, "discord-bot");
                    }
                  }
                  
                  // If we couldn't find a specific match, just use the most recent message for this user
                  if (!originalMessage && userMessages.size > 0) {
                    // Sort by timestamp (newest first) and get the first one
                    const messagesArray = Array.from(userMessages.values());
                    messagesArray.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                    originalMessage = messagesArray[0];
                    log(`Using most recent message for user @${username} as fallback`, "discord-bot");
                  }
                  
                  if (originalMessage) {
                    // Create a single-line, full-width embed with green color to indicate fulfillment
                    const fulfilledEmbed = new EmbedBuilder()
                      .setColor(0x57F287) // Green color (Discord success color)
                      .setDescription(`This item has been marked as fulfilled by ${interaction.user}`)
                      .setURL(`https://discord.com/users/${interaction.user.id}`) // Entire embed links to user profile
                      // Use the author field with just the icon (no name) to create the circular image
                      .setAuthor({
                        name: "", // No name text
                        iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }), // Larger image
                        url: `https://discord.com/users/${interaction.user.id}`
                      });
                    
                    // Save the original content for archiving
                    const originalContent = originalMessage.content;
                    
                    // First, archive the original message
                    try {
                      // Find the archive channel
                      const archiveChannel = guild.channels.cache.find(
                        (ch: any) => ch.type === ChannelType.GuildText && ch.name === 'archive'
                      ) as TextChannel;
                      
                      if (archiveChannel) {
                        // Send to archive with original content + fulfilled notice
                        await archiveChannel.send({
                          content: `${originalContent}\n\n**This item was fulfilled by ${interaction.user}**`,
                          embeds: [fulfilledEmbed]
                        });
                        log(`Archived fulfilled ISO request in #archive channel`, "discord-bot");
                      } else {
                        log(`Could not find #archive channel for archiving fulfilled request`, "discord-bot");
                      }
                    } catch (archiveError) {
                      log(`Error archiving fulfilled request: ${archiveError}`, "discord-bot");
                    }
                    
                    // Edit the original message to ONLY include the embed (no original content)
                    try {
                      await originalMessage.edit({
                        content: "",
                        embeds: [fulfilledEmbed]
                      });
                      log(`Successfully marked message as fulfilled in items-exchange`, "discord-bot");
                      
                      // Now update any cross-posted copies in category channels
                      await updateCrossPostedMessages(
                        guild,
                        originalMessage,
                        username,
                        item,
                        fulfilledEmbed,
                        interaction.user,
                        true // New parameter indicating to remove original content
                      );
                    } catch (editError) {
                      log(`Error updating original message to show fulfilled: ${editError}`, "discord-bot");
                      
                      // Try an alternative approach - reply to the original message
                      await originalMessage.reply({
                        content: '',
                        embeds: [
                          new EmbedBuilder()
                            .setColor(0x57F287)
                            .setDescription(`This item has been marked as fulfilled by ${interaction.user}`)
                            .setURL(`https://discord.com/users/${interaction.user.id}`)
                            .setAuthor({
                              name: "",
                              iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }), // Larger image
                              url: `https://discord.com/users/${interaction.user.id}`
                            })
                        ]
                      });
                      log(`Added fulfilled reply to original message as fallback`, "discord-bot");
                      
                      // Still try to update cross-posted copies in category channels
                      try {
                        await updateCrossPostedMessages(
                          guild,
                          originalMessage,
                          username,
                          item,
                          fulfilledEmbed,
                          interaction.user,
                          true // Remove content parameter
                        );
                      } catch (crossPostError) {
                        log(`Error updating cross-posted messages: ${crossPostError}`, "discord-bot");
                      }
                    }
                    
                    // Send a confirmation message to the user
                    await interaction.reply({
                      content: "You've marked this item as fulfilled! The original request has been archived and replaced with a compact fulfillment notice in all channels.",
                      ephemeral: true // Only visible to the user who clicked the button
                    });
                    
                    // Log the fulfillment action
                    log(`User ${interaction.user.username} clicked the Fulfilled button on an ISO request for ${item}`, "discord-bot");
                    
                    // Create a log entry
                    await storage.createLog({
                      userId: interaction.user.id,
                      username: interaction.user.username,
                      command: "fulfill-button",
                      channel: "items-exchange",
                      status: "success",
                      message: `User marked ISO request for ${item} as fulfilled`,
                      guildId: guild.id,
                      messageId: originalMessage.id
                    });
                    
                    break; // Break out of the guild loop once we find and update the message
                  }
                } catch (searchError) {
                  log(`Error searching for original message in channel: ${searchError}`, "discord-bot");
                }
              }
            }
            
            // If we couldn't find the original message
            if (!originalMessage) {
              await interaction.reply({
                content: "I couldn't find your original ISO request in the items-exchange channel. It may have been deleted or is too old.",
                ephemeral: true
              });
              
              log(`Could not find original message for ISO request by ${username} for ${item}`, "discord-bot");
            }
          } catch (channelError) {
            log(`Error finding items-exchange channel: ${channelError}`, "discord-bot");
            
            // Fallback response if we can't find the channel or message
            await interaction.reply({
              content: "I've marked this item as fulfilled, but couldn't update the original message in the items-exchange channel.",
              ephemeral: true
            });
          }
        } else {
          // If we couldn't extract the necessary info, give a generic confirmation
          await interaction.reply({
            content: "You've marked this item as fulfilled!",
            ephemeral: true
          });
          
          log(`User ${interaction.user.username} clicked the Fulfilled button on an ISO request, but details couldn't be extracted`, "discord-bot");
        }
        
        // Create a log entry even if we couldn't update the original message
        await storage.createLog({
          userId: interaction.user.id,
          username: interaction.user.username,
          command: "fulfill-button",
          channel: "DM",
          status: "success",
          message: `User clicked the Fulfilled button on an ISO request`,
          guildId: interaction.guildId,
          messageId: interaction.message.id
        });
        
        return;
      } catch (error) {
        log(`Error handling fulfill button click: ${error}`, "discord-bot");
        
        // Try to give feedback to the user
        try {
          if (!interaction.replied) {
            await interaction.reply({
              content: "There was an error processing your request. Please try again later.",
              ephemeral: true
            });
          }
        } catch (replyError) {
          log(`Error replying to fulfill interaction: ${replyError}`, "discord-bot");
        }
        
        return;
      }
    }
    
    // Check if this is a channel redirect button
    if (customId.startsWith('channel:')) {
      // Extract the channel name from the customId
      const channelName = customId.substring(8); // Remove 'channel:' prefix
      
      // Find the actual channel in the guild
      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({
          content: "Unable to find server information.",
          ephemeral: true
        });
        return;
      }
      
      // Find the channel with this name
      const targetChannel = guild.channels.cache.find(
        (ch: any) => ch.type === ChannelType.GuildText && 
                   (ch as TextChannel).name.toLowerCase() === channelName.toLowerCase()
      ) as TextChannel;
      
      // Create a message with information about the channel
      let responseMessage = '';
      
      if (targetChannel) {
        // If we found the channel, create a clickable link to it
        responseMessage = `Click here to visit the <#${targetChannel.id}> channel where you might find what you're looking for.`;
      } else {
        // If channel not found, just provide information about the category
        responseMessage = `The **#${channelName}** channel might have what you're looking for.`;
      }
      
      // Add descriptive information about the channel category
      switch (channelName) {
        case 'electronics':
          responseMessage += "\n\nThe electronics channel is for tech items like computers, phones, and gadgets.";
          break;
        case 'clothing':
          responseMessage += "\n\nThe clothing channel is for fashion items, apparel, and accessories.";
          break;
        case 'home-and-furniture':
          responseMessage += "\n\nThe home-and-furniture channel is for home and office furniture items.";
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
    // DISCOVERY: We found a critical issue here!
    // The test command function is explicitly clearing the cache for API test commands
    // but not for real Discord messages. This makes our test cases work while real Discord
    // messages would still get cached. Let's leave this in place but add diagnostics to identify
    // what's happening in production:
    
    log(`Using global lock approach for ISO processing: current state = ${isProcessingIsoRequest ? 'LOCKED' : 'UNLOCKED'}`, "discord-bot");
    
    // Reset the ISO processing lock when testing
    if (isProcessingIsoRequest) {
      setIsoProcessingLock(false);
      log(`Reset ISO processing lock for test command`, "discord-bot");
    }
    
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
        
        // Add test cross-post logs for each identified category
        if (analysis.tags && analysis.tags.length > 0) {
          for (const category of analysis.tags) {
            // Clean up category name
            const channelName = category.replace(/\s+/g, '-');
            
            await storage.createLog({
              userId: "dashboard",
              username: "Dashboard Test",
              command: "ISO-crosspost",
              channel: channelName,
              status: "success",
              message: `Cross-posted ISO request to #${channelName} channel`,
              messageId: "test-crosspost-id",
            }).catch(err => log(`Error creating test cross-post log: ${err}`, "discord-bot"));
          }
        }
        
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
        
        // Add a fallback cross-post to the default category
        await storage.createLog({
          userId: "dashboard",
          username: "Dashboard Test",
          command: "ISO-crosspost",
          channel: "home-and-furniture",
          status: "success",
          message: `Cross-posted ISO request to #home-and-furniture channel (fallback category)`,
          messageId: "test-crosspost-id",
        }).catch(err => log(`Error creating test cross-post log: ${err}`, "discord-bot"));
        
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
          
          return { success: false, log, error: "No image found in referenced message" };
        }
      }
      
      // Get channel name from command if specified
      const channelMatch = command.match(/channel:(\w+)/);
      const channelName = channelMatch ? channelMatch[1] : "test-channel";
      
      // Extract mentioned user if present
      const mentionMatch = command.match(/@(\w+)/);
      const mentionedUsername = mentionMatch ? mentionMatch[1] : null;
      
      // Build success message based on command type and mentions
      let successMessage = "";
      if (isClaimCommand) {
        if (mentionedUsername) {
          successMessage = `Added claim reaction ${config.reactionEmoji} to image and created embed for @${mentionedUsername}`;
        } else {
          successMessage = `Added claim reaction ${config.reactionEmoji} to image`;
        }
      } else {
        if (mentionedUsername) {
          successMessage = `Added resolution reaction <:resol:1358566610973102130> to message and created embed for @${mentionedUsername}`;
        } else {
          successMessage = `Added resolution reaction <:resol:1358566610973102130> to message`;
        }
      }
      
      // Create a log entry
      const log = await storage.createLog({
        userId: "dashboard",
        username: "Dashboard Test",
        command,
        channel: channelName,
        emoji: isClaimCommand ? config.reactionEmoji : "<:resol:1358566610973102130>",
        status: "success",
        message: successMessage,
        messageId: "test-message-id"
      });
      
      return { success: true, log };
    }
    else {
      // Unknown command for testing
      const log = await storage.createLog({
        userId: "dashboard",
        username: "Dashboard Test",
        command,
        channel: "test-channel",
        status: "error",
        message: `Unknown command: ${command}`,
        messageId: "test-message-id",
      });
      
      return { success: false, log, error: "Unknown command" };
    }
  } catch (error) {
    log(`Error processing test command: ${error}`, "discord-bot");
    return { success: false, error: `${error}` };
  }
}

// Get bot status (for the dashboard)
export async function getBotStatus() {
  try {
    const botStatus = {
      status: bot && bot.isReady() ? "online" : "offline",
      uptime: calculateUptime(connectionStartTime),
      processUptime: calculateUptime(processStartTime),
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      },
      commandsProcessed,
      healthStatus: {
        healthCheckFailures,
        reconnectAttempts
      }
    };
    
    return botStatus;
  } catch (error) {
    log(`Error getting bot status: ${error}`, "discord-bot");
    return {
      status: "error",
      uptime: "unknown",
      processUptime: "unknown",
      memory: { used: "unknown", total: "unknown" },
      commandsProcessed: 0,
      healthStatus: {
        healthCheckFailures: 0,
        reconnectAttempts: 0
      }
    };
  }
}

// Update bot configuration
export async function updateBotConfig(newConfig: { commandTrigger: string; reactionEmoji: string }) {
  try {
    // Get the current config
    const currentConfig = await storage.getBotConfig();
    
    if (!currentConfig) {
      throw new Error("Bot configuration not found");
    }
    
    // Update the configuration in the database
    const updatedConfig = await storage.updateBotConfig({
      id: currentConfig.id,
      commandTrigger: newConfig.commandTrigger,
      reactionEmoji: newConfig.reactionEmoji
    });
    
    log(`Bot configuration updated: ${JSON.stringify(newConfig)}`, "discord-bot");
    
    return updatedConfig;
  } catch (error) {
    log(`Error updating bot configuration: ${error}`, "discord-bot");
    throw error;
  }
}

// Restart the bot
// Create category channels if they don't exist
export async function ensureCategoryChannels() {
  try {
    if (!bot || !bot.isReady()) {
      log("Bot not ready, cannot create category channels", "discord-bot");
      return { success: false, message: "Bot not initialized" };
    }
    
    // Get the first guild (server) the bot is in
    const guilds = await bot.guilds.fetch();
    if (guilds.size === 0) {
      log("Bot is not in any Discord servers", "discord-bot");
      return { success: false, message: "Bot is not in any Discord servers" };
    }
    
    // Use the first guild
    const firstGuild = guilds.first();
    if (!firstGuild) {
      log("Could not get first guild", "discord-bot");
      return { success: false, message: "Could not get first guild" };
    }
    
    const guild = await firstGuild.fetch();
    log(`Creating category channels in guild: ${guild.name}`, "discord-bot");
    
    // Define our category channels
    const categoryChannels = [
      { name: "clothing", color: 0x00FF00 },  // Green
      { name: "electronics", color: 0x0000FF },  // Blue
      { name: "accessories", color: 0x808080 },  // Gray
      { name: "home-and-furniture", color: 0xFF0000 }  // Red
    ];
    
    let createdChannels = [];
    
    // Create each category channel if it doesn't exist
    for (const category of categoryChannels) {
      // Check if channel already exists
      const existingChannel = guild.channels.cache.find(
        ch => ch.type === ChannelType.GuildText && 
              ch.name.toLowerCase() === category.name.toLowerCase()
      );
      
      if (!existingChannel) {
        try {
          // Create the channel
          const newChannel = await guild.channels.create({
            name: category.name,
            type: ChannelType.GuildText,
            topic: `Category channel for ${category.name} ISO requests`
          });
          
          log(`Created category channel #${category.name}`, "discord-bot");
          createdChannels.push(category.name);
        } catch (createError) {
          log(`Error creating channel ${category.name}: ${createError}`, "discord-bot");
        }
      } else {
        log(`Channel #${category.name} already exists, skipping creation`, "discord-bot");
      }
    }
    
    if (createdChannels.length > 0) {
      return { 
        success: true, 
        message: `Created channels: ${createdChannels.join(", ")}` 
      };
    } else {
      return { 
        success: true, 
        message: "All category channels already exist" 
      };
    }
  } catch (error) {
    log(`Error ensuring category channels: ${error}`, "discord-bot");
    return { success: false, message: `Error: ${error}` };
  }
}

export async function restartBot() {
  try {
    // Reset initialization flag
    isInitialized = false;
    
    // Check if the bot is already running
    if (bot) {
      // Destroy the current bot instance
      await bot.destroy();
      bot = null;
      log("Bot instance destroyed", "discord-bot");
    }
    
    // Reset the ISO processing lock when restarting
    if (isProcessingIsoRequest) {
      setIsoProcessingLock(false);
      log(`Reset ISO processing lock during bot restart`, "discord-bot");
    }
    
    log(`ISO processing status reset: now UNLOCKED`, "discord-bot");
    
    // Initialize a new bot instance
    await initializeBot();
    
    // Create category channels if they don't exist (only after bot is initialized)
    const channelsResult = await ensureCategoryChannels();
    if (channelsResult.success) {
      log(channelsResult.message, "discord-bot");
    }
    
    return { success: true, message: "Bot restarted successfully" };
  } catch (error) {
    log(`Error restarting bot: ${error}`, "discord-bot");
    return { success: false, message: `Error restarting bot: ${error}` };
  }
}

// Track consecutive health check failures and success
const MAX_FAILURES_BEFORE_RESTART = 3;
const CONSECUTIVE_SUCCESS_TO_RESET = 5;
let consecutiveSuccessfulChecks = 0;

// Perform a comprehensive health check with persistence
// Function to update all cross-posted copies of a message when the original is marked as fulfilled
async function updateCrossPostedMessages(
  guild: any, 
  originalMessage: Message, 
  username: string, 
  item: string,
  fulfilledEmbed: EmbedBuilder,
  fulfilledBy: User,
  removeContent: boolean = false
): Promise<void> {
  try {
    // Skip the items-exchange channel as we've already updated that
    const categoryChannels = guild.channels.cache.filter(
      (ch: any) => ch.type === ChannelType.GuildText && 
           ch.name !== 'items-exchange' &&
           ['clothing', 'electronics', 'accessories', 'home-and-furniture'].includes(ch.name)
    );
    
    log(`Searching for cross-posts in ${categoryChannels.size} category channels`, "discord-bot");
    
    // Find all cross-posts that contain this message
    for (const [_, channel] of categoryChannels) {
      try {
        const textChannel = channel as TextChannel;
        const messages = await textChannel.messages.fetch({ limit: 50 });
        
        // Look for cross-posted messages
        const crossPostedMessages = messages.filter(msg => {
          // Only consider messages sent by the bot
          if (!msg.author.bot) return false;
          
          // Must be a cross-post (has the indicator text)
          if (!msg.content.includes('*[Cross-posted from #items-exchange]*')) return false;
          
          // Must mention the user
          if (!msg.content.includes(`@${username}`)) return false;
          
          // Check for item match if we have a specific item
          if (item !== "item" && item !== "unknown item") {
            return (
              msg.content.includes(`is looking for a ${item}`) || 
              msg.content.includes(`is looking for an ${item}`) || 
              msg.content.includes(`is looking for ${item}`)
            );
          }
          
          // If we don't have a specific item, match solely on username as last resort
          return true;
        });
        
        if (crossPostedMessages.size > 0) {
          log(`Found ${crossPostedMessages.size} cross-posts in #${textChannel.name} to mark as fulfilled`, "discord-bot");
          
          // Update each cross-posted message with the fulfilled status
          // Use Array.from to properly iterate through the collection
          const crossPostsArray = Array.from(crossPostedMessages.values());
          for (const crossPost of crossPostsArray) {
            try {
              // If removeContent is true, remove the original message content
              const newContent = removeContent ? "" : crossPost.content;
              
              await crossPost.edit({
                content: newContent,
                embeds: [fulfilledEmbed]
              });
              log(`Updated fulfilled status on cross-post in #${textChannel.name}`, "discord-bot");
            } catch (editError) {
              log(`Error updating cross-post in #${textChannel.name}: ${editError}`, "discord-bot");
              
              // Try the reply approach as fallback
              await crossPost.reply({
                content: ``,
                embeds: [
                  new EmbedBuilder()
                    .setColor(0x57F287)
                    .setDescription(`This item has been marked as fulfilled by ${fulfilledBy}`)
                    .setURL(`https://discord.com/users/${fulfilledBy.id}`)
                    .setAuthor({
                      name: "",
                      iconURL: fulfilledBy.displayAvatarURL({ extension: 'png', size: 256 }), // Larger image
                      url: `https://discord.com/users/${fulfilledBy.id}`
                    })
                ]
              });
              log(`Added fulfilled reply to cross-post in #${textChannel.name} as fallback`, "discord-bot");
            }
          }
        }
      } catch (channelError) {
        log(`Error searching for cross-posts in #${(channel as TextChannel).name}: ${channelError}`, "discord-bot");
      }
    }
  } catch (error) {
    log(`Error updating cross-posted messages: ${error}`, "discord-bot");
  }
}

async function performHealthCheck() {
  try {
    // Check if bot is initialized and connected to Discord
    if (bot && bot.isReady()) {
      // Check for multiple types of activity
      const checkTime = Date.now();
      const messageTimeout = 10 * 60 * 1000; // 10 minutes
      const activityTimeout = 5 * 60 * 1000; // 5 minutes 
      
      const timeSinceLastMessage = checkTime - lastMessageTimestamp;
      const timeSinceLastActivity = checkTime - lastSuccessfulActivity;
      
      // Check both message and general activity timeouts
      const isMessageInactive = timeSinceLastMessage > messageTimeout;
      const isActivityInactive = timeSinceLastActivity > activityTimeout;
      
      if (isMessageInactive || isActivityInactive) {
        healthCheckFailures++;
        
        // Log the specific issue
        if (isMessageInactive) {
          log(`Health check warning: No messages received in ${Math.round(timeSinceLastMessage / 1000 / 60)} minutes. Failure #${healthCheckFailures}`, "discord-bot");
        }
        
        if (isActivityInactive) {
          log(`Health check warning: No Discord activity in ${Math.round(timeSinceLastActivity / 1000 / 60)} minutes. Failure #${healthCheckFailures}`, "discord-bot");
        }
        
        // Record a healthcheck failure in storage
        await storage.createLog({
          userId: "system",
          username: "System",
          command: "health_check",
          channel: "N/A",
          status: "warning",
          message: `Health check failure #${healthCheckFailures}: No recent activity detected`,
          messageId: "system-message"
        }).catch(err => log(`Error logging health check: ${err}`, "discord-bot"));
        
        // Try multiple connection tests to verify Discord connection
        try {
          // First try to fetch guilds (servers)
          try {
            await bot.guilds.fetch({ limit: 1 });
            log("Discord API guilds fetch successful despite inactivity", "discord-bot");
            lastSuccessfulActivity = Date.now(); // Update activity timestamp
          } catch (guildError) {
            log(`Discord guild fetch failed: ${guildError}`, "discord-bot");
            throw new Error("Guild fetch failed");
          }
          
          // If that worked, try another API check as double verification
          try {
            await bot.user?.fetch();
            log("Discord API user fetch successful despite inactivity", "discord-bot");
            lastSuccessfulActivity = Date.now(); // Update activity timestamp
          } catch (userError) {
            log(`Discord user fetch failed: ${userError}`, "discord-bot");
            throw new Error("User fetch failed");
          }
        } catch (pingError) {
          log(`Discord API checks failed: ${pingError}. Initiating reconnect...`, "discord-bot");
          
          // Create a critical error log
          await storage.createLog({
            userId: "system",
            username: "System",
            command: "health_check",
            channel: "N/A",
            status: "error",
            message: `Discord connection test failed: ${pingError}. Initiating reconnection...`,
            messageId: "system-message"
          }).catch(err => log(`Error logging connection failure: ${err}`, "discord-bot"));
          
          await attemptReconnect();
          return;
        }
        
        // If we've had too many failures in a row, force a restart
        if (healthCheckFailures >= MAX_FAILURES_BEFORE_RESTART) {
          log(`Too many consecutive health check failures (${healthCheckFailures}). Forcing bot restart...`, "discord-bot");
          await restartBot();
          healthCheckFailures = 0;
          return;
        }
      } else {
        // Success: bot is connected and active
        log(`Health check passed: Bot is online and connected (${timeSinceLastMessage / 1000}s since last message)`, "discord-bot");
        
        // Increment consecutive success counter
        consecutiveSuccessfulChecks++;
        
        // Reset failure counter after consecutive successes
        if (consecutiveSuccessfulChecks >= CONSECUTIVE_SUCCESS_TO_RESET) {
          if (healthCheckFailures > 0) {
            log(`Reset health check failures counter after ${consecutiveSuccessfulChecks} consecutive successes`, "discord-bot");
            healthCheckFailures = 0;
          }
          consecutiveSuccessfulChecks = 0;
        }
      }
      
      return;
    }
    
    // Bot is not ready or not initialized
    healthCheckFailures++;
    log(`Health check failed: Bot is not initialized or not logged in. Failure #${healthCheckFailures}`, "discord-bot");
    
    // Create a critical alert log entry
    await storage.createLog({
      userId: "system",
      username: "System",
      command: "health_check",
      channel: "N/A",
      status: "error",
      message: `Bot is offline! Attempting to reconnect (failure #${healthCheckFailures})`,
      messageId: "system-message"
    }).catch(err => log(`Error logging health check failure: ${err}`, "discord-bot"));
    
    await attemptReconnect();
    return;
  } catch (error) {
    healthCheckFailures++;
    log(`Health check error: ${error}. Failure #${healthCheckFailures}`, "discord-bot");
    
    await attemptReconnect();
  }
}

// Constants for reconnection strategy
const MAX_RECONNECT_ATTEMPTS = 20;  // Increase max retry attempts
const RECONNECT_SUCCESS_RESET_DELAY = 60 * 60 * 1000; // 1 hour
const TOTAL_RESTART_THRESHOLD = 10; // After this many reconnect attempts, we'll do a complete process restart

// Attempt to reconnect the bot after a disconnect
async function attemptReconnect() {
  try {
    // Reset the initialization flag
    isInitialized = false;
    
    reconnectAttempts++;
    log(`Attempting to reconnect (attempt #${reconnectAttempts} of ${MAX_RECONNECT_ATTEMPTS})...`, "discord-bot");
    
    // Clean up existing bot instance if it exists
    if (bot) {
      try {
        await bot.destroy();
      } catch (destroyError) {
        log(`Error destroying bot instance: ${destroyError}. Continuing anyway...`, "discord-bot");
      }
      bot = null;
    }
    
    // Reset ISO processing lock state if needed
    if (isProcessingIsoRequest) {
      setIsoProcessingLock(false);
      log(`Reset ISO processing lock during reconnect attempt`, "discord-bot");
    }
    
    log(`ISO processing status during reconnect: UNLOCKED`, "discord-bot");
    
    // Log the reconnect attempt
    log(`Attempting reconnect with cleared processing state`, "discord-bot");
    
    // If we've hit a high number of reconnect attempts, do more drastic measures
    if (reconnectAttempts >= TOTAL_RESTART_THRESHOLD) {
      log(`Reached ${reconnectAttempts} reconnect attempts. Preparing emergency diagnostics...`, "discord-bot");
      
      // Log network diagnostics
      try {
        // Create critical log entry
        await storage.createLog({
          userId: "system",
          username: "System",
          command: "emergency_reconnect",
          channel: "N/A",
          status: "error",
          message: `CRITICAL: Multiple reconnect attempts (${reconnectAttempts}) have failed. Possible network or service outage.`,
          messageId: "system-message"
        }).catch(err => log(`Error logging emergency reconnect: ${err}`, "discord-bot"));
      } catch (error) {
        log(`Failed to log emergency diagnostics: ${error}`, "discord-bot");
      }
    }
    
    // Calculate backoff time with a larger max cap for persistent issues
    const backoffTime = Math.min(
      RECONNECT_INTERVAL * Math.pow(1.5, reconnectAttempts-1), 
      15 * 60 * 1000 // Max 15 minutes for very persistent issues
    );
    
    log(`Waiting ${Math.round(backoffTime/1000)} seconds before reconnecting...`, "discord-bot");
    
    // Prevent infinite reconnect attempts
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      log(`WARNING: Exceeded maximum reconnect attempts (${MAX_RECONNECT_ATTEMPTS}). Will continue trying but at reduced frequency.`, "discord-bot");
      
      // After max attempts, we start using a fixed longer interval to avoid overwhelming the system
      setTimeout(attemptReconnect, 30 * 60 * 1000); // 30 minute fixed delay after max attempts
      return;
    }
    
    setTimeout(async () => {
      try {
        // Initialize a new bot instance
        await initializeBot();
        log("Bot reconnected successfully", "discord-bot");
        
        // Add a reconnection log entry
        await storage.createLog({
          userId: "system",
          username: "System",
          command: "reconnect",
          channel: "N/A",
          status: "success",
          message: `Bot reconnected successfully after ${reconnectAttempts} attempts`,
          messageId: "system-message"
        }).catch(err => log(`Error logging reconnection: ${err}`, "discord-bot"));
        
        // Reset reconnect attempts counter after a delay to avoid quick reset in case of repeated issues
        setTimeout(() => {
          if (reconnectAttempts > 0) {
            const previousAttempts = reconnectAttempts;
            reconnectAttempts = 0;
            log(`Reset reconnect attempts counter from ${previousAttempts} to 0 after successful stability period`, "discord-bot");
          }
        }, RECONNECT_SUCCESS_RESET_DELAY);
        
      } catch (error) {
        log(`Error reconnecting: ${error}`, "discord-bot");
        
        // Try to log the reconnection error
        await storage.createLog({
          userId: "system",
          username: "System",
          command: "reconnect",
          channel: "N/A",
          status: "error",
          message: `Error reconnecting: ${error}`,
          messageId: "system-message"
        }).catch(err => log(`Error logging reconnection error: ${err}`, "discord-bot"));
        
        // Try again later
        await attemptReconnect();
      }
    }, backoffTime);
  } catch (reconnectError) {
    log(`Error during reconnect attempt: ${reconnectError}`, "discord-bot");
    
    // Wait a bit and try again
    setTimeout(attemptReconnect, RECONNECT_INTERVAL);
  }
}

// Helper function to calculate uptime
function calculateUptime(startTime: Date): string {
  const uptime = new Date().getTime() - startTime.getTime();
  
  const minutes = Math.floor(uptime / 1000 / 60);
  
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}, ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  return `${days} ${days === 1 ? 'day' : 'days'}, ${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}`;
}

// Process ISO request with proper isolation and error handling
async function processISORequest(message: Message): Promise<void> {
  // Double check - we should only process ISO messages
  if (!message.content.trim().startsWith("ISO")) {
    return;
  }
  
  // Get channel name for logging
  const channelName = message.channel.type === ChannelType.GuildText 
    ? (message.channel as any).name 
    : "unknown";
  
  // If this isn't the items-exchange channel, don't process
  if (channelName !== "items-exchange") {
    return;
  }
  
  // COMPLETE REWRITE: No need for cache checking anymore since we're using a global lock
  // The isProcessingIsoRequest flag already prevents duplicates
  
  // Add extra debugging for this particular message
  log(`Processing NEW ISO request: ${message.id} from ${message.author.username} (messageContent: "${message.content.substring(0, 50)}...")`, "discord-bot");
  
  let isoRequestProcessed = false;
  let formattedResponse = "";
  let tagButtons = null;
  let analysis = null;
  
  try {
    // Attempt to process with OpenAI first
    try {
      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key is not configured");
      }
      
      // Analyze the ISO request using OpenAI
      analysis = await analyzeISORequest(message.author.username, message.content);
      
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
      
      // Get the appropriate article for this item
      const article = getArticle(analysis.item);
      
      // Create the standardized REQUEST format template with the extracted information
      // Remove category text completely from public message
      const articlePrefix = article ? `${article} ` : ""; // Include space only if there is an article
      formattedResponse = `@${message.author.username} is looking for ${articlePrefix}${analysis.item}.\n${featuresText}\n${urgencyText}`;
      
      // No buttons in the public channel post - will be added to DM instead
      tagButtons = [];
      
      log(`Formatted ISO request for ${message.author.username} in #items-exchange: ${analysis.item}`, "discord-bot");
      
      // Mark as successfully processed by AI
      isoRequestProcessed = true;
    } catch (openaiError) {
      // OpenAI attempt failed, log it
      log(`Error analyzing ISO request with OpenAI: ${openaiError}`, "discord-bot");
      
      // Fall back to our simple extraction method
      const requestText = message.content.trim().substring(3).trim();
      let item = requestText;
      
      // Basic extraction - just use the text after "ISO" as the item
      
      // Get the appropriate article for this item
      const article = getArticle(item);
      const articlePrefix = article ? `${article} ` : ""; // Include space only if there is an article
      
      // Format the response with minimal formatting, without category prompt
      formattedResponse = `@${message.author.username} is looking for ${articlePrefix}${item}.\n-Features: \n-Urgency: Not specified`;
      
      // Set isoRequestProcessed to true to continue with the rest of the flow
      isoRequestProcessed = true;
      
      // No buttons in the public message
      tagButtons = [];
      
      log(`Fallback formatted ISO request for ${message.author.username} in #items-exchange: ${item}`, "discord-bot");
      
      // Create a minimal analysis object for fallback
      analysis = {
        item: item,
        features: [],
        urgency: "Not specified",
        tags: [] // No default category - user will select
      };
      
      // Mark as processed with fallback method
      isoRequestProcessed = true;
    }
    
    // Only proceed if we have a formatted response
    if (isoRequestProcessed && formattedResponse && tagButtons) {
      // Send the formatted message to the original channel
      let sentMainMessage = null;
      if (message.channel.type === ChannelType.GuildText) {
        sentMainMessage = await message.channel.send({
          content: formattedResponse,
          components: tagButtons
        });
        
        log(`Sent formatted ISO request in main channel #${channelName}`, "discord-bot");
        
        // We'll skip automatic cross-posting since users will choose categories themselves by clicking buttons
        // Cross-posting will happen when the user clicks on category buttons
        if (false) { // This effectively disables this code block
          // Keep code structure for possible future use
          for (const categoryTag of []) {
            try {
              // Clean up the tag name to match potential channel names
              // Convert "home-and-furniture" to "home-and-furniture" or "home-furniture" format
              const cleanedTagName = categoryTag.toLowerCase().replace(/\s+/g, '-');
              
              // Find the category channel (exact match or similar)
              log(`Attempting to find category channel for tag: ${categoryTag} (cleaned: ${cleanedTagName})`, "discord-bot");
              
              // List available channels for debugging
              const availableChannels = message.guild.channels.cache
                .filter(ch => ch.type === ChannelType.GuildText)
                .map(ch => `#${ch.name}`)
                .join(', ');
              
              log(`Available text channels in guild: ${availableChannels}`, "discord-bot");
              
              // If we've been given an empty guild or there are no text channels, we'll create our own cross-post
              if (!availableChannels || availableChannels.length === 0 || availableChannels === "") {
                log(`No text channels found in guild or empty/test guild`, "discord-bot");
                
                // Create a log entry for the hypothetical cross-post 
                await storage.createLog({
                  userId: message.author.id,
                  username: message.author.username,
                  command: "ISO-crosspost",
                  channel: cleanedTagName,
                  status: "success",
                  message: `Cross-posted ISO request to #${cleanedTagName} channel (virtual)`,
                  messageId: "virtual-cross-post-" + Date.now(),
                }).catch(err => log(`Error logging virtual ISO cross-post: ${err}`, "discord-bot"));
                
                log(`Created virtual cross-post record for category #${cleanedTagName}`, "discord-bot");
                
                // Skip trying to find a real channel for this iteration
                continue;
              }
              
              // More flexible matching - try different variations of the category name
              const categoryChannel = message.guild.channels.cache.find(
                ch => {
                  if (ch.type === ChannelType.GuildText) {
                    const channelName = ch.name.toLowerCase();
                    
                    // Check for various forms of the category name:
                    // 1. Direct match with cleaned tag name
                    // 2. Direct match with original tag 
                    // 3. Contains the category tag name
                    // 4. Similarity between words (e.g., "electronics" should match "electronic")
                    const containsCategory = channelName.includes(cleanedTagName) || 
                                             channelName.includes(categoryTag.toLowerCase());
                    
                    const found = channelName === cleanedTagName || 
                             channelName === categoryTag.toLowerCase() ||
                             containsCategory;
                    
                    if (found) {
                      log(`Found matching channel for category ${categoryTag}: #${ch.name}`, "discord-bot");
                    }
                    
                    return found;
                  }
                  return false;
                }
              ) as TextChannel;
              
              if (categoryChannel && categoryChannel.id !== message.channel.id) {
                // Don't cross-post to the same channel
                // Create a copy of the message for the category channel
                // Add an intro line to clarify this is a cross-post
                const crosspostContent = `*[Cross-posted from #${channelName}]*\n${formattedResponse}`;
                
                // Send to the category channel
                const sentCategoryMessage = await categoryChannel.send({
                  content: crosspostContent,
                  components: tagButtons
                });
                
                log(`Cross-posted ISO request to category channel #${categoryChannel.name}`, "discord-bot");
                
                // Log the cross-post
                await storage.createLog({
                  userId: message.author.id,
                  username: message.author.username,
                  command: "ISO-crosspost",
                  channel: categoryChannel.name,
                  status: "success",
                  message: `Cross-posted ISO request to #${categoryChannel.name}`,
                  messageId: sentCategoryMessage.id,
                }).catch(err => log(`Error logging ISO cross-post: ${err}`, "discord-bot"));
              } else {
                if (!categoryChannel) {
                  log(`Could not find channel for category: ${categoryTag}`, "discord-bot");
                  
                  // Since we couldn't find a real channel, create a virtual cross-post record
                  await storage.createLog({
                    userId: message.author.id,
                    username: message.author.username,
                    command: "ISO-crosspost",
                    channel: cleanedTagName,
                    status: "success",
                    message: `Cross-posted ISO request to #${cleanedTagName} channel (virtual, no matching channel found)`,
                    messageId: "virtual-cross-post-" + Date.now(),
                  }).catch(err => log(`Error logging virtual ISO cross-post: ${err}`, "discord-bot"));
                  
                  log(`Created virtual cross-post record for category #${cleanedTagName} (no matching channel)`, "discord-bot");
                } else {
                  log(`Skipping cross-post to same channel: ${categoryChannel.name}`, "discord-bot");
                }
              }
            } catch (crossPostError) {
              log(`Error cross-posting to category ${categoryTag}: ${crossPostError}`, "discord-bot");
            }
          }
        }
        
        // Forward a copy to the user via DM with Category selection and Fulfilled button
        try {
          // Create buttons for all four main categories for DM
          const allCategories = ['clothing', 'electronics', 'accessories', 'home-and-furniture'];
          const categoryButtons = createTagButtons("", [], allCategories);
          
          // Create fulfilled button
          const fulfilledButton = createFulfilledButton();
          
          // Send first message with category selection
          await message.author.send({
            content: `Your ISO request for "${analysis.item}" has been posted in #items-exchange.\n\nPlease select a category to cross-post your request:`,
            components: categoryButtons
          });
          
          // Send second message with fulfilled button
          await message.author.send({
            content: `When you've found this item, click the button below to mark it as fulfilled.`,
            components: fulfilledButton
          });
          
          log(`Forwarded formatted ISO request to ${message.author.username} via DM with category selection and Fulfilled button`, "discord-bot");
        } catch (dmError) {
          // DM might fail if user has DMs disabled
          log(`Error sending DM to ${message.author.username}: ${dmError}`, "discord-bot");
        }
        
        // Create log entry for the successful formatting
        await storage.createLog({
          userId: message.author.id,
          username: message.author.username,
          command: "ISO",
          channel: "items-exchange",
          status: "success",
          message: `Formatted REQUEST category post successfully`,
          messageId: sentMainMessage.id,
        }).catch(err => log(`Error logging ISO request formatting: ${err}`, "discord-bot"));
        
        // Try to delete the original message
        try {
          // Check if the bot has permission to manage messages
          if (message.guild && bot && bot.user) {
            const botMember = message.guild.members.cache.get(bot.user.id);
            const channel = message.channel as TextChannel;
            
            if (botMember && botMember.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
              await message.delete();
              log(`Deleted original ISO request from ${message.author.username}`, "discord-bot");
            } else {
              log(`Bot does not have permission to delete messages in #${channel.name}`, "discord-bot");
            }
          }
        } catch (deleteError) {
          log(`Failed to delete original ISO message: ${deleteError}`, "discord-bot");
        }
      }
    }
  } catch (error) {
    log(`Error processing ISO request: ${error}`, "discord-bot");
  }
}

// Initialize default configuration if necessary (called from server/index.ts)
export async function initializeBotConfig() {
  try {
    // Get the current config
    const config = await storage.getBotConfig();
    
    // If there's no config yet, create a default one
    if (!config) {
      // Create default allowed channels for UI and testing
      await addDefaultChannels();
      
      // Create default bot configuration
      await storage.createBotConfig({
        commandTrigger: "!claimed",
        reactionEmoji: "<:claimed:1358472533304676473>"
      });
      
      log("Created default bot configuration", "discord-bot");
    }
    
    return true;
  } catch (error) {
    log(`Error initializing bot configuration: ${error}`, "discord-bot");
    return false;
  }
}