// Import required modules
import { 
  Client, ChannelType, Events, GatewayIntentBits, 
  Interaction, Message, MessageReaction, 
  PartialMessageReaction, PartialUser, Partials, 
  User, EmbedBuilder, TextChannel, ButtonBuilder, 
  ButtonStyle, ActionRowBuilder, Collection,
  PermissionFlagsBits, ButtonInteraction
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
      GatewayIntentBits.GuildMessageReactions
      // DM intents removed as handled by BNE bot now
    ];
    
    // Include necessary partials for message reactions
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
    

    
    // Get the bot configuration
    if (!config) {
      await storage.createBotConfig({
        webhookUrl: null,
        token: null
      });
    }
    
    // Ignore DMs as they're handled by BNE bot now
    if (message.channel.type === ChannelType.DM) {
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
        await message.reply("Hello! I'm Batata, and I format ISO requests in a standardized way. Post a message starting with ISO to see me in action!");
        return;
      }
      
      // Handle direct ISO posts in server - no formatting, just send category buttons
      const content = message.content.trim().toUpperCase();
      if (message.guild && content.startsWith('ISO ') && content.length > 4) {
        log(`Detected ISO request from ${message.author.username}`, "discord-bot");
        await handleIsoRequest(message);
      }
    }
  } catch (error) {
    log(`Error handling message: ${error}`, "discord-bot");
  }
}

// Categories for ISO request selection
const CATEGORIES = [
  { id: "electronics", label: "Electronics", style: ButtonStyle.Primary },
  { id: "accessories", label: "Accessories", style: ButtonStyle.Primary },
  { id: "clothing", label: "Clothing", style: ButtonStyle.Primary },
  { id: "home_furniture", label: "Home & Furniture", style: ButtonStyle.Primary }
];

// Create category selection buttons
function createCategoryButtons(): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  CATEGORIES.forEach(category => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`category:${category.id}`)
        .setLabel(category.label)
        .setStyle(ButtonStyle.Secondary) // Dark grey buttons
    );
  });
  
  return row;
}

// Create fulfill button for ISO requests
function createFulfillButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('fulfill:item')
        .setLabel('Mark as Fulfilled')
        .setStyle(ButtonStyle.Secondary) // Dark grey button
    );
}

// Detect if message is formatted ISO request from Batata
function isFormattedIsoRequest(message: Message): boolean {
  if (message.author.username !== 'Batata') return false;
  
  const content = message.content.toLowerCase();
  return content.includes('is looking for') && content.includes('<@');
}

// Detect if message is direct ISO request
function isDirectIsoRequest(message: Message): boolean {
  const content = message.content.trim().toUpperCase();
  return content.startsWith('ISO ') && content.length > 4;
}



// Handle direct ISO request
async function handleIsoRequest(message: Message): Promise<void> {
  try {
    // Create ISO request record
    const isoRequest = {
      discordMessageId: message.id,
      userId: message.author.id,
      username: message.author.tag,
      content: message.content,
      timestamp: new Date()
    };
    
    const savedRequest = await storage.createIsoRequest(isoRequest);
    
    // Send DM to user with category buttons
    try {
      const dmChannel = await message.author.createDM();
      const fulfillRow = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('fulfill:item')
            .setLabel('Mark as Fulfilled')
            .setStyle(ButtonStyle.Success)
        );
      
      // Send category selection buttons first
      await dmChannel.send({
        content: "Thanks for your ISO request! Please select a category for your item:",
        components: [createCategoryButtons()]
      });
      
      // Send fulfill button as a separate message
      await dmChannel.send({
        content: "When your item is found, click the button below to mark it as fulfilled:",
        components: [fulfillRow]
      });
      
      log(`Sent category selection to user ${message.author.tag}`, "discord-bot");
    } catch (dmError) {
      log(`Failed to DM user ${message.author.tag}: ${dmError}`, "discord-bot");
    }
  } catch (error) {
    log(`Error handling ISO request: ${error}`, "discord-bot");
  }
}

// Handle category selection from button interaction
async function handleCategorySelection(
  interaction: any, 
  categoryId: string
): Promise<void> {
  try {
    const userId = interaction.user.id;
    const userRequests = await storage.getIsoRequestsByUser(userId, 5);
    
    if (userRequests.length === 0) {
      await interaction.reply({
        content: "I couldn't find your ISO request in our system. Please send a new request.",
        ephemeral: true
      });
      return;
    }
    
    const isoRequest = userRequests[0];
    const updatedRequest = await storage.updateIsoRequestCategory(isoRequest.id, categoryId);
    
    if (!updatedRequest) {
      await interaction.reply({
        content: "I had trouble updating your request. Please try again.",
        ephemeral: true
      });
      return;
    }
    
    const category = CATEGORIES.find(cat => cat.id === categoryId);
    
    await interaction.update({
      content: `Your ISO request has been categorized as **${category?.label || categoryId}**. I'll cross-post it to the appropriate channel!`,
      components: []
    });
    
    // Cross-post to appropriate channel
    const categoryChannelMap: {[key: string]: string} = {
      'electronics': 'electronics',
      'accessories': 'accessories', 
      'clothing': 'clothing',
      'home_furniture': 'home-and-furniture'
    };
    
    const channelName = categoryChannelMap[categoryId];
    const targetChannel = interaction.client.channels.cache.find(
      channel => 
        channel.isTextBased() && 
        !channel.isDMBased() && 
        (channel as any).name?.toLowerCase() === channelName.toLowerCase()
    );
    
    if (targetChannel && targetChannel.isTextBased()) {
      // Extract the item from the original ISO request
      const originalContent = isoRequest.content.trim();
      const itemMatch = originalContent.match(/ISO\s+(.*?)(?:\.|$)/i);
      const item = itemMatch ? itemMatch[1].trim() : "item";
      
      // Create formatted message with user mention
      const formattedContent = `<@${isoRequest.userId}> is in search of ${item}.`;
      
      await (targetChannel as TextChannel).send({
        content: formattedContent
      });
      
      await interaction.followUp({
        content: `Your request has been posted to the #${channelName} channel!`,
        ephemeral: true
      });
    }
  } catch (error) {
    log(`Error handling category selection: ${error}`, "discord-bot");
  }
}

// Handle fulfill button interaction
async function handleFulfillRequest(interaction: any): Promise<void> {
  try {
    // Find ISO request
    let isoRequest = null;
    if (interaction.message.embeds.length > 0) {
      const embedDescription = interaction.message.embeds[0].description || "";
      const activeRequests = await storage.getActiveIsoRequests(20);
      
      isoRequest = activeRequests.find(req => 
        req.content.includes(embedDescription) || embedDescription.includes(req.content)
      );
    }
    
    // Find archive channel
    let archiveChannel = interaction.client.channels.cache.find(
      channel => 
        channel instanceof TextChannel && 
        (channel as any).name?.toLowerCase() === 'archive'
    ) as TextChannel;
    
    // Get original request content and clean it up
    let originalRequestContent = "";
    if (interaction.message.embeds.length > 0) {
      const embed = interaction.message.embeds[0];
      originalRequestContent = embed.description || embed.title || interaction.message.content;
    } else {
      originalRequestContent = interaction.message.content;
    }
    
    originalRequestContent = originalRequestContent
      .replace("When your item is found, click the button below to mark it as fulfilled:", "")
      .replace("Thanks for your ISO request! Please select a category for your item:", "")
      .trim();
    
    // Create fulfilled embed
    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('Item Fulfilled')
      .setDescription(originalRequestContent)
      .addFields(
        { name: 'Marked as fulfilled by', value: interaction.user.tag, inline: true },
        { name: 'Fulfilled on', value: new Date().toLocaleString(), inline: true }
      )
      .setTimestamp();
      
    if (interaction.user.avatar) {
      embed.setThumbnail(`https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}.png`);
    }
    
    // Archive the fulfilled request
    if (archiveChannel) {
      await archiveChannel.send({
        embeds: [embed]
      });
    }
    
    // Delete from category channel or update in DM
    if (interaction.channel?.type !== 1) { // Not a DM
      try {
        await interaction.message.delete();
        log(`Deleted cross-posted message from category channel`, "discord-bot");
      } catch (deleteError) {
        await interaction.update({
          embeds: [embed],
          components: []
        });
      }
    } else {
      await interaction.update({
        embeds: [embed],
        components: []
      });
    }
    
    // Notify requester if found
    if (isoRequest) {
      await storage.markIsoRequestFulfilled(isoRequest.id);
      
      try {
        const requester = await interaction.client.users.fetch(isoRequest.userId);
        if (requester) {
          const dmChannel = await requester.createDM();
          await dmChannel.send({
            content: `Great news! Your ISO request has been fulfilled by ${interaction.user.tag}.`,
            embeds: [embed]
          });
        }
      } catch (notifyError) {
        log(`Failed to notify requester: ${notifyError}`, "discord-bot");
      }
    }
    
    log(`Item fulfilled by ${interaction.user.tag}`, "discord-bot");
  } catch (error) {
    log(`Error handling fulfill request: ${error}`, "discord-bot");
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
    
    // Handle category selection
    if (customId.startsWith('category:')) {
      const categoryId = customId.split(':')[1];
      await handleCategorySelection(interaction, categoryId);
    }
    
    // Handle fulfill item button
    if (customId === 'fulfill:item') {
      await handleFulfillRequest(interaction);
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
    // Find the items-exchange channel in all guilds (using Array.from for iteration)
    for (const guild of Array.from(bot.guilds.cache.values())) {
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
export async function updateBotConfig(newConfig: { webhookUrl?: string; token?: string }) {
  try {
    const config = await storage.getBotConfig();
    
    if (!config) {
      // Create new config
      return await storage.createBotConfig({
        ...newConfig
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
    
    // Go through all guilds (using Array.from for iteration)
    for (const guild of Array.from(bot.guilds.cache.values())) {
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
        webhookUrl: null,
        token: null
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
          guildId: "default", // Use default guild ID since we don't have access to real guilds yet
          enabled: channel.enabled
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
