// Import required modules
import { 
  Client, ChannelType, Events, GatewayIntentBits, 
  Interaction, Message, MessageReaction, 
  PartialMessageReaction, PartialUser, Partials, 
  User, EmbedBuilder, TextChannel, ButtonBuilder, 
  ButtonStyle, ActionRowBuilder, Collection,
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

// For processing ISO requests, use a global lock to prevent duplicates
let isProcessingIsoRequest = false;

// Helper function to determine the correct article (a, an, or none for plurals)
function getArticle(noun: string): string {
  if (!noun) return "a"; // Default if noun is empty
  
  // Common plural endings, mass nouns, or words that don't need articles
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
    /underwear$/i,     // Items that are always plural
    /food$/i,          // Mass noun "food" doesn't need an article
    /water$/i,         // Mass noun "water" doesn't need an article
    /money$/i,         // Mass noun "money" doesn't need an article
    /rice$/i,          // Mass noun "rice" doesn't need an article
    /equipment$/i,     // Mass noun "equipment" doesn't need an article
    /furniture$/i,     // Mass noun "furniture" doesn't need an article
    /luggage$/i,       // Mass noun "luggage" doesn't need an article
    /information$/i,   // Mass noun "information" doesn't need an article
    /advice$/i,        // Mass noun "advice" doesn't need an article
    /news$/i,          // Mass noun "news" doesn't need an article
    /stuff$/i,         // General "stuff" doesn't need an article
    /gear$/i           // "Gear" doesn't need an article
  ];
  
  // Check if the noun matches any plural patterns
  if (pluralPatterns.some(pattern => pattern.test(noun.toLowerCase()))) {
    return ""; // No article for plurals
  }
  
  // Check for vowel sound to determine 'a' vs 'an'
  const startsWithVowelSound = /^[aeiou]/i.test(noun);
  return startsWithVowelSound ? "an" : "a";
}

// Function to control ISO processing lock
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

// Export initialization function
export async function initializeBot() {
  try {
    // Create default configuration or get existing one
    await initializeBotConfig();
    
    // Add default allowed channels if no channels exist
    await addDefaultChannels();
    
    // Make sure to disable ISO processing lock
    setIsoProcessingLock(false);
    
    // Set up Discord bot
    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions
    ];
    
    // Also include the necessary partials to receive reactions in DMs
    const partials = [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction
    ];
    
    log("Required permissions: READ_MESSAGES, SEND_MESSAGES, READ_MESSAGE_HISTORY, ADD_REACTIONS, EMBED_LINKS", "discord-bot");
    
    // Create the bot client
    bot = new Client({ 
      intents,
      partials
    });
    
    // Register event handlers
    bot.on(Events.MessageCreate, handleMessage);
    bot.on(Events.MessageReactionAdd, async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
      // Ignore reactions from the bot itself
      if (user.bot) return;
      
      // Update activity timestamp when we process reactions
      lastMessageTimestamp = Date.now();
    });
    
    // Register interact handler for button clicks
    bot.on(Events.InteractionCreate, handleInteraction);
    log("Registered interaction handler for button clicks", "discord-bot");
    
    // Login
    const token = process.env.DISCORD_BOT_TOKEN;
    
    if (!token) {
      log("DISCORD_BOT_TOKEN environment variable is not set. Please set it to run the bot.", "discord-bot");
      return;
    }
    
    if (!isValidDiscordToken(token)) {
      log("DISCORD_BOT_TOKEN appears to be invalid. Please check the token format.", "discord-bot");
      return;
    }
    
    await bot.login(token);
    log(`Bot logged in as ${bot.user?.tag}`, "discord-bot");
    
    // Reset timestamp after login
    lastMessageTimestamp = Date.now();
    lastSuccessfulActivity = Date.now();
    connectionStartTime = new Date();
    
    // Reset counters
    reconnectAttempts = 0;
    healthCheckFailures = 0;
    
    // Run a health check every minute
    setInterval(() => {
      performHealthCheck();
    }, 60000);
    
    log("Bot initialized successfully", "discord-bot");
    return bot;
  } catch (error) {
    log(`Failed to initialize bot: ${error}`, "discord-bot");
    return null;
  }
}

// Handle incoming messages
async function handleMessage(message: Message) {
  try {
    // Ignore bot's own messages to prevent loops
    if (message.author.bot) return;
    
    // Update timestamp when we've seen a message
    lastMessageTimestamp = Date.now();
    lastSuccessfulActivity = Date.now();
    
    // Get the bot configuration
    const config = await storage.getBotConfig();
    
    if (!config) {
      log("Bot configuration not found", "discord-bot");
      return;
    }
    
    // Handle ISO requests in the items-exchange channel
    if (message.content.trim().startsWith("ISO") && 
        message.channel.type === ChannelType.GuildText &&
        (message.channel as TextChannel).name === "items-exchange") {
      
      // Check if we're already processing an ISO request to prevent duplicates
      if (isProcessingIsoRequest) {
        log(`Already processing an ISO request, ignoring message from ${message.author.username}`, "discord-bot");
        return;
      }
      
      // Set the processing lock
      setIsoProcessingLock(true);
      
      log(`Processing ISO request from ${message.author.username} in #items-exchange`, "discord-bot");
      
      try {
        await processISORequest(message);
      } catch (isoError) {
        log(`Error in ISO request processing: ${isoError}`, "discord-bot");
      } finally {
        // Make sure we always release the lock, even if there's an error
        setIsoProcessingLock(false);
      }
    }
    
    // Get the bot configuration
    if (!config) {
      await storage.createBotConfig({
        commandTrigger: "!claimed",
        reactionEmoji: "✅",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Check if this is a DM from a user
    if (message.channel.type === ChannelType.DM) {
      // For now, just log that we received a DM
      log(`Received DM from ${message.author.username}: ${message.content}`, "discord-bot");
      return;
    }
    
    // Check for the special 86 command (only in text channels)
    if (message.channel.type === ChannelType.GuildText && message.content === "!86" && message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      log(`Admin command !86 received from ${message.author.username}`, "discord-bot");
      
      // Ask for confirmation first
      const confirmMessage = await message.reply("This will delete the last 100 messages in this channel. Type 'yes' to confirm.");
      
      // Wait for the user's confirmation
      try {
        // Create a filter for the collector
        const filter = (m: Message) => m.author.id === message.author.id && m.content.toLowerCase() === 'yes';
        
        // Wait for confirmation within 30 seconds
        const collected = await message.channel.awaitMessages({ 
          filter, 
          max: 1,
          time: 30000,
          errors: ['time']
        });
        
        // If the user confirmed, bulk delete messages
        if (collected.size > 0) {
          try {
            // Send a processing message first
            await message.channel.send("Processing delete request... this may take a moment.");
            
            // Get messages to delete in smaller batches to avoid timeout
            const messagesToDelete = await message.channel.messages.fetch({ limit: 100 });
            
            // Count the messages
            const messageCount = messagesToDelete.size;
            
            // Discord can only bulk delete messages that are less than 14 days old
            // Filter out messages older than 14 days
            const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const filteredMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);
            
            // Delete messages in smaller batches to avoid timeouts
            if (filteredMessages.size > 0) {
              await (message.channel as TextChannel).bulkDelete(filteredMessages);
              log(`Deleted ${filteredMessages.size} messages from #${(message.channel as TextChannel).name}`, "discord-bot");
              
              // Send confirmation
              const successMessage = await message.channel.send(
                `Successfully deleted ${filteredMessages.size} messages ` +
                `${messageCount > filteredMessages.size ? `(${messageCount - filteredMessages.size} messages were older than 14 days and couldn't be bulk deleted)` : ''}`
              );
              
              // Delete the confirmation message after 5 seconds
              setTimeout(() => {
                successMessage.delete().catch(() => {});
              }, 5000);
            } else {
              await message.channel.send("No messages could be deleted. Discord can only bulk delete messages less than 14 days old.");
            }
          } catch (deleteError) {
            log(`Error deleting messages: ${deleteError}`, "discord-bot");
            await message.channel.send("Error deleting messages. The messages might be too old (Discord can only bulk delete messages less than 14 days old).");
          }
        }
      } catch (error) {
        // Either the user didn't confirm or there was an error
        log(`Error in bulk delete command: ${error}`, "discord-bot");
        await confirmMessage.edit("Operation cancelled or timed out.");
      }
      
      return;
    }
    
    // Check for command in a text channel
    if (message.channel.type === ChannelType.GuildText) {
      // Only respond if the bot is directly mentioned with a greeting
      if (message.mentions.has(bot?.user as User) && 
          /\b(hi|hello|hey|howdy|hola|greetings|yo|sup)\b/i.test(message.content)) {
        log(`Bot was greeted by ${message.author.username}`, "discord-bot");
        await message.reply("Hello! I'm here to help with ISO requests, claimed items, and resolutions.");
        return;
      }
      
      // Check for claimed command that references another message
      if (message.reference && message.content.toLowerCase().includes(config.commandTrigger)) {
        try {
          // Fetch the message being replied to
          const referencedMessage = await message.channel.messages.fetch(message.reference.messageId as string);
          
          // Check if the referenced message contains an image/attachment
          if (referencedMessage.attachments.size > 0 || 
              referencedMessage.embeds.some(embed => embed.image || embed.thumbnail)) {
            log(`${config.commandTrigger} command used by ${message.author.username} on a message with image/attachment`, "discord-bot");
            
            // Add the claimed emoji reaction
            try {
              await referencedMessage.react("<:claimed:1358472533304676473>");
            } catch (emojiError) {
              log(`Error adding claimed emoji: ${emojiError}`, "discord-bot");
              await referencedMessage.react("✅");
            }
            
            let attributionUser = message.author;
            
            // Check if someone is mentioned in the claim message
            if (message.mentions.users.size > 0) {
              // Get the first mentioned user
              attributionUser = message.mentions.users.first() as User;
            }
            
            // Create a simple embed to attribute the claim
            const claimEmbed = new EmbedBuilder()
              .setColor(0x0099FF)
              .setDescription(`Claimed by ${attributionUser}`);
            
            // Reply to the original message with the embed
            await referencedMessage.reply({ embeds: [claimEmbed] });
            
            // Record this action
            commandsProcessed++;
          }
        } catch (replyError) {
          log(`Error processing ${config.commandTrigger} command: ${replyError}`, "discord-bot");
        }
      }
      
      // Check for resol command that references another message
      if (message.reference && message.content.toLowerCase().includes("!resol")) {
        try {
          // Fetch the message being replied to
          const referencedMessage = await message.channel.messages.fetch(message.reference.messageId as string);
          
          log(`!resol command used by ${message.author.username} on a message`, "discord-bot");
          
          // Add the resol emoji reaction
          try {
            await referencedMessage.react("<:resol:1358566610973102130>");
          } catch (emojiError) {
            log(`Error adding resol emoji: ${emojiError}`, "discord-bot");
            await referencedMessage.react("🔄");
          }
          
          let attributionUser = message.author;
          
          // Check if someone is mentioned in the resol message
          if (message.mentions.users.size > 0) {
            // Get the first mentioned user
            attributionUser = message.mentions.users.first() as User;
          }
          
          // Create a simple embed to attribute the resolution
          const resolEmbed = new EmbedBuilder()
            .setColor(0x00FF99)
            .setDescription(`Resolved by ${attributionUser}`);
          
          // Reply to the original message with the embed
          await referencedMessage.reply({ embeds: [resolEmbed] });
          
          // Record this action
          commandsProcessed++;
        } catch (replyError) {
          log(`Error processing !resol command: ${replyError}`, "discord-bot");
        }
      }
    }
  } catch (error) {
    log(`Error handling message: ${error}`, "discord-bot");
  }
}

// Handle interactions (buttons, etc.)
async function handleInteraction(interaction: Interaction) {
  // Update activity timestamp
  lastMessageTimestamp = Date.now();
  lastSuccessfulActivity = Date.now();
  
  try {
    // Only handle button interactions
    if (!interaction.isButton()) return;
    
    // Get the custom ID from the button
    const customId = interaction.customId;
    
    // Check if this is a category button click
    if (customId.startsWith('tag:')) {
      // Extract the category from the customId (e.g., 'tag:electronics' -> 'electronics')
      const category = customId.split(':')[1];
      
      try {
        // Acknowledge the interaction immediately to prevent timeout
        await interaction.deferReply({ ephemeral: true });
        
        log(`User ${interaction.user.username} selected category: ${category}`, "discord-bot");
        
        // Find the guild with the category channel
        const guilds = bot?.guilds.cache.values();
        if (!guilds) {
          await interaction.editReply("Error: Bot is not connected to any Discord servers.");
          return;
        }
        
        let categoryPosted = false;
        
        // Look for a guild that has this category as a channel
        for (const guild of guilds) {
          // Find the category channel
          const categoryChannel = guild.channels.cache.find(
            (ch: any) => ch.type === ChannelType.GuildText && ch.name === category
          ) as TextChannel;
          
          // Skip if the guild doesn't have this category channel
          if (!categoryChannel) continue;
          
          // Get the original message content from the interaction
          const originalContent = interaction.message.content;
          
          try {
            // Store any attachments from the original message (in DM)
            let files: any[] = [];
            
            // Check if the original message has attachments or linked attachments
            if (interaction.message.attachments && interaction.message.attachments.size > 0) {
              files = Array.from(interaction.message.attachments.values());
              log(`Found ${files.length} direct attachments to include in category post`, "discord-bot");
            } 
            // If no direct attachments, try to find referenced message with attachments
            else {
              // Attempt to find the original message in items-exchange channel
              try {
                // Extract the user ID from the mention in the original message
                const mentionMatch = originalContent.match(/<@(\d+)>/);
                if (mentionMatch && mentionMatch[1]) {
                  const userId = mentionMatch[1];
                  
                  // Look through all guilds for the items-exchange channel
                  const guilds = bot?.guilds.cache.values();
                  if (guilds) {
                    for (const guild of guilds) {
                      const itemsChannel = guild.channels.cache.find(
                        (ch: any) => ch.type === ChannelType.GuildText && ch.name === "items-exchange"
                      ) as TextChannel;
                      
                      if (itemsChannel) {
                        // Get recent messages from the items-exchange channel
                        const recentMessages = await itemsChannel.messages.fetch({ limit: 10 });
                        
                        // Find a bot message mentioning the same user
                        const botMessages = recentMessages.filter(msg => 
                          msg.author.bot && 
                          msg.mentions.users.has(userId) &&
                          msg.content === originalContent // Same content
                        );
                        
                        // If we found a matching message with attachments, use those
                        if (botMessages.size > 0) {
                          const sourceMessage = botMessages.first();
                          if (sourceMessage && sourceMessage.attachments.size > 0) {
                            files = Array.from(sourceMessage.attachments.values());
                            log(`Found ${files.length} attachments from original message to include in category post`, "discord-bot");
                          }
                        }
                        break;
                      }
                    }
                  }
                }
              } catch (attachmentLookupError) {
                log(`Error finding original attachments: ${attachmentLookupError}`, "discord-bot");
              }
            }
            
            // Post the message to the category channel with any attachments
            await categoryChannel.send({
              content: originalContent,
              files: files
            });
            categoryPosted = true;
            
            log(`Posted ISO request to #${category} channel with ${files.length} attachments`, "discord-bot");
            
            // Create an activity log
            await storage.createLog({
              userId: interaction.user.id,
              username: interaction.user.username,
              command: "category-selection",
              channel: category,
              status: "success",
              message: `Selected category ${category} for ISO request`,
              guildId: guild.id,
              channelId: categoryChannel.id,
              messageId: "unknown" // We don't have the message ID at this point
            });
          } catch (channelError) {
            log(`Error posting to #${category} channel: ${channelError}`, "discord-bot");
          }
        }
        
        // Let the user know the result
        if (categoryPosted) {
          await interaction.editReply(`Your ISO request has been posted to the #${category} channel!`);
        } else {
          await interaction.editReply(`Couldn't find a #${category} channel to post to. Please contact an admin.`);
        }
      } catch (error) {
        log(`Error handling category button: ${error}`, "discord-bot");
        
        try {
          await interaction.reply({
            content: "There was an error processing your category selection. Please try again or contact an admin.",
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
        // 1. IMMEDIATELY reply to the interaction to avoid the "Bot is thinking" message
        await interaction.reply({
          content: "Processing your request... This will mark your item as fulfilled across all channels.",
          ephemeral: true
        });
        
        const username = interaction.user.username;
        log(`User ${username} clicked the Fulfilled button`, "discord-bot");
        
        // Create a fulfilled embed with orange color for consistency
        const fulfilledEmbed = new EmbedBuilder()
          .setColor(0xFFA500) // Orange color for consistency
          .setDescription(`This item has been marked as fulfilled by ${interaction.user}`)
          .setAuthor({
            name: "",
            iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 256 })
          });
        
        // 2. Process the updates in the background, without waiting to respond
        // This ensures the user gets immediate feedback
        setTimeout(async () => {
          try {
            let messagesUpdated = 0;
            
            if (bot) {
              // Process one guild at a time to avoid overloading
              const guilds = Array.from(bot.guilds.cache.values());
              
              for (const guild of guilds) {
                // Only check the most important channels first - items-exchange
                const mainChannel = guild.channels.cache.find(
                  (ch: any) => ch.type === ChannelType.GuildText && ch.name === 'items-exchange'
                ) as TextChannel | undefined;
                
                // Get the archive channel if it exists
                const archiveChannel = guild.channels.cache.find(
                  (ch: any) => ch.type === ChannelType.GuildText && ch.name === 'archive'
                ) as TextChannel | undefined;
                
                if (mainChannel) {
                  try {
                    // Only fetch a small number of messages for quicker response
                    const messages = await mainChannel.messages.fetch({ limit: 15 });
                    
                    // Find messages that mention the user
                    const userMessages = messages.filter(msg => 
                      msg.author.bot && 
                      msg.content.includes(`@${username}`) &&
                      !msg.embeds.some(embed => embed.description?.includes("fulfilled"))
                    );
                    
                    // Process each message
                    for (const [_, message] of userMessages) {
                      try {
                        // Archive the message first
                        if (archiveChannel) {
                          // Create archive message options with original content plus fulfillment notice
                          const archiveOptions: any = {
                            content: `${message.content}\n\n**This item was fulfilled by ${interaction.user}**`
                          };
                          
                          // Include any attachments from the original message in the archive
                          if (message.attachments.size > 0) {
                            archiveOptions.files = Array.from(message.attachments.values());
                            log(`Including ${message.attachments.size} attachment(s) in archive post`, "discord-bot");
                          }
                          
                          // Send to archive channel with attachments
                          await archiveChannel.send(archiveOptions);
                        }
                        
                        // Replace the original with just the fulfilled embed
                        await message.edit({
                          content: "",
                          embeds: [fulfilledEmbed]
                        });
                        
                        messagesUpdated++;
                      } catch (messageError) {
                        log(`Error updating message: ${messageError}`, "discord-bot");
                      }
                    }
                  } catch (channelError) {
                    log(`Error processing main channel: ${channelError}`, "discord-bot");
                  }
                }
                
                // Process category channels in the background
                setTimeout(async () => {
                  try {
                    // Now process the category channels
                    const categoryChannels = guild.channels.cache.filter(
                      (ch: any) => ch.type === ChannelType.GuildText && 
                      ['accessories', 'electronics', 'clothing', 'home-and-furniture'].includes(ch.name)
                    ).map(ch => ch as TextChannel);
                    
                    for (const channel of categoryChannels) {
                      try {
                        // Get recent messages from the channel
                        const messages = await channel.messages.fetch({ limit: 10 });
                        
                        // Find messages that mention the user
                        const userMessages = messages.filter(msg => 
                          msg.author.bot && 
                          msg.content.includes(`@${username}`) &&
                          !msg.embeds.some(embed => embed.description?.includes("fulfilled"))
                        );
                        
                        // Process each message
                        for (const [_, message] of userMessages) {
                          try {
                            // Replace with fulfilled embed
                            await message.edit({
                              content: "",
                              embeds: [fulfilledEmbed]
                            });
                          } catch (messageError) {
                            log(`Error updating category message: ${messageError}`, "discord-bot");
                          }
                        }
                      } catch (channelError) {
                        log(`Error processing category channel ${channel.name}: ${channelError}`, "discord-bot");
                      }
                    }
                  } catch (error) {
                    log(`Error in background category processing: ${error}`, "discord-bot");
                  }
                }, 500); // Delay category processing to prioritize main channel
              }
            }
            
            // Log the successful action
            if (messagesUpdated > 0) {
              try {
                // Try to update the interaction but don't block on it
                await interaction.editReply({
                  content: `Success! Your item has been marked as fulfilled in ${messagesUpdated} places.`
                });
                
                // Log the action
                await storage.createLog({
                  userId: interaction.user.id,
                  username: interaction.user.username,
                  command: "fulfill-button",
                  channel: "multiple",
                  status: "success",
                  message: `User marked item as fulfilled (${messagesUpdated} messages updated)`
                });
              } catch (error) {
                log(`Error updating reply after processing: ${error}`, "discord-bot");
              }
            }
          } catch (backgroundError) {
            log(`Error in background processing: ${backgroundError}`, "discord-bot");
          }
        }, 100); // Start background processing after 100ms
        
      } catch (error) {
        log(`Error handling fulfill button: ${error}`, "discord-bot");
        try {
          await interaction.reply({
            content: "There was an error processing your request. Please try again.",
            ephemeral: true
          });
        } catch (replyError) {
          log(`Error sending error reply: ${replyError}`, "discord-bot");
        }
      }
    }
  } catch (error) {
    log(`Error handling interaction: ${error}`, "discord-bot");
  }
}

// Process command from web API (used for testing)
export async function processCommand(command: string) {
  if (!bot) {
    return { error: "Bot is not initialized" };
  }
  
  try {
    // Find the items-exchange channel in all guilds
    for (const guild of bot.guilds.cache.values()) {
      const itemsChannel = guild.channels.cache.find(
        (ch: any) => ch.type === ChannelType.GuildText && ch.name === "items-exchange"
      ) as TextChannel;
      
      if (itemsChannel) {
        // Create a message
        const message = await itemsChannel.send(command);
        return { success: `Command "${command}" sent to #items-exchange in ${guild.name}` };
      }
    }
    
    return { error: "No items-exchange channel found in any server" };
  } catch (error) {
    return { error: `Failed to process command: ${error}` };
  }
}

// Get bot status
export async function getBotStatus() {
  if (!bot) {
    return { 
      status: "offline",
      uptime: "0 minutes"
    };
  }
  
  try {
    // Test if the bot is actually connected by fetching guilds
    const guilds = await bot.guilds.fetch();
    
    // Also test if we can fetch the bot user
    await bot.users.fetch(bot.user?.id || "");
    
    // If we get here, the bot is connected
    log("Discord API guilds fetch successful despite inactivity", "discord-bot");
    log("Discord API user fetch successful despite inactivity", "discord-bot");
    
    return {
      status: "online",
      uptime: calculateUptime(connectionStartTime),
      processUptime: calculateUptime(processStartTime),
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`
      },
      commandsProcessed,
      healthStatus: {
        healthCheckFailures,
        reconnectAttempts
      }
    };
  } catch (error) {
    return { 
      status: "error",
      error: `${error}`,
      uptime: calculateUptime(connectionStartTime)
    };
  }
}

// Update bot configuration
export async function updateBotConfig(newConfig: { commandTrigger: string; reactionEmoji: string }) {
  try {
    const config = await storage.getBotConfig();
    
    if (!config) {
      // Create new config
      return await storage.createBotConfig({
        ...newConfig,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Update existing config
    return await storage.updateBotConfig({
      ...newConfig,
      id: config.id,
      updatedAt: new Date()
    });
  } catch (error) {
    log(`Error updating bot config: ${error}`, "discord-bot");
    throw error;
  }
}

// Restart the bot
export async function restartBot() {
  try {
    if (bot) {
      // Log out
      await bot.destroy();
      log("Bot connection destroyed for restart", "discord-bot");
    }
    
    // Reinitialize
    await initializeBot();
    return { success: true, message: "Bot restarted successfully" };
  } catch (error) {
    log(`Error restarting bot: ${error}`, "discord-bot");
    return { success: false, error: `${error}` };
  }
}

// Create necessary channels if they don't exist
export async function ensureCategoryChannels() {
  if (!bot) return { error: "Bot is not initialized" };
  
  try {
    const categories = ["electronics", "accessories", "clothing", "home-and-furniture", "archive"];
    let channelsCreated = 0;
    
    // Go through all guilds
    for (const guild of bot.guilds.cache.values()) {
      // Check for necessary permissions
      const botMember = await guild.members.fetch(bot.user?.id || "");
      
      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        log(`Bot doesn't have permission to create channels in ${guild.name}`, "discord-bot");
        continue;
      }
      
      // Check each category
      for (const category of categories) {
        const existingChannel = guild.channels.cache.find(
          (ch: any) => ch.type === ChannelType.GuildText && ch.name === category
        );
        
        if (!existingChannel) {
          // Create the channel
          await guild.channels.create({
            name: category,
            type: ChannelType.GuildText,
            topic: `Channel for ${category} related ISO requests and exchanges`
          });
          
          log(`Created #${category} channel in ${guild.name}`, "discord-bot");
          channelsCreated++;
        }
      }
    }
    
    return { 
      success: true, 
      channelsCreated,
      message: `${channelsCreated} channels created`
    };
  } catch (error) {
    log(`Error ensuring category channels: ${error}`, "discord-bot");
    return { success: false, error: `${error}` };
  }
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
  
  // IMPROVED: Check for duplicates to prevent double-posting
  try {
    const recentMessages = await message.channel.messages.fetch({ limit: 10 });
    
    // Check if there are any bot messages mentioning this user in the last minute
    const authorId = message.author.id;
    const recentUserMentions = recentMessages.filter(msg => 
      msg.author.bot && 
      msg.mentions.users.has(authorId) &&
      (Date.now() - msg.createdTimestamp < 60000)
    );
    
    if (recentUserMentions.size > 0) {
      log(`Duplicate ISO request detected for ${message.author.username}, ignoring...`, "discord-bot");
      return;
    }
  } catch (err) {
    log(`Error checking for duplicate ISO requests: ${err}`, "discord-bot");
  }
  
  // Add debugging for this message
  log(`Processing ISO request: ${message.id} from ${message.author.username}`, "discord-bot");
  
  let isoRequestProcessed = false;
  let formattedResponse = "";
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
      let featuresText = "";
      if (analysis.features && analysis.features.length > 0) {
        featuresText = "\n-Features: " + analysis.features.join(", ");
      }
      
      // Determine the appropriate article
      const article = getArticle(analysis.item);
      
      // Create a simplified formatted response without tags and urgency
      formattedResponse = `<@${message.author.id}> is looking for ${article ? article + ' ' : ''}${analysis.item}${featuresText}`;
      
      // Set up buttons for different categories
      const tagButtons = [];
      
      // Always include all predefined categories to ensure consistency
      const validCategories = ["electronics", "accessories", "clothing", "home-and-furniture"];
      
      // First, add buttons for all categories
      for (const category of validCategories) {
        // Format the label to look nice (capitalize first letter, replace hyphens)
        const formattedLabel = category.charAt(0).toUpperCase() + 
                              category.slice(1).replace('-', ' & ');
        
        // Create a button for this category
        const tagButton = new ButtonBuilder()
          .setCustomId(`tag:${category}`)
          .setLabel(formattedLabel)
          .setStyle(ButtonStyle.Secondary);
        
        // If this category is in the analysis tags, make it primary style
        if (analysis.tags && analysis.tags.some(tag => tag.toLowerCase() === category)) {
          tagButton.setStyle(ButtonStyle.Primary);
        }
        
        // Add this button to our collection
        tagButtons.push(tagButton);
      }
      
      // Create message options with the formatted response
      const messageOptions: any = {
        content: formattedResponse
      };
      
      // Check if the original message had any attachments (images) and include them
      if (message.attachments.size > 0) {
        // Add the attachments to the formatted message
        messageOptions.files = Array.from(message.attachments.values());
        log(`Including ${message.attachments.size} attachment(s) from the original ISO request`, "discord-bot");
      }
      
      // Send the formatted message to the channel
      const sentMessage = await message.channel.send(messageOptions);
      
      log(`Sent formatted ISO request in main channel #${channelName}`, "discord-bot");
      
      // Forward the message to the user in a DM with the category buttons
      try {
        // Get the DM channel
        const dmChannel = await message.author.createDM();
        
        // First, check if user has DMs enabled
        try {
          // Create row of buttons for categories
          const categoryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(tagButtons);
          
          // Create a "Fulfilled" button separately
          const fulfilledButton = new ButtonBuilder()
            .setCustomId('fulfill:item')
            .setLabel('Fulfilled')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');
          
          const fulfillRow = new ActionRowBuilder<ButtonBuilder>().addComponents(fulfilledButton);
          
          // Send the DM with category buttons first
          await dmChannel.send({
            content: `Your ISO request for ${analysis.item} has been posted! Please select which category this belongs to:`,
            components: [categoryRow]
          });
          
          // Send a separate message with just the fulfill button
          // Include the original attachment(s) in the message with the fulfill button
          const fulfillMessageOptions: any = {
            content: "When you've found this item, click the button below to mark it as fulfilled.",
            components: [fulfillRow]
          };
          
          // Send the fulfill button message
          await dmChannel.send(fulfillMessageOptions);
          
          log(`Forwarded formatted ISO request to ${message.author.username} via DM with category selection and Fulfilled button`, "discord-bot");
        } catch (dmError) {
          log(`Error sending DM to ${message.author.username}: ${dmError}`, "discord-bot");
          
          // If we can't send a DM, add the buttons to the channel message
          await sentMessage.edit({
            content: formattedResponse + "\n\n*Please select a category:*",
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(tagButtons)]
          });
        }
      } catch (dmError) {
        log(`Failed to open DM with ${message.author.username}: ${dmError}`, "discord-bot");
      }
      
      // Delete the original ISO message to keep the channel clean
      await message.delete();
      log(`Deleted original ISO request from ${message.author.username}`, "discord-bot");
      
      isoRequestProcessed = true;
    } catch (aiError) {
      log(`Error analyzing ISO request with OpenAI: ${aiError}`, "openai-service");
      
      // Simple extraction fallback when AI fails
      const content = message.content.trim();
      const itemMatch = content.match(/ISO\s+(.*?)(?:\.|$)/i);
      const item = itemMatch ? itemMatch[1].trim() : "item";
      
      // Determine article
      const article = getArticle(item);
      
      // Create a simplified response with proper user mention
      formattedResponse = `<@${message.author.id}> is looking for ${article ? article + ' ' : ''}${item}`;
      
      // Create message options with the formatted response
      const messageOptions: any = {
        content: formattedResponse
      };
      
      // Check if the original message had any attachments (images) and include them
      if (message.attachments.size > 0) {
        // Add the attachments to the formatted message
        messageOptions.files = Array.from(message.attachments.values());
        log(`Including ${message.attachments.size} attachment(s) from the original ISO request in fallback mode`, "discord-bot");
      }
      
      // Send the formatted message
      const sentMessage = await message.channel.send(messageOptions);
      
      log(`Formatted ISO request for ${message.author.username} in #${channelName}: ${item}`, "discord-bot");
      
      // Add all category buttons to ensure all options are available
      const allCategories = ["electronics", "accessories", "clothing", "home-and-furniture"];
      const categoryButtons = allCategories.map(category => {
        return new ButtonBuilder()
          .setCustomId(`tag:${category}`)
          .setLabel(category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' & '))
          .setStyle(ButtonStyle.Secondary);
      });
      
      // Create a "Fulfilled" button
      const fulfilledButton = new ButtonBuilder()
        .setCustomId('fulfill:item')
        .setLabel('Fulfilled')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');
      
      // Create button rows with all category buttons
      const categoryRow = new ActionRowBuilder<ButtonBuilder>();
      
      // Add each category button individually
      for (const button of categoryButtons) {
        categoryRow.addComponents(button);
      }
      
      const fulfillRow = new ActionRowBuilder<ButtonBuilder>().addComponents(fulfilledButton);
      
      // Forward to DM with buttons
      try {
        const dmChannel = await message.author.createDM();
        
        // Send the DM with category buttons first
        await dmChannel.send({
          content: `Your ISO request for ${item} has been posted! Please select which category this belongs to:`,
          components: [categoryRow]
        });
        
        // Send a separate message with just the fulfill button
        const fulfillMessageOptions: any = {
          content: "When you've found this item, click the button below to mark it as fulfilled.",
          components: [fulfillRow]
        };
        
        // Send the fulfill button message
        await dmChannel.send(fulfillMessageOptions);
        
        log(`Forwarded formatted ISO request to ${message.author.username} via DM with category selection and Fulfilled button`, "discord-bot");
      } catch (dmError) {
        log(`Error sending DM to ${message.author.username}: ${dmError}`, "discord-bot");
        
        // Add buttons to channel message if DM fails
        await sentMessage.edit({
          content: formattedResponse + "\n\n*Please select a category:*",
          components: [categoryRow]
        });
      }
      
      // Delete original message
      await message.delete();
      log(`Deleted original ISO request from ${message.author.username}`, "discord-bot");
      
      isoRequestProcessed = true;
    }
  } catch (error) {
    log(`Error processing ISO request: ${error}`, "discord-bot");
  }
}

// Health check to monitor bot status
async function performHealthCheck() {
  log(`ISO processing status: ${isProcessingIsoRequest ? 'ACTIVE' : 'IDLE'}`, "discord-bot");
  
  const timeSinceLastMessage = Date.now() - lastMessageTimestamp;
  const inactivityThreshold = 5 * 60 * 1000; // 5 minutes
  
  if (timeSinceLastMessage > inactivityThreshold) {
    // No activity for 5 minutes, check if the bot is still connected
    healthCheckFailures++;
    
    log(`Health check warning: No Discord activity in ${Math.floor(timeSinceLastMessage / 60000)} minutes. Failure #${healthCheckFailures}`, "discord-bot");
    
    try {
      // Test if the bot is actually connected by fetching guilds
      if (bot) {
        await bot.guilds.fetch();
        log("Discord API guilds fetch successful despite inactivity", "discord-bot");
        
        // Also test if we can fetch the bot user
        await bot.users.fetch(bot.user?.id || "");
        log("Discord API user fetch successful despite inactivity", "discord-bot");
        
        // Reset failure count if we successfully fetched data
        healthCheckFailures = 0;
      } else {
        log("Bot is null during health check, will attempt reconnect", "discord-bot");
        await attemptReconnect();
      }
    } catch (error) {
      log(`Health check failed: ${error}`, "discord-bot");
      
      // After 3 consecutive failures, try to reconnect
      if (healthCheckFailures >= 3) {
        await attemptReconnect();
      }
    }
  } else {
    // Activity within the last 5 minutes
    log(`Health check passed: Bot is online and connected (${(timeSinceLastMessage / 1000).toFixed(3)}s since last message)`, "discord-bot");
    
    // Reset failure count
    healthCheckFailures = 0;
  }
}

// Attempt to reconnect the bot
async function attemptReconnect() {
  reconnectAttempts++;
  
  log(`Attempting to reconnect bot (attempt #${reconnectAttempts})`, "discord-bot");
  
  try {
    // Destroy the existing connection if there is one
    if (bot) {
      await bot.destroy();
      log("Destroyed existing bot connection", "discord-bot");
    }
    
    // Create a new connection
    await initializeBot();
    
    // Reset timestamps and failure counters
    lastMessageTimestamp = Date.now();
    lastSuccessfulActivity = Date.now();
    healthCheckFailures = 0;
    
    log("Bot successfully reconnected", "discord-bot");
  } catch (error) {
    log(`Reconnect attempt failed: ${error}`, "discord-bot");
    
    // Schedule another attempt if needed
    if (reconnectAttempts < 5) {
      setTimeout(() => {
        attemptReconnect();
      }, RECONNECT_INTERVAL);
    } else {
      log("Max reconnect attempts reached. Bot will remain offline until manually restarted.", "discord-bot");
    }
  }
}

// Calculate uptime in a human-readable format
function calculateUptime(startTime: Date): string {
  const uptimeMs = Date.now() - startTime.getTime();
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) {
    return "Just started";
  }
  
  if (hours < 1) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  
  if (days < 1) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}, ${minutes % 60} ${minutes % 60 === 1 ? 'minute' : 'minutes'}`;
  }
  
  const remainingHours = hours % 24;
  
  return `${days} ${days === 1 ? 'day' : 'days'}, ${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}`;
}

// Set up default bot configuration
export async function initializeBotConfig() {
  try {
    // Check if a configuration already exists
    const existingConfig = await storage.getBotConfig();
    
    if (!existingConfig) {
      // Create a default configuration
      await storage.createBotConfig({
        commandTrigger: "!claimed",
        reactionEmoji: "✅",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      log("Created default bot configuration", "discord-bot");
    }
    
    return true;
  } catch (error) {
    log(`Error initializing bot config: ${error}`, "discord-bot");
    return false;
  }
}

// Add default allowed channels
async function addDefaultChannels() {
  try {
    // Get all existing channels
    const channels = await storage.getAllowedChannels();
    
    // If no channels exist, add the default ones
    if (channels.length === 0) {
      // Default allowed channels
      const defaultChannels = [
        { channelName: "items-exchange", enabled: true },
        { channelName: "electronics", enabled: true },
        { channelName: "accessories", enabled: true },
        { channelName: "clothing", enabled: true },
        { channelName: "home-and-furniture", enabled: true },
        { channelName: "archive", enabled: true }
      ];
      
      // Create each channel
      for (const channel of defaultChannels) {
        await storage.createAllowedChannel({
          channelId: channel.channelName, // Use channel name as ID for now
          channelName: channel.channelName,
          enabled: channel.enabled,
          createdAt: new Date()
        });
      }
      
      log("Added default allowed channels", "discord-bot");
    }
    
    return true;
  } catch (error) {
    log(`Error adding default channels: ${error}`, "discord-bot");
    return false;
  }
}

// Helper function to validate Discord token format
function isValidDiscordToken(token: string): boolean {
  // Basic format check: should be in three parts separated by periods
  const parts = token.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
}
