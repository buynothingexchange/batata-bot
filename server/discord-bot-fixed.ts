// Import required modules
import { 
  Client, ChannelType, Events, GatewayIntentBits, 
  Interaction, Message, MessageReaction, 
  PartialMessageReaction, PartialUser, Partials, 
  User, EmbedBuilder, TextChannel, ButtonBuilder, 
  ButtonStyle, ActionRowBuilder, Collection,
  PermissionFlagsBits, ButtonInteraction,
  StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, SlashCommandBuilder,
  REST, Routes, ChatInputCommandInteraction
} from 'discord.js';
import { WebSocketServer } from 'ws';
import { log } from './vite';
import { storage } from './storage';
import { analyzeISORequest } from './openai-service';
import { Server } from 'http';
import type { InsertDonation } from '@shared/schema';
import { db } from './db';
import { donationGoals } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Bot instance
let bot: Client | null = null;

// Global temp user data for multi-step interactions
declare global {
  var tempUserData: Map<string, any>;
}

// Slash command definitions
const commands = [
  // Original exchange commands
  new SlashCommandBuilder()
    .setName('exchange')
    .setDescription('Exchange items with the community (request, offer, or trade)'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with bot commands and features'),
  new SlashCommandBuilder()
    .setName('updatepost')
    .setDescription('Update one of your active forum posts'),
  new SlashCommandBuilder()
    .setName('mystats')
    .setDescription('View your exchange activity and statistics'),
  new SlashCommandBuilder()
    .setName('exchanges')
    .setDescription('View all confirmed exchanges in the community (moderator only)'),
  new SlashCommandBuilder()
    .setName('contactus')
    .setDescription('Submit comments, suggestions, or reports to the community moderators'),
  new SlashCommandBuilder()
    .setName('contactusanon')
    .setDescription('Submit anonymous comments, suggestions, or reports to the community moderators'),
  // Ko-fi donation commands
  new SlashCommandBuilder()
    .setName('initgoal')
    .setDescription('Create a new donation progress tracker in this channel (moderator only)')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Goal amount in dollars (e.g., 100 for $100)')
        .setRequired(true)
        .setMinValue(1)
    ),
  new SlashCommandBuilder()
    .setName('resetgoal')
    .setDescription('Reset donation total to $0 (admin only)'),
  new SlashCommandBuilder()
    .setName('donate')
    .setDescription('Show Ko-fi donation link and current progress'),

  new SlashCommandBuilder()
    .setName('testkofi')
    .setDescription('Test Ko-fi webhook functionality (admin only)')
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('Test donation amount in dollars')
        .setRequired(true)
        .setMinValue(0.01)
    )
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Test donor name')
        .setRequired(false)
    ),
];

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
    
    // Register slash commands
    await registerSlashCommands();
    
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
          const messagesToDelete = await message.channel.messages.fetch({ limit: 100 });
          
          // Delete messages and log the count
          await (message.channel as TextChannel).bulkDelete(messagesToDelete);
          log(`Deleted ${messagesToDelete.size} messages from #${(message.channel as TextChannel).name}`, "discord-bot");
          
          // Send confirmation
          const successMessage = await message.channel.send(`Deleted ${messagesToDelete.size} messages.`);
          
          // Delete the confirmation message after 5 seconds
          setTimeout(() => {
            successMessage.delete().catch(() => {});
          }, 5000);
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

// Handle slash command for exchange/help/etc.
async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const commandName = interaction.commandName;
    
    if (commandName === 'exchange') {
      log(`Processing /${commandName} command from ${interaction.user.tag}`, "discord-bot");
      
      try {
        // Import token utility functions
        const { generateSecureToken, createTokenExpiration } = await import('./utils');
        
        // Generate a secure token for this user
        const token = generateSecureToken();
        const expiresAt = createTokenExpiration(30); // 30 minutes expiration
        
        // Get user's avatar URL in PNG format
        const avatarUrl = interaction.user.displayAvatarURL({ 
          format: 'png', 
          size: 128 
        });
        
        // Store the token in the database
        await storage.createFormToken({
          token,
          discordUserId: interaction.user.id,
          discordUsername: interaction.user.username,
          discordDisplayName: interaction.user.displayName || interaction.user.username,
          discordAvatar: avatarUrl,
          guildId: interaction.guildId || '',
          expiresAt
        });
        
        // Cleanup expired tokens periodically
        await storage.cleanupExpiredTokens();
        
        // Create authenticated form URL with token
        const baseUrl = process.env.EXCHANGE_FORM_URL || `https://${process.env.REPLIT_DOMAINS}`;
        const formUrl = `${baseUrl}/exchange?token=${token}`;
        
        log(`Generated form URL: ${formUrl}`, "discord-bot");
        log(`Base URL used: ${baseUrl}`, "discord-bot");
        log(`REPLIT_DOMAINS: ${process.env.REPLIT_DOMAINS}`, "discord-bot");
        
        // Send ephemeral reply with authenticated form URL
        await interaction.reply({
          content: `🔗 **Personalized Exchange Form**\n\n` +
                   `Your secure form link: ${formUrl}\n\n` +
                   `✅ This link is personalized to your Discord account\n` +
                   `⏰ Link expires in 30 minutes\n` +
                   `🔒 For security, this link only works once\n\n` +
                   `Fill out the form to create your exchange post!`,
          ephemeral: true
        });
        
        log(`Successfully created authenticated form token for ${interaction.user.tag}`, "discord-bot");
      } catch (error) {
        log(`Error handling exchange command: ${error}`, "discord-bot");
        if (!interaction.replied) {
          await interaction.reply({
            content: 'Sorry, there was an error processing your request. Please try again.',
            ephemeral: true
          });
        }
      }
      
    } else if (commandName === 'help') {
      log(`Processing /help command from ${interaction.user.tag}`, "discord-bot");
      
      // Create help embed
      const helpEmbed = new EmbedBuilder()
        .setTitle('🤖 Batata Bot - Command Help')
        .setDescription('Here are all the available commands and how to use them:')
        .setColor(0x3498db)
        .addFields(
          {
            name: '📦 /exchange',
            value: '**Usage:** `/exchange`\n' +
                   '**Description:** Get the link to the exchange submission form.\n' +
                   '**Process:**\n' +
                   '• Type `/exchange` to get the form link\n' +
                   '• Fill out the web form with your item details\n' +
                   '• Submit the form to create a forum post automatically\n' +
                   '• Your post appears in the forum with proper tags\n' +
                   '**Example:** Simply type `/exchange` to get started',
            inline: false
          },
          {
            name: '🔄 /updatepost',
            value: '**Usage:** `/updatepost`\n' +
                   '**Description:** Update or manage your existing forum posts.\n' +
                   '**Features:**\n' +
                   '• View all your active posts\n' +
                   '• Mark items as claimed/fulfilled\n' +
                   '• Update post status to keep them active\n' +
                   '• Archive completed exchanges',
            inline: false
          },
          {
            name: '📞 /contactus',
            value: '**Usage:** `/contactus`\n' +
                   '**Description:** Submit comments, suggestions, or reports to community moderators.\n' +
                   '**Options:** Comments, Suggestions, Reports with your identity visible.',
            inline: false
          },
          {
            name: '🕵️ /contactusanon',
            value: '**Usage:** `/contactusanon`\n' +
                   '**Description:** Submit anonymous comments, suggestions, or reports to community moderators.\n' +
                   '**Options:** Same as /contactus but completely anonymous.',
            inline: false
          },
          {
            name: '❓ /help',
            value: '**Usage:** `/help`\n' +
                   '**Description:** Display this help message with information about all available commands.',
            inline: false
          }
        )
        .setFooter({ 
          text: 'Need more help? Contact a server administrator.',
          iconURL: interaction.client.user?.displayAvatarURL()
        })
        .setTimestamp();
      
      await interaction.reply({
        embeds: [helpEmbed],
        ephemeral: true
      });
      
      log(`Successfully sent help message to ${interaction.user.tag}`, "discord-bot");
      
    } else {
      // Handle other commands (updatepost, mystats, exchanges, contactus, contactusanon)
      await interaction.reply({
        content: `Command /${commandName} is not yet implemented in this version.`,
        ephemeral: true
      });
    }
  } catch (error) {
    log(`Error handling slash command: ${error}`, "discord-bot");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "There was an error processing your command. Please try again.",
        ephemeral: true
      });
    }
  }
}

// Handle category selection and show modal (used by other commands, not exchange)
async function handleCategoryModalSelection(interaction: any, selectedCategory: string): Promise<void> {
  try {
    // Store the category in temp data
    if (!global.tempUserData) global.tempUserData = new Map();
    const userData = global.tempUserData.get(interaction.user.id) || {};
    userData.category = selectedCategory;
    global.tempUserData.set(interaction.user.id, userData);

    // Create modal based on action type
    const action = userData.action || 'request';
    let modalTitle = 'Request Item Details';
    let itemLabel = 'What are you looking for?';
    let itemPlaceholder = 'Describe the item you need...';

    if (action === 'give') {
      modalTitle = 'Give Item Details';
      itemLabel = 'What are you offering?';
      itemPlaceholder = 'Describe the item you\'re giving away...';
    } else if (action === 'trade') {
      modalTitle = 'Trade Item Details';
      itemLabel = 'What do you want to trade?';
      itemPlaceholder = 'Describe what you have and what you want...';
    }

    const modal = new ModalBuilder()
      .setCustomId(`item_modal:${selectedCategory}`)
      .setTitle(modalTitle);

    const itemInput = new TextInputBuilder()
      .setCustomId('item_description')
      .setLabel(itemLabel)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(itemPlaceholder)
      .setRequired(true)
      .setMaxLength(1000);

    const conditionInput = new TextInputBuilder()
      .setCustomId('condition')
      .setLabel('Condition/Additional Details')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Condition, size, color, any other relevant details...')
      .setRequired(false)
      .setMaxLength(500);

    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(itemInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(conditionInput);
    
    modal.addComponents(firstActionRow, secondActionRow);

    await interaction.showModal(modal);
    log(`User ${interaction.user.tag} selected category: ${selectedCategory}`, "discord-bot");
  } catch (error) {
    log(`Error handling category selection: ${error}`, "discord-bot");
  }
}

// Handle modal submission (basic version)
async function handleModalSubmission(interaction: any): Promise<void> {
  try {
    await interaction.reply({
      content: "✅ Your exchange request has been submitted! (Full forum posting will be implemented soon)",
      ephemeral: true
    });
    log(`User ${interaction.user.tag} submitted exchange form`, "discord-bot");
  } catch (error) {
    log(`Error handling modal submission: ${error}`, "discord-bot");
  }
}

// Placeholder functions for missing handlers
async function handleUpdatePostSelection(interaction: any, threadId: string): Promise<void> {
  await interaction.reply({ content: "Update post feature coming soon!", ephemeral: true });
}

async function handleContactSelection(interaction: any, contactType: string, isAnonymous: boolean): Promise<void> {
  await interaction.reply({ content: "Contact feature coming soon!", ephemeral: true });
}

async function handleClaimModalSubmission(interaction: any): Promise<void> {
  await interaction.reply({ content: "Claim submission coming soon!", ephemeral: true });
}

async function handleContactModalSubmission(interaction: any): Promise<void> {
  await interaction.reply({ content: "Contact submission coming soon!", ephemeral: true });
}

// Helper function for ephemeral messages with auto-delete
async function sendEphemeralWithAutoDelete(interaction: any, content: string | { content?: string; embeds?: any[]; components?: any[] }, deleteAfterSeconds: number = 15) {
  try {
    if (typeof content === 'string') {
      await interaction.reply({ content, ephemeral: true });
    } else {
      await interaction.reply({ ...content, ephemeral: true });
    }
  } catch (error) {
    log(`Error sending ephemeral message: ${error}`, "discord-bot");
  }
}

// Handle interactions (buttons, etc.)
async function handleInteraction(interaction: Interaction) {
  // Update activity timestamp
  lastMessageTimestamp = Date.now();
  lastSuccessfulActivity = Date.now();
  
  try {
    log(`Received interaction: type=${interaction.type}, user=${interaction.user?.tag}`, "discord-bot");
    
    // Handle slash command interactions
    if (interaction.isChatInputCommand()) {
      const commandName = interaction.commandName;
      
      if (['initgoal', 'resetgoal', 'donate', 'testkofi'].includes(commandName)) {
        log(`Processing /${commandName} slash command`, "discord-bot");
        await handleDonationCommand(interaction);
      } else if (commandName === 'exchange' || commandName === 'help' || commandName === 'updatepost' || commandName === 'mystats' || commandName === 'exchanges' || commandName === 'contactus' || commandName === 'contactusanon') {
        log(`Processing /${commandName} slash command`, "discord-bot");
        await handleSlashCommand(interaction);
      }
      return;
    }
    
    // Handle select menu interactions (action and category selection)
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      
      if (customId === 'update_post_select') {
        const selectedThreadId = interaction.values[0];
        log(`User ${interaction.user.tag} selected post to update: ${selectedThreadId}`, "discord-bot");
        await handleUpdatePostSelection(interaction, selectedThreadId);
      } else if (customId.startsWith('contact_select:')) {
        const isAnonymous = customId.split(':')[1] === 'true';
        const selectedType = interaction.values[0];
        log(`User ${interaction.user.tag} selected contact type: ${selectedType} (anonymous: ${isAnonymous})`, "discord-bot");
        await handleContactSelection(interaction, selectedType, isAnonymous);
      }
      return;
    }
    
    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      
      if (customId.startsWith('item_modal:')) {
        log(`User ${interaction.user.tag} submitted item modal`, "discord-bot");
        await handleModalSubmission(interaction);
      } else if (customId.startsWith('claim_modal:')) {
        log(`User ${interaction.user.tag} submitted claim modal`, "discord-bot");
        await handleClaimModalSubmission(interaction);
      } else if (customId.startsWith('contact_modal:')) {
        log(`User ${interaction.user.tag} submitted contact modal`, "discord-bot");
        await handleContactModalSubmission(interaction);
      }
      return;
    }

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
            // Post the message to the category channel
            await categoryChannel.send(originalContent);
            categoryPosted = true;
            
            log(`Posted ISO request to #${category} channel`, "discord-bot");
            
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
      // Immediately acknowledge the interaction to prevent timeout
      await interaction.deferReply({ ephemeral: true });
      
      try {
        const username = interaction.user.username;
        log(`User ${username} clicked the Fulfilled button`, "discord-bot");
        
        // Create a fulfilled embed
        const fulfilledEmbed = new EmbedBuilder()
          .setColor(0x57F287) // Discord success color (green)
          .setDescription(`This item has been marked as fulfilled by ${interaction.user}`)
          .setAuthor({
            name: "",
            iconURL: interaction.user.displayAvatarURL({ extension: 'png', size: 256 })
          });
          
        // Find and update all related posts
        let messagesUpdated = 0;
        
        if (bot) {
          // Process all guilds
          for (const [, guild] of bot.guilds.cache) {
            // Get all relevant channels (exchanges and categories)
            const exchangeChannels = guild.channels.cache.filter(
              (ch: any) => ch.type === ChannelType.GuildText && 
              ['items-exchange', 'accessories', 'electronics', 'clothing', 'home-and-furniture'].includes(ch.name)
            ).map(ch => ch as TextChannel);
            
            // Get the archive channel if it exists
            const archiveChannel = guild.channels.cache.find(
              (ch: any) => ch.type === ChannelType.GuildText && ch.name === 'archive'
            ) as TextChannel | undefined;
            
            // Process each exchange channel
            for (const channel of exchangeChannels) {
              try {
                // Get recent messages from the channel
                const messages = await channel.messages.fetch({ limit: 30 });
                
                // Find messages that mention the user
                const userMessages = messages.filter(msg => 
                  msg.author.bot && 
                  msg.content.includes(`@${username}`) &&
                  !msg.embeds.some(embed => embed.description?.includes("fulfilled"))
                );
                
                // Skip if no messages found
                if (userMessages.size === 0) continue;
                
                // Process each message
                for (const [_, message] of userMessages) {
                  try {
                    // Archive the message first if we have an archive channel
                    if (archiveChannel) {
                      await archiveChannel.send({
                        content: `${message.content}\n\n**This item was fulfilled by ${interaction.user}**`
                      });
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
                log(`Error processing channel ${channel.name}: ${channelError}`, "discord-bot");
              }
            }
          }
        }
        
        // Update the user
        if (messagesUpdated > 0) {
          await interaction.editReply({
            content: `Success! Your item has been marked as fulfilled and ${messagesUpdated} messages have been updated.`
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
        } else {
          await interaction.editReply({
            content: "I couldn't find any of your recent ISO requests to mark as fulfilled. They may have been deleted or are too old."
          });
        }
      } catch (error) {
        log(`Error handling fulfill button: ${error}`, "discord-bot");
        await interaction.editReply("There was an error processing your request. Please try again later.");
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
      
      // Determine the appropriate article
      const article = getArticle(analysis.item);
      
      // Create a formatted response
      formattedResponse = `<@${message.author.id}> is looking for ${article ? article + ' ' : ''}${analysis.item}\n${featuresText}\n${urgencyText}\n${tagsText}`;
      
      // Set up buttons for different categories
      const tagButtons = [];
      
      // Only add buttons for tags that match our predefined categories
      const validCategories = ["electronics", "accessories", "clothing", "home-and-furniture"];
      
      // Add buttons for each recognized category
      for (const tag of analysis.tags || []) {
        const normalizedTag = tag.toLowerCase();
        
        if (validCategories.includes(normalizedTag)) {
          const tagButton = new ButtonBuilder()
            .setCustomId(`tag:${normalizedTag}`)
            .setLabel(tag.charAt(0).toUpperCase() + tag.slice(1))
            .setStyle(ButtonStyle.Primary);
          
          tagButtons.push(tagButton);
        }
      }
      
      // If we don't have any category buttons, add the default ones
      if (tagButtons.length === 0) {
        for (const category of validCategories) {
          const tagButton = new ButtonBuilder()
            .setCustomId(`tag:${category}`)
            .setLabel(category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' & '))
            .setStyle(ButtonStyle.Secondary);
          
          tagButtons.push(tagButton);
        }
      }
      
      // Send the formatted message to the channel
      const sentMessage = await message.channel.send({
        content: formattedResponse
      });
      
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
          
          // Send the DM with buttons
          await dmChannel.send({
            content: `Your ISO request for ${analysis.item} has been posted! Please select which category this belongs to:`,
            components: [categoryRow]
          });
          
          // Send a separate message with just the fulfill button
          await dmChannel.send({
            content: "When you've found this item, click the button below to mark it as fulfilled.",
            components: [fulfillRow]
          });
          
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
      
      // Create a simplified response
      formattedResponse = `<@${message.author.id}> is looking for ${article ? article + ' ' : ''}${item}`;
      
      // Send the formatted message
      const sentMessage = await message.channel.send({
        content: formattedResponse
      });
      
      log(`Formatted ISO request for ${message.author.username} in #${channelName}: ${item}`, "discord-bot");
      
      // Add default category buttons
      const defaultCategories = ["electronics", "accessories", "clothing", "home-and-furniture"];
      const defaultButtons = defaultCategories.map(category => {
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
      
      // Create button rows
      const categoryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(defaultButtons);
      const fulfillRow = new ActionRowBuilder<ButtonBuilder>().addComponents(fulfilledButton);
      
      // Forward to DM with buttons
      try {
        const dmChannel = await message.author.createDM();
        
        await dmChannel.send({
          content: `Your ISO request for ${item} has been posted! Please select which category this belongs to:`,
          components: [categoryRow]
        });
        
        await dmChannel.send({
          content: "When you've found this item, click the button below to mark it as fulfilled.",
          components: [fulfillRow]
        });
        
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

// Ko-fi donation processing function
// Create forum post from external form submission
export async function createForumPost(postData: {
  title: string;
  description: string;
  category: string;
  type: string;
  imageUrl: string;
  location?: string;
  lat?: number;
  lng?: number;
  userId: string;
  username: string;
  discordAvatar?: string;
}): Promise<{ success: boolean; threadId?: string; error?: string }> {
  try {
    if (!bot) {
      return { success: false, error: "Bot is not initialized" };
    }

    // Find the items-exchange forum channel
    let forumChannel = null;
    for (const guild of bot.guilds.cache.values()) {
      const channel = guild.channels.cache.find((ch: any) => 
        ch.name === "items-exchange" && ch.type === ChannelType.GuildForum
      );
      if (channel) {
        forumChannel = channel;
        break;
      }
    }

    if (!forumChannel) {
      return { success: false, error: "Items-exchange forum channel not found" };
    }

    // Discover and map Discord forum tags dynamically
    const availableTags = (forumChannel as any).availableTags || [];
    log(`Found ${availableTags.length} available forum tags`, "discord-bot");
    
    // Map form category/type values to Discord tag IDs by name matching
    const categoryTags: Record<string, string> = {};
    const typeTags: Record<string, string> = {};
    
    for (const tag of availableTags) {
      const tagName = tag.name.toLowerCase();
      log(`Processing forum tag: ${tag.name} (ID: ${tag.id})`, "discord-bot");
      
      // Map category tags
      if (tagName.includes('clothing')) categoryTags['clothing'] = tag.id;
      else if (tagName.includes('footwear') || tagName.includes('shoes')) categoryTags['footwear'] = tag.id;
      else if (tagName.includes('accessories')) categoryTags['accessories'] = tag.id;
      else if (tagName.includes('home') || tagName.includes('furniture')) categoryTags['home_furniture'] = tag.id;
      else if (tagName.includes('electronics') || tagName.includes('tech')) categoryTags['electronics'] = tag.id;
      else if (tagName.includes('misc') || tagName.includes('other')) categoryTags['misc'] = tag.id;
      
      // Map type tags
      if (tagName.includes('give') || tagName.includes('offer')) typeTags['give'] = tag.id;
      else if (tagName.includes('trade') || tagName.includes('swap')) typeTags['trade'] = tag.id;
      else if (tagName.includes('request') || tagName.includes('iso') || tagName.includes('want')) typeTags['request'] = tag.id;
    }
    
    log(`Category tags mapped: ${JSON.stringify(categoryTags)}`, "discord-bot");
    log(`Type tags mapped: ${JSON.stringify(typeTags)}`, "discord-bot");

    // Get tag IDs for the category and type
    const categoryTagId = categoryTags[postData.category.toLowerCase()];
    const typeTagId = typeTags[postData.type.toLowerCase()];

    // Build applied tags array - only include valid tag IDs
    const appliedTags: string[] = [];
    if (categoryTagId) appliedTags.push(categoryTagId);
    if (typeTagId) appliedTags.push(typeTagId);

    // Map exchange type to emoji
    const typeEmojis = {
      'give': '🎁',
      'request': '🔍', 
      'trade': '🔄'
    };

    // Map exchange type display names
    const typeDisplayNames = {
      'give': 'Offer',
      'request': 'Request', 
      'trade': 'Trade'
    };

    // Create location information for the embed
    let locationInfo = '';
    if (postData.location) {
      locationInfo += `\n\n**Location:** ${postData.location}`;
    }
    if (postData.lat && postData.lng) {
      const mapsUrl = `https://www.google.com/maps?q=${postData.lat},${postData.lng}`;
      locationInfo += `\n[📍 View location on map](${mapsUrl})`;
    }

    // Create the main content embed
    const mainEmbed: any = {
      color: postData.type === 'give' ? 0x57F287 : postData.type === 'request' ? 0x3498DB : 0xF39C12,
      author: {
        name: postData.username,
        icon_url: postData.discordAvatar || `https://cdn.discordapp.com/embed/avatars/0.png`
      },
      title: `${typeDisplayNames[postData.type as keyof typeof typeDisplayNames] || postData.type.charAt(0).toUpperCase() + postData.type.slice(1)} ${getArticle(postData.title)}${postData.title}`,
      description: `${postData.username} is ${postData.type === 'give' ? 'offering to give away' : postData.type === 'request' ? 'looking for' : 'looking to trade'}:\n**${postData.title}**\n\n**Description:**\n${postData.description}${locationInfo}`,
      fields: [
        {
          name: 'Category',
          value: postData.category.charAt(0).toUpperCase() + postData.category.slice(1),
          inline: true
        },
        {
          name: 'Type',
          value: typeDisplayNames[postData.type as keyof typeof typeDisplayNames] || postData.type.charAt(0).toUpperCase() + postData.type.slice(1),
          inline: true
        },
        {
          name: 'Contact',
          value: postData.username,
          inline: true
        }
      ],
      footer: {
        text: `User ID: external-form • ${new Date().toLocaleString()}`
      }
    };

    // Add image thumbnail if available
    if (postData.imageUrl) {
      mainEmbed.thumbnail = { url: postData.imageUrl };
    }

    // Create the forum post with proper tags
    const thread = await (forumChannel as any).threads.create({
      name: `${typeDisplayNames[postData.type as keyof typeof typeDisplayNames] || postData.type.charAt(0).toUpperCase() + postData.type.slice(1)}: ${postData.title}`,
      message: {
        embeds: [mainEmbed]
      },
      appliedTags: appliedTags // Apply the category and type tags automatically
    });

    // Store in database
    await storage.createForumPost({
      threadId: thread.id,
      title: postData.title,
      authorId: postData.userId,
      category: postData.category,
      guildId: forumChannel.guild.id,
      channelId: forumChannel.id,
      isActive: true
    });

    // Make the user automatically follow their own thread
    try {
      // Add the user as a thread member to enable notifications
      await thread.members.add(postData.userId);
      log(`Auto-follow enabled for ${postData.username} on thread ${thread.id}`, "discord-bot");
    } catch (followError) {
      log(`Warning: Could not enable auto-follow for user ${postData.username}: ${followError}`, "discord-bot");
      // Don't fail the entire post creation if auto-follow fails
    }

    log(`Created forum post via external form: ${postData.title} by ${postData.username}`, "discord-bot");
    
    return { success: true, threadId: thread.id };

  } catch (error) {
    log(`Error creating forum post: ${error}`, "discord-bot");
    return { success: false, error: `${error}` };
  }
}

export async function processKofiDonation(donationData: InsertDonation): Promise<void> {
  try {
    // Record the donation in the database
    await storage.createDonation(donationData);
    
    // Update all active donation goals
    const activeGoals = await storage.getActiveDonationGoals(process.env.GUILD_ID || '');
    
    for (const goal of activeGoals) {
      // Calculate new total amount
      const totalDonations = await storage.getTotalDonationAmount();
      
      // Update the goal's current amount
      await storage.updateDonationGoalAmount(goal.id, totalDonations);
      
      // Update the Discord message with new progress
      await updateDonationProgressMessage(goal.channelId, goal.messageId, totalDonations, goal.goalAmount);
    }
    
    log(`Ko-fi donation processed: $${donationData.amount / 100} from ${donationData.donorName}`, "discord-bot");
  } catch (error) {
    log(`Error processing Ko-fi donation: ${error}`, "discord-bot");
  }
}

// Update donation progress message in Discord
async function updateDonationProgressMessage(channelId: string, messageId: string, currentAmount: number, goalAmount: number): Promise<void> {
  try {
    if (!bot) return;
    
    const channel = await bot.channels.fetch(channelId) as TextChannel;
    if (!channel) return;
    
    const message = await channel.messages.fetch(messageId);
    if (!message) return;
    
    const progressPercent = Math.min((currentAmount / goalAmount) * 100, 100);
    const progressBar = createProgressBar(progressPercent);
    
    const embed = new EmbedBuilder()
      .setTitle('💰 Donation Progress')
      .setDescription(`**Current Progress: $${(currentAmount / 100).toFixed(2)} / $${(goalAmount / 100).toFixed(2)}**\n\n${progressBar}\n\n${progressPercent.toFixed(1)}% Complete`)
      .setColor(progressPercent >= 100 ? 0x00ff00 : 0x3b82f6)
      .setTimestamp();
    
    if (progressPercent >= 100) {
      embed.setDescription(`**🎉 GOAL REACHED! $${(currentAmount / 100).toFixed(2)} / $${(goalAmount / 100).toFixed(2)}**\n\n${progressBar}\n\n✅ 100% Complete - Thank you for your support!`);
    }
    
    await message.edit({ embeds: [embed] });
    
    log(`Updated donation progress: ${progressPercent.toFixed(1)}% ($${(currentAmount / 100).toFixed(2)}/$${(goalAmount / 100).toFixed(2)})`, "discord-bot");
  } catch (error) {
    log(`Error updating donation progress message: ${error}`, "discord-bot");
  }
}

// Create a visual progress bar
function createProgressBar(percent: number): string {
  const barLength = 20;
  const filledLength = Math.round((percent / 100) * barLength);
  const emptyLength = barLength - filledLength;
  
  const filled = '🟩'.repeat(filledLength);
  const empty = '⬜'.repeat(emptyLength);
  
  return `[${filled}${empty}] ${percent.toFixed(1)}%`;
}

// Handle donation-related slash commands
async function handleDonationCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const commandName = interaction.commandName;
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    switch (commandName) {
      case 'initgoal':
        await handleInitGoal(interaction);
        break;
      case 'resetgoal':
        await handleResetGoal(interaction);
        break;
      case 'donate':
        await handleDonate(interaction);
        break;
      case 'testkofi':
        await handleTestKofi(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown donation command.', ephemeral: true });
    }
  } catch (error) {
    log(`Error handling donation command: ${error}`, "discord-bot");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
    }
  }
}

// Handle /initgoal command
async function handleInitGoal(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check if user has moderator permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: 'You need moderator permissions (Manage Messages) to create donation goals.', ephemeral: true });
    return;
  }
  
  const goalAmount = interaction.options.getInteger('amount', true) * 100; // Convert to cents
  const channelId = interaction.channelId;
  const guildId = interaction.guildId || '';
  
  try {
    // Check if there's already an active donation goal for this guild
    const existingGoals = await storage.getActiveDonationGoals(guildId);
    
    log(`[INITGOAL DEBUG] Found ${existingGoals.length} existing active goals for guild ${guildId}`, "discord-bot");
    existingGoals.forEach((goal, index) => {
      log(`[INITGOAL DEBUG] Goal ${index + 1}: ID=${goal.id}, Amount=$${goal.goalAmount/100}, Current=$${goal.currentAmount/100}, Channel=${goal.channelId}, Message=${goal.messageId}`, "discord-bot");
    });
    
    if (existingGoals.length > 0) {
      log(`[INITGOAL DEBUG] Multiple goals detected, deactivating ${existingGoals.length - 1} old goals`, "discord-bot");
      
      // If there are multiple goals, deactivate all except the newest one
      if (existingGoals.length > 1) {
        // Sort by creation date, keep the newest
        existingGoals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const goalsToDeactivate = existingGoals.slice(1); // All except the first (newest)
        
        for (const goal of goalsToDeactivate) {
          log(`[INITGOAL DEBUG] Deactivating old goal ID=${goal.id}`, "discord-bot");
          await db.update(donationGoals)
            .set({ 
              isActive: false,
              updatedAt: new Date()
            })
            .where(eq(donationGoals.id, goal.id));
        }
      }
      
      // Update the remaining active goal
      const activeGoal = existingGoals[0];
      const currentAmount = activeGoal.currentAmount;
      
      log(`[INITGOAL DEBUG] Updating active goal ID=${activeGoal.id} with new amount $${goalAmount/100}`, "discord-bot");
      
      // Update the goal amount
      await db.update(donationGoals)
        .set({ 
          goalAmount: goalAmount,
          updatedAt: new Date()
        })
        .where(eq(donationGoals.id, activeGoal.id));
      
      // Update the existing progress message
      await updateDonationProgressMessage(activeGoal.channelId, activeGoal.messageId, currentAmount, goalAmount);
      
      await interaction.reply({ 
        content: `Updated existing donation goal to $${(goalAmount / 100).toFixed(2)}. Current progress: $${(currentAmount / 100).toFixed(2)}`, 
        ephemeral: true 
      });
      
      log(`[INITGOAL DEBUG] Successfully updated donation goal to $${goalAmount / 100} in channel ${activeGoal.channelId}`, "discord-bot");
    } else {
      // Create new goal if none exists
      const embed = new EmbedBuilder()
        .setTitle('💰 Donation Progress')
        .setDescription(`**Current Progress: $0.00 / $${(goalAmount / 100).toFixed(2)}**\n\n${createProgressBar(0)}\n\n0.0% Complete`)
        .setColor(0x3b82f6)
        .setTimestamp();
      
      // Send the initial message - check if in donate channel for ephemeral setting
      const isDonateChannel = interaction.channel?.isTextBased() && 'name' in interaction.channel
        ? interaction.channel.name?.toLowerCase().includes('donat') || false 
        : false;
      const message = await interaction.reply({ 
        embeds: [embed], 
        ephemeral: isDonateChannel,
        fetchReply: true 
      });
      
      // Create donation goal in database
      await storage.createDonationGoal({
        guildId,
        channelId,
        messageId: message.id,
        goalAmount,
        currentAmount: 0,
        isActive: true
      });
      
      log(`Created donation goal of $${goalAmount / 100} in channel ${channelId}`, "discord-bot");
    }
  } catch (error) {
    log(`Error creating donation goal: ${error}`, "discord-bot");
    await interaction.reply({ content: 'Failed to create donation goal. Please try again.', ephemeral: true });
  }
}

// Handle /resetgoal command
async function handleResetGoal(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check if user has admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'You need administrator permissions to reset donation goals.', ephemeral: true });
    return;
  }
  
  try {
    const guildId = interaction.guildId || '';
    const activeGoals = await storage.getActiveDonationGoals(guildId);
    
    for (const goal of activeGoals) {
      await storage.updateDonationGoalAmount(goal.id, 0);
      await updateDonationProgressMessage(goal.channelId, goal.messageId, 0, goal.goalAmount);
    }
    
    await interaction.reply({ content: `Reset ${activeGoals.length} donation goal(s) to $0.00.`, ephemeral: true });
    log(`Admin ${interaction.user.username} reset ${activeGoals.length} donation goals`, "discord-bot");
  } catch (error) {
    log(`Error resetting donation goals: ${error}`, "discord-bot");
    await interaction.reply({ content: 'Failed to reset donation goals. Please try again.', ephemeral: true });
  }
}

// Handle /donate command
async function handleDonate(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId || '';
    
    // Get active donation goals for this guild
    const activeGoals = await storage.getActiveDonationGoals(guildId);
    
    log(`[DONATE DEBUG] Found ${activeGoals.length} active goals for guild ${guildId}`, "discord-bot");
    activeGoals.forEach((goal, index) => {
      log(`[DONATE DEBUG] Goal ${index + 1}: ID=${goal.id}, Amount=$${goal.goalAmount/100}, Current=$${goal.currentAmount/100}`, "discord-bot");
    });
    
    let description = 'Help support our community by making a donation! Every contribution helps us maintain and improve our services.';
    
    // Add progress information if there are active goals
    if (activeGoals.length > 0) {
      // If there are multiple active goals, log a warning and use only the first
      if (activeGoals.length > 1) {
        log(`[DONATE WARNING] Multiple active goals detected (${activeGoals.length}), displaying only the first one`, "discord-bot");
      }
      
      // Use only the first active goal
      const goal = activeGoals[0];
      const currentDollars = goal.currentAmount / 100;
      const goalDollars = goal.goalAmount / 100;
      const percent = goal.goalAmount > 0 ? (goal.currentAmount / goal.goalAmount) * 100 : 0;
      const progressBar = createProgressBar(percent);
      
      description += '\n\n**Current Progress:**\n';
      description += `\n$${currentDollars.toFixed(2)} / $${goalDollars.toFixed(2)}\n${progressBar}\n${percent.toFixed(1)}% Complete`;
    } else {
      description += '\n\n*No active donation goals set.*';
    }
    
    const embed = new EmbedBuilder()
      .setTitle('☕ Support Us on Ko-fi')
      .setDescription(description)
      .setColor(0x13C3FF)
      .setTimestamp();
    
    const donateButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Donate on Ko-fi')
      .setURL('https://ko-fi.com/buynothingexchange');
    
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(donateButton);
    
    // Check if in donate channel to make response ephemeral
    const isDonateChannel = interaction.channel?.isTextBased() && 'name' in interaction.channel
      ? interaction.channel.name?.toLowerCase().includes('donat') || false 
      : false;
    await interaction.reply({ 
      embeds: [embed], 
      components: [row], 
      ephemeral: isDonateChannel 
    });
    
    log(`User ${interaction.user.username} viewed donation link`, "discord-bot");
  } catch (error) {
    log(`Error showing donation link: ${error}`, "discord-bot");
    await interaction.reply({ content: 'Failed to show donation link. Please try again.', ephemeral: true });
  }
}

// Handle /testkofi command
async function handleTestKofi(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check if user has admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'You need administrator permissions to test Ko-fi functionality.', ephemeral: true });
    return;
  }
  
  try {
    const amount = interaction.options.getNumber('amount', true);
    const donorName = interaction.options.getString('name') || 'Test Donor';
    
    // Create test donation data
    const testDonation: InsertDonation = {
      kofiTransactionId: `test_${Date.now()}`,
      donorName,
      amount: Math.round(amount * 100), // Convert to cents
      message: 'This is a test donation',
      email: null,
      isPublic: true
    };
    
    // Process the test donation
    await processKofiDonation(testDonation);
    
    await interaction.reply({ 
      content: `Test donation of $${amount} from "${donorName}" processed successfully!`, 
      ephemeral: true 
    });
    
    log(`Admin ${interaction.user.username} tested Ko-fi with $${amount} donation`, "discord-bot");
  } catch (error) {
    log(`Error testing Ko-fi: ${error}`, "discord-bot");
    await interaction.reply({ content: 'Failed to test Ko-fi functionality. Please try again.', ephemeral: true });
  }
}

// Register slash commands with Discord
async function registerSlashCommands() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !bot?.user?.id) {
    log("Cannot register slash commands: missing token or bot not ready", "discord-bot");
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    log('Started refreshing application (/) commands.', "discord-bot");
    log(`Total commands to register: ${commands.length}`, "discord-bot");
    log(`Commands: ${commands.map(cmd => cmd.name).join(', ')}`, "discord-bot");

    // Register global commands (more reliable)
    await rest.put(
      Routes.applicationCommands(bot.user.id),
      { body: commands }
    );

    log(`Successfully registered ${commands.length} global commands.`, "discord-bot");
    
    // Also clear guild-specific commands to avoid conflicts
    const guilds = bot.guilds.cache;
    guilds.forEach(async (guild) => {
      try {
        await rest.put(
          Routes.applicationGuildCommands(bot.user.id, guild.id),
          { body: [] }
        );
        log(`Cleared guild commands for: ${guild.name || guild.id}`, "discord-bot");
      } catch (guildError) {
        log(`Error clearing guild commands for ${guild.name || guild.id}: ${guildError}`, "discord-bot");
      }
    });

    log('Successfully registered global commands. Commands may take up to 1 hour to appear in Discord.', "discord-bot");
  } catch (error) {
    log(`Error registering slash commands: ${error}`, "discord-bot");
  }
}
