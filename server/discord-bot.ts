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

// Bot instance
let bot: Client | null = null;

// Slash command definitions
const commands = [
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
    .setDescription('Submit anonymous comments, suggestions, or reports to the community moderators')
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

// Temporary user data storage
const tempUserData = new Map<string, any>();

// Auto-bump functionality
let autoBumpInterval: NodeJS.Timeout | null = null;
const AUTO_BUMP_CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour
const DAYS_BEFORE_BUMP = 6;

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

    // Get all guilds the bot is in
    const guilds = bot.guilds.cache;
    
    // Iterate over guilds and register commands
    for (const guild of guilds.values()) {
      log(`Registering commands for guild: ${guild.name} (${guild.id})`, "discord-bot");
      
      try {
        // Clear existing guild commands first
        await rest.put(
          Routes.applicationGuildCommands(bot.user.id, guild.id),
          { body: [] }
        );
        
        // Register new commands for this guild
        await rest.put(
          Routes.applicationGuildCommands(bot.user.id, guild.id),
          { body: commands }
        );
        
        log(`Successfully registered ${commands.length} commands for guild: ${guild.name}`, "discord-bot");
      } catch (guildError) {
        log(`Error registering commands for guild ${guild.name}: ${guildError}`, "discord-bot");
      }
    }

    // Also clear global commands to avoid conflicts
    await rest.put(
      Routes.applicationCommands(bot.user.id),
      { body: [] }
    );

    log('Successfully reloaded guild-specific commands.', "discord-bot");
  } catch (error) {
    log(`Error registering slash commands: ${error}`, "discord-bot");
  }
}

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
      GatewayIntentBits.DirectMessages // Needed for DM interactions
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
    
    // Register slash commands
    await registerSlashCommands();
    
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
    
    // Start auto-bump checker
    startAutoBumpChecker();
    
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
        await message.reply("Hello! I'm Batata, and I format ISO requests and PIF offers in a standardized way. Post a message starting with ISO or PIF to see me in action!");
        return;
      }
      
      // Only handle ISO/PIF requests in general-chat
      const channelName = (message.channel as any).name?.toLowerCase();
      if (channelName === 'general-chat') {
        const content = message.content.trim().toUpperCase();
        if (message.guild && content.startsWith('ISO ') && content.length > 4) {
          log(`Detected ISO request from ${message.author.username}`, "discord-bot");
          await handleIsoRequest(message);
        } else if (message.guild && content.startsWith('PIF ') && content.length > 4) {
          log(`Detected PIF request from ${message.author.username}`, "discord-bot");
          await handlePifRequest(message);
        }
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
  { id: "home_furniture", label: "Home & Furniture", style: ButtonStyle.Primary },
  { id: "footwear", label: "Footwear", style: ButtonStyle.Primary },
  { id: "misc", label: "Misc", style: ButtonStyle.Primary }
];

// Create category selection buttons - split into two rows since Discord limits 5 buttons per row
function createCategoryButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>();
  const row2 = new ActionRowBuilder<ButtonBuilder>();
  
  // First row: Electronics, Accessories, Clothing
  row1.addComponents(
    new ButtonBuilder()
      .setCustomId('category:electronics')
      .setLabel('Electronics')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('category:accessories')
      .setLabel('Accessories')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('category:clothing')
      .setLabel('Clothing')
      .setStyle(ButtonStyle.Secondary)
  );
  
  // Second row: Home & Furniture, Footwear, Misc
  row2.addComponents(
    new ButtonBuilder()
      .setCustomId('category:home_furniture')
      .setLabel('Home & Furniture')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('category:footwear')
      .setLabel('Footwear')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('category:misc')
      .setLabel('Misc')
      .setStyle(ButtonStyle.Secondary)
  );
  
  return [row1, row2];
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

// Detect if message is direct PIF request
function isDirectPifRequest(message: Message): boolean {
  const content = message.content.trim().toUpperCase();
  return content.startsWith('PIF ') && content.length > 4;
}



// Handle direct PIF request
async function handlePifRequest(message: Message): Promise<void> {
  // PIF requests now use the same workflow as ISO - redirect to handleIsoRequest
  await handleIsoRequest(message);
}

// Handle slash command for ISO/PIF requests
async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const commandName = interaction.commandName;
    
    if (commandName === 'exchange') {
      log(`Processing /${commandName} command from ${interaction.user.tag}`, "discord-bot");
      
      // Debug: Log all options received
      const options = interaction.options.data;
      log(`Command options received: ${JSON.stringify(options)}`, "discord-bot");
      
      // Create action selection dropdown
      const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('action_select')
            .setPlaceholder('What would you like to do?')
            .addOptions([
              {
                label: 'Trade',
                description: 'Exchange items with other members',
                value: 'trade'
              },
              {
                label: 'Give',
                description: 'Offer items for free to the community',
                value: 'give'
              },
              {
                label: 'Request',
                description: 'Request items from the community',
                value: 'request'
              }
            ])
        );
      
      // Initialize temp user data without item name (will be collected in modal)
      if (!global.tempUserData) global.tempUserData = new Map();
      global.tempUserData.set(interaction.user.id, { timestamp: Date.now() });
      
      // Send ephemeral reply - this is truly private!
      await interaction.reply({
        content: "What would you like to do?",
        components: [actionRow],
        flags: 64 // InteractionResponseFlags.Ephemeral
      });
      
      log(`Successfully sent ephemeral reply to ${interaction.user.tag}`, "discord-bot");
      
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
                   '**Description:** Create an exchange form that will be posted in the items-exchange forum channel.\n' +
                   '**Process:**\n' +
                   '• Choose your action: Trade, Give, or Request\n' +
                   '• Select a category for your item\n' +
                   '• Fill out item details in the form\n' +
                   '• Your post appears in the forum with proper tags\n' +
                   '**Example:** Simply type `/exchange` to start',
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
          },
          {
            name: '🔄 Auto-Bump Feature',
            value: 'Forum posts are automatically bumped after 6 days of inactivity to keep them visible in the community.',
            inline: false
          },
          {
            name: '📋 Categories Available',
            value: '• Electronics\n• Accessories\n• Clothing\n• Home & Furniture\n• Footwear\n• Miscellaneous',
            inline: false
          },
          {
            name: '💡 Tips',
            value: '• All interactions are private (only you can see them)\n' +
                   '• Be specific when describing your items\n' +
                   '• Include condition and any relevant details\n' +
                   '• Check the items-exchange forum regularly for new posts',
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
        flags: 64 // InteractionResponseFlags.Ephemeral
      });
      
      log(`Successfully sent help message to ${interaction.user.tag}`, "discord-bot");
      

    } else if (commandName === 'updatepost') {
      log(`Processing /updatepost command from ${interaction.user.tag}`, "discord-bot");
      
      // Get user's active forum posts from storage
      const userPosts = await storage.getForumPostsByUser(interaction.user.id);
      log(`Found ${userPosts.length} total posts for user ${interaction.user.id}`, "discord-bot");
      userPosts.forEach((post, index) => {
        log(`Post ${index}: threadId=${post.threadId}, title="${post.title}", isActive=${post.isActive}`, "discord-bot");
      });
      
      const activePosts = userPosts.filter(post => post.isActive);
      
      if (activePosts.length === 0) {
        await interaction.reply({
          content: "You don't have any active forum posts to update. Use `/exchange` to create a new post!",
          ephemeral: true
        });
        return;
      }
      
      // Create dropdown with user's posts (limit to 25 due to Discord API limits)
      const postOptions = activePosts.slice(0, 25).map(post => ({
        label: post.title.length > 100 ? post.title.substring(0, 97) + "..." : post.title,
        description: "Click to manage this post",
        value: post.threadId
      }));
      
      const postSelectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('update_post_select')
            .setPlaceholder('Select the post you want to update')
            .addOptions(postOptions)
        );
      
      await interaction.reply({
        content: "Select the post you want to update.",
        components: [postSelectRow],
        ephemeral: true
      });
      
      log(`Successfully sent post selection to ${interaction.user.tag} with ${activePosts.length} posts`, "discord-bot");
    
    } else if (commandName === 'contactus' || commandName === 'contactusanon') {
      const isAnonymous = commandName === 'contactusanon';
      log(`Processing /${commandName} command from ${interaction.user.tag}`, "discord-bot");
      
      // Create dropdown with contact options
      const contactOptionsRow = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`contact_select:${isAnonymous}`)
            .setPlaceholder('Select the type of feedback you want to submit')
            .addOptions([
              {
                label: 'Comments',
                description: 'General comments about the community',
                value: 'comments'
              },
              {
                label: 'Suggestions',
                description: 'Ideas to improve the community',
                value: 'suggestions'
              },
              {
                label: 'Report',
                description: 'Report concerns or issues',
                value: 'report'
              }
            ])
        );
      
      await interaction.reply({
        content: `Please select the type of feedback you want to submit${isAnonymous ? ' (anonymously)' : ''}:`,
        components: [contactOptionsRow],
        flags: 64 // Ephemeral
      });
      
      log(`Successfully sent contact options to ${interaction.user.tag}`, "discord-bot");
    
    } else if (commandName === 'mystats') {
      log(`Processing /mystats command from ${interaction.user.tag}`, "discord-bot");
      
      // Check if user has moderator permissions and is in mod-chat channel
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      const hasModPerms = member?.permissions.has(PermissionFlagsBits.ManageMessages) || 
                         member?.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                         member?.permissions.has(PermissionFlagsBits.Administrator);
      
      const isModChannel = interaction.channel?.type === ChannelType.GuildText && 
                          (interaction.channel as any).name?.toLowerCase().includes('mod');
      
      if (!hasModPerms || !isModChannel) {
        await interaction.reply({
          content: "This command is restricted to moderators and can only be used in mod channels.",
          ephemeral: true
        });
        log(`${interaction.user.tag} attempted to use /mystats without proper permissions or in wrong channel`, "discord-bot");
        return;
      }
      
      try {
        // Get user's ISO requests and forum posts
        const userRequests = await storage.getIsoRequestsByUser(interaction.user.id);
        const userPosts = await storage.getForumPostsByUser(interaction.user.id);
        
        // Calculate statistics
        const totalRequests = userRequests.length;
        const fulfilledRequests = userRequests.filter(req => req.fulfilled).length;
        const activeRequests = userRequests.filter(req => !req.fulfilled).length;
        
        const totalPosts = userPosts.length;
        const activePosts = userPosts.filter(post => post.isActive).length;
        const inactivePosts = userPosts.filter(post => !post.isActive).length;
        
        // Group requests by category
        const requestsByCategory = userRequests.reduce((acc: any, req) => {
          if (req.category) {
            acc[req.category] = (acc[req.category] || 0) + 1;
          }
          return acc;
        }, {});
        
        // Create stats embed
        const statsEmbed = new EmbedBuilder()
          .setTitle(`📊 Exchange Statistics for ${interaction.user.displayName || interaction.user.username}`)
          .setColor(0x5865F2) // Discord blurple
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            {
              name: '🔄 ISO Requests',
              value: `**Total:** ${totalRequests}\n**Active:** ${activeRequests}\n**Fulfilled:** ${fulfilledRequests}`,
              inline: true
            },
            {
              name: '📝 Forum Posts',
              value: `**Total:** ${totalPosts}\n**Active:** ${activePosts}\n**Completed:** ${inactivePosts}`,
              inline: true
            },
            {
              name: '📈 Success Rate',
              value: totalRequests > 0 ? `${Math.round((fulfilledRequests / totalRequests) * 100)}%` : 'No data yet',
              inline: true
            }
          )
          .setTimestamp()
          .setFooter({ 
            text: 'Use /exchange to create new posts • Use /updatepost to manage existing posts',
            iconURL: interaction.client.user?.displayAvatarURL()
          });
        
        // Add category breakdown if there are requests
        if (Object.keys(requestsByCategory).length > 0) {
          const categoryText = Object.entries(requestsByCategory)
            .map(([category, count]) => `**${category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' & ')}:** ${count}`)
            .join('\n');
          
          statsEmbed.addFields({
            name: '📂 Requests by Category',
            value: categoryText,
            inline: false
          });
        }
        
        // Add recent activity if there are any requests
        if (userRequests.length > 0) {
          const recentRequests = userRequests
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 3);
          
          const recentText = recentRequests
            .map(req => `• ${req.content} ${req.fulfilled ? '✅' : '⏳'}`)
            .join('\n');
          
          statsEmbed.addFields({
            name: '🕐 Recent Activity',
            value: recentText || 'No recent activity',
            inline: false
          });
        }
        
        await sendEphemeralWithAutoDelete(interaction, {
          embeds: [statsEmbed]
        });
        
        log(`Successfully sent stats to ${interaction.user.tag}`, "discord-bot");
        
      } catch (statsError) {
        log(`Error fetching user stats: ${statsError}`, "discord-bot");
        await interaction.reply({
          content: "Sorry, I couldn't retrieve your statistics right now. Please try again later.",
          ephemeral: true
        });
      }
    
    } else if (commandName === 'exchanges') {
      log(`Processing /exchanges command from ${interaction.user.tag}`, "discord-bot");
      
      // Check if user has moderator permissions and is in mod-chat channel
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      const hasModPerms = member?.permissions.has(PermissionFlagsBits.ManageMessages) || 
                         member?.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                         member?.permissions.has(PermissionFlagsBits.Administrator);
      
      const isModChannel = interaction.channel?.type === ChannelType.GuildText && 
                          (interaction.channel as any).name?.toLowerCase().includes('mod');
      
      if (!hasModPerms || !isModChannel) {
        await sendEphemeralWithAutoDelete(interaction, 
          "This command is restricted to moderators and can only be used in mod channels."
        );
        log(`${interaction.user.tag} attempted to use /exchanges without proper permissions or in wrong channel`, "discord-bot");
        return;
      }
      
      try {
        // Get all confirmed exchanges
        const exchanges = await storage.getAllConfirmedExchanges(25);
        
        if (exchanges.length === 0) {
          await sendEphemeralWithAutoDelete(interaction, "No confirmed exchanges found yet.");
          return;
        }
        
        // Create exchanges embed
        const exchangesEmbed = new EmbedBuilder()
          .setTitle(`📊 Confirmed Exchanges (Last ${exchanges.length})`)
          .setColor(0x00FF00) // Green for successful exchanges
          .setTimestamp()
          .setFooter({ 
            text: 'Exchange tracking system',
            iconURL: interaction.client.user?.displayAvatarURL()
          });
        
        // Group exchanges by type for summary
        const exchangeTypes = exchanges.reduce((acc: any, ex) => {
          acc[ex.exchangeType] = (acc[ex.exchangeType] || 0) + 1;
          return acc;
        }, {});
        
        const summaryText = Object.entries(exchangeTypes)
          .map(([type, count]) => `**${type.charAt(0).toUpperCase() + type.slice(1)}:** ${count}`)
          .join('\n');
        
        exchangesEmbed.addFields({
          name: '📈 Exchange Summary',
          value: summaryText,
          inline: false
        });
        
        // Add recent exchanges (limit to 10 to fit in embed)
        const recentExchanges = exchanges.slice(0, 10);
        const exchangeText = recentExchanges
          .map(ex => {
            const date = new Date(ex.confirmedAt).toLocaleDateString();
            const typeIcon = ex.exchangeType === 'give' ? '🎁' : ex.exchangeType === 'trade' ? '🔄' : '🙏';
            return `${typeIcon} **${ex.originalPosterUsername}** ↔ **${ex.tradingPartnerUsername}**\n` +
                   `   "${ex.itemDescription}" (${ex.category}) - ${date}`;
          })
          .join('\n\n');
        
        exchangesEmbed.addFields({
          name: '🔄 Recent Exchanges',
          value: exchangeText || 'No recent exchanges',
          inline: false
        });
        
        // Add total count
        exchangesEmbed.setDescription(`Total confirmed exchanges in the system: **${exchanges.length}**`);
        
        await sendEphemeralWithAutoDelete(interaction, {
          embeds: [exchangesEmbed]
        });
        
        log(`Successfully sent exchanges list to ${interaction.user.tag}`, "discord-bot");
        
      } catch (exchangesError) {
        log(`Error fetching exchanges: ${exchangesError}`, "discord-bot");
        await sendEphemeralWithAutoDelete(interaction,
          "Sorry, I couldn't retrieve the exchanges right now. Please try again later."
        );
      }
    }
  } catch (error) {
    log(`Error handling slash command: ${error}`, "discord-bot");
  }
}

// Handle direct ISO request (legacy text-based)
async function handleIsoRequest(message: Message): Promise<void> {
  try {
    log(`Processing request from ${message.author.tag} in channel: ${(message.channel as any).name}`, "discord-bot");
    
    // Create action selection dropdown
    const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('action_select')
          .setPlaceholder('What would you like to do?')
          .addOptions([
            {
              label: 'Trade',
              description: 'Exchange items with other members',
              value: 'trade'
            },
            {
              label: 'Give',
              description: 'Offer items for free to the community',
              value: 'give'
            },
            {
              label: 'Request',
              description: 'Request items from the community',
              value: 'request'
            }
          ])
      );
    
    // Send DM with dropdown - this is the only way to make it truly private
    log(`Attempting to send DM to ${message.author.tag}`, "discord-bot");
    
    try {
      await message.author.send({
        content: "What would you like to do?",
        components: [actionRow]
      });
      log(`Successfully sent DM to ${message.author.tag}`, "discord-bot");
    } catch (dmError) {
      log(`DM failed: ${dmError}`, "discord-bot");
      // Try regular channel message as fallback
      await message.channel.send({
        content: `<@${message.author.id}> What would you like to do? (I couldn't DM you, please enable DMs from server members)`,
        components: [actionRow]
      });
      log(`Sent regular channel message as fallback to ${message.author.tag}`, "discord-bot");
    }
    
    // Now delete the original message
    try {
      await message.delete();
      log(`Deleted original message from ${message.author.tag}`, "discord-bot");
    } catch (deleteError) {
      log(`Could not delete original message: ${deleteError}`, "discord-bot");
    }
    
    log(`Completed ISO request handling for ${message.author.tag}`, "discord-bot");
  } catch (error) {
    log(`Error handling request: ${error}`, "discord-bot");
  }
}

// Handle action selection from dropdown
async function handleActionSelection(interaction: any, selectedAction: string): Promise<void> {
  try {
    // Immediately acknowledge the interaction to prevent timeout
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate();
    }

    // Store the action selection temporarily, preserving existing data
    const existingData = tempUserData.get(interaction.user.id) || {};
    const userData = { ...existingData, action: selectedAction, userId: interaction.user.id };
    tempUserData.set(interaction.user.id, userData);
    
    log(`User ${interaction.user.tag} action stored: ${selectedAction}`, "discord-bot");

    // Create category selection dropdown
    const categoryRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('category_select')
          .setPlaceholder('What category is your item?')
          .addOptions([
            { label: 'Electronics', value: 'electronics' },
            { label: 'Accessories', value: 'accessories' },
            { label: 'Clothing', value: 'clothing' },
            { label: 'Home & Furniture', value: 'home_furniture' },
            { label: 'Footwear', value: 'footwear' },
            { label: 'Misc', value: 'misc' }
          ])
      );

    // Update the message to show category selection
    await interaction.editReply({
      content: "What category is your item?",
      components: [categoryRow]
    });

  } catch (error) {
    log(`Error handling action selection: ${error}`, "discord-bot");
    // Try to respond with error if interaction hasn't been acknowledged
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "There was an error processing your selection. Please try again.",
          ephemeral: true
        });
      } catch (replyError) {
        log(`Error replying to action selection error: ${replyError}`, "discord-bot");
      }
    }
  }
}

// Handle category selection and show modal form
async function handleCategoryModalSelection(interaction: any, selectedCategory: string): Promise<void> {
  try {
    // Get stored user data from the correct location
    const userData = tempUserData.get(interaction.user.id);
    if (!userData || !userData.action) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Session expired. Please start over with a new ISO or PIF request.",
          ephemeral: true
        });
      }
      return;
    }

    const selectedAction = userData.action;
    
    // Create modal form based on action type
    const modal = new ModalBuilder()
      .setCustomId(`item_modal:${selectedAction}:${selectedCategory}`)
      .setTitle(`${selectedAction.charAt(0).toUpperCase() + selectedAction.slice(1)} Item Details`);

    // Item title field
    const titleInput = new TextInputBuilder()
      .setCustomId('item_title')
      .setLabel('Item Name/Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('What is the item called?')
      .setValue(userData.itemName || '')
      .setRequired(true)
      .setMaxLength(100);

    // Description field
    const descriptionInput = new TextInputBuilder()
      .setCustomId('item_description')
      .setLabel('Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Provide details about the item (condition, features, etc.)')
      .setRequired(true)
      .setMaxLength(1000);

    const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const descriptionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    
    modal.addComponents(titleRow, descriptionRow);

    // Add urgency field for requests
    if (selectedAction === 'request') {
      const urgencyInput = new TextInputBuilder()
        .setCustomId('item_urgency')
        .setLabel('Urgency Level')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., "ASAP", "Within a week", "Not urgent"')
        .setRequired(false)
        .setMaxLength(50);

      const urgencyRow = new ActionRowBuilder<TextInputBuilder>().addComponents(urgencyInput);
      modal.addComponents(urgencyRow);
    }

    // Show modal directly as response to category selection
    // showModal() automatically acknowledges the interaction
    await interaction.showModal(modal);
    log(`Showed modal form for ${selectedAction} in category ${selectedCategory}`, "discord-bot");
  } catch (error) {
    log(`Error showing modal: ${error}`, "discord-bot");
    
    // Only try to reply if interaction hasn't been acknowledged
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "There was an error showing the form. Please try again.",
          ephemeral: true
        });
      } catch (replyError) {
        log(`Error replying to failed modal: ${replyError}`, "discord-bot");
      }
    }
  }
}

// Handle contact type selection and show appropriate modal
async function handleContactSelection(interaction: any, contactType: string, isAnonymous: boolean): Promise<void> {
  try {
    let bodyPlaceholder = '';
    
    switch (contactType) {
      case 'comments':
        bodyPlaceholder = 'Please share your general comments about the community...';
        break;
      case 'suggestions':
        bodyPlaceholder = 'Please give us some feedback. Its much appreciated.';
        break;
      case 'report':
        bodyPlaceholder = 'Please detail any concerns that you may have and any users that may be involved';
        break;
    }

    const modal = new ModalBuilder()
      .setCustomId(`contact_modal:${contactType}:${isAnonymous}`)
      .setTitle(`${contactType.charAt(0).toUpperCase() + contactType.slice(1)} ${isAnonymous ? '(Anonymous)' : ''}`);

    const titleInput = new TextInputBuilder()
      .setCustomId('contact_title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const bodyInput = new TextInputBuilder()
      .setCustomId('contact_body')
      .setLabel('Details')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(bodyPlaceholder)
      .setMaxLength(2000)
      .setRequired(true);

    const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const bodyRow = new ActionRowBuilder<TextInputBuilder>().addComponents(bodyInput);

    modal.addComponents(titleRow, bodyRow);

    await interaction.showModal(modal);
    log(`Showed ${contactType} modal to ${interaction.user.tag} (anonymous: ${isAnonymous})`, "discord-bot");
  } catch (error) {
    log(`Error showing contact modal: ${error}`, "discord-bot");
    
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "There was an error showing the form. Please try again.",
          flags: 64
        });
      } catch (replyError) {
        log(`Error replying to failed contact modal: ${replyError}`, "discord-bot");
      }
    }
  }
}

// Handle contact modal submission and create forum post
async function handleContactModalSubmission(interaction: any): Promise<void> {
  try {
    await interaction.deferReply({ flags: 64 });
    
    const [, contactType, isAnonymousStr] = interaction.customId.split(':');
    const isAnonymous = isAnonymousStr === 'true';
    const title = interaction.fields.getTextInputValue('contact_title');
    const body = interaction.fields.getTextInputValue('contact_body');

    // Create embed for the contact submission
    const embed = new EmbedBuilder()
      .setTimestamp(new Date())
      .setFooter({ 
        text: `Submission ID: ${Date.now()}`,
        iconURL: interaction.client.user?.displayAvatarURL()
      });

    let embedTitle = '';
    let embedColor = 0x2b2d31; // Default dark color

    switch (contactType) {
      case 'comments':
        embedTitle = 'Community Comment';
        embedColor = 0x3498db; // Blue
        break;
      case 'suggestions':
        embedTitle = 'Community Suggestion';
        embedColor = 0x2ecc71; // Green
        break;
      case 'report':
        embedTitle = 'Community Report';
        embedColor = 0xe74c3c; // Red
        break;
    }

    embed.setTitle(`${embedTitle}: ${title}`)
         .setDescription(body)
         .setColor(embedColor);

    if (!isAnonymous) {
      embed.setAuthor({
        name: interaction.user.displayName || interaction.user.username,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 64 })
      })
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'Submitted by', value: `${interaction.user.displayName || interaction.user.username}`, inline: true },
        { name: 'User ID', value: interaction.user.id, inline: true }
      );
    } else {
      embed.setAuthor({
        name: 'Anonymous Submission',
        iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png'
      })
      .addFields(
        { name: 'Submitted by', value: 'Anonymous User', inline: true }
      );
    }

    // Find the contact-us forum channel
    const forumChannel = interaction.client.channels.cache.find(
      (channel: any) => 
        channel.type === ChannelType.GuildForum && 
        channel.name?.toLowerCase() === 'contact-us'
    );

    if (!forumChannel) {
      await interaction.editReply({
        content: "Could not find the contact-us forum channel. Please contact an admin."
      });
      return;
    }

    // Find and apply the contact type tag
    const forumTags = (forumChannel as any).availableTags || [];
    log(`Available contact forum tags: ${forumTags.map((tag: any) => tag.name).join(', ')}`, "discord-bot");
    log(`Looking for contact type tag: "${contactType}"`, "discord-bot");
    
    const contactTypeTag = forumTags.find((tag: any) => tag.name.toLowerCase() === contactType.toLowerCase());
    const appliedTags = contactTypeTag ? [contactTypeTag.id] : [];
    
    if (contactTypeTag) {
      log(`Found contact type tag "${contactType}" with ID: ${contactTypeTag.id}`, "discord-bot");
    } else {
      log(`Contact type tag "${contactType}" not found in available tags`, "discord-bot");
    }

    // Create the forum post
    const forumPost = await (forumChannel as any).threads.create({
      name: `${embedTitle}: ${title}`,
      message: { embeds: [embed] },
      appliedTags: appliedTags
    });
    
    log(`Contact forum post created with ID: ${forumPost.id}`, "discord-bot");

    // Confirm to user
    const tagText = contactTypeTag ? ` with ${contactType} tag` : ' (tag not found)';
    await interaction.editReply({
      content: `✅ Your ${contactType} "${title}" has been submitted to the contact-us forum${isAnonymous ? ' anonymously' : ''}${tagText}!`
    });

    log(`Created contact forum post for ${contactType} by ${isAnonymous ? 'anonymous user' : interaction.user.tag}: "${title}" with tag: ${contactTypeTag ? contactType : 'none'}`, "discord-bot");
  } catch (error) {
    log(`Error handling contact modal submission: ${error}`, "discord-bot");
    try {
      await interaction.editReply({
        content: "There was an error processing your submission. Please try again."
      });
    } catch (editError) {
      log(`Error editing contact reply: ${editError}`, "discord-bot");
    }
  }
}

// Handle modal submission and create the final post
async function handleModalSubmission(interaction: any): Promise<void> {
  try {
    await interaction.deferReply({ flags: 64 }); // Use flags instead of ephemeral
    
    const [, action, category] = interaction.customId.split(':');
    const title = interaction.fields.getTextInputValue('item_title');
    const description = interaction.fields.getTextInputValue('item_description');
    let urgency = '';
    
    if (action === 'request') {
      try {
        urgency = interaction.fields.getTextInputValue('item_urgency') || 'Not specified';
      } catch {
        urgency = 'Not specified';
      }
    }

    // Create embed based on action type
    const embed = new EmbedBuilder()
      .setTimestamp(new Date())
      .setAuthor({
        name: interaction.user.displayName || interaction.user.username,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 64 })
      })
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ 
        text: `User ID: ${interaction.user.id}`,
        iconURL: interaction.client.user?.displayAvatarURL()
      });

    let embedTitle = '';
    let embedDescription = '';
    
    if (action === 'trade') {
      embedTitle = 'Trade Offer';
      embedDescription = `**${interaction.user.displayName || interaction.user.username}** wants to trade: **${title}**`;
      embed.setColor(0x3498db); // Blue
      embed.addFields(
        { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' & '), inline: true },
        { name: 'Type', value: 'Trade', inline: true },
        { name: 'Contact', value: `${interaction.user.displayName || interaction.user.username}`, inline: true }
      );
    } else if (action === 'give') {
      embedTitle = 'PIF Offer';
      embedDescription = `**${interaction.user.displayName || interaction.user.username}** is offering to give away: **${title}**`;
      embed.setColor(0x57F287); // Green
      embed.addFields(
        { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' & '), inline: true },
        { name: 'Type', value: 'Give Away', inline: true },
        { name: 'Contact', value: `${interaction.user.displayName || interaction.user.username}`, inline: true }
      );
    } else if (action === 'request') {
      embedTitle = 'ISO Request';
      embedDescription = `**${interaction.user.displayName || interaction.user.username}** is looking for: **${title}**`;
      embed.setColor(0x2b2d31); // Dark
      embed.addFields(
        { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' & '), inline: true },
        { name: 'Type', value: 'Request', inline: true },
        { name: 'Urgency', value: urgency, inline: true },
        { name: 'Contact', value: `${interaction.user.displayName || interaction.user.username}`, inline: true }
      );
    }

    embed.setTitle(embedTitle)
         .setDescription(`${embedDescription}\n\n**Description:**\n${description}`);

    // Find the items-exchange forum channel
    const forumChannel = interaction.client.channels.cache.find(
      (channel: any) => 
        channel.type === ChannelType.GuildForum && 
        channel.name?.toLowerCase() === 'items-exchange'
    );

    if (!forumChannel) {
      await interaction.editReply({
        content: "Could not find the items-exchange forum channel. Please contact an admin."
      });
      return;
    }

    // Map categories to forum tag names (matching actual forum tags)
    const categoryTagMap: {[key: string]: string} = {
      'electronics': 'electronics',
      'accessories': 'accessories', 
      'clothing': 'clothing',
      'home_furniture': 'home and furniture',
      'footwear': 'footwear',
      'misc': 'misc'
    };

    const tagName = categoryTagMap[category];
    
    // Find the tag IDs for both category and action type
    const forumTags = (forumChannel as any).availableTags || [];
    log(`Available forum tags: ${forumTags.map((tag: any) => tag.name).join(', ')}`, "discord-bot");
    log(`Looking for category tag: "${tagName}" and action tag: "${action}"`, "discord-bot");
    
    const categoryTag = forumTags.find((tag: any) => tag.name === tagName);
    const actionTag = forumTags.find((tag: any) => tag.name === action);
    
    // Apply both category and action tags
    const appliedTags = [];
    if (categoryTag) {
      appliedTags.push(categoryTag.id);
      log(`Found category tag "${tagName}" with ID: ${categoryTag.id}`, "discord-bot");
    } else {
      log(`Category tag "${tagName}" not found in available tags`, "discord-bot");
    }
    
    if (actionTag) {
      appliedTags.push(actionTag.id);
      log(`Found action tag "${action}" with ID: ${actionTag.id}`, "discord-bot");
    } else {
      log(`Action tag "${action}" not found in available tags`, "discord-bot");
    }

    // Create the forum post
    const forumPost = await (forumChannel as any).threads.create({
      name: `${embedTitle}: ${title}`,
      message: { embeds: [embed] },
      appliedTags: appliedTags
    });
    
    // Debug logging to understand the structure
    log(`Forum post created with ID: ${forumPost.id}`, "discord-bot");
    log(`Forum post object keys: ${Object.keys(forumPost)}`, "discord-bot");
    
    // Add the original user as a follower to the forum post
    try {
      await forumPost.members.add(interaction.user.id);
      log(`Added user ${interaction.user.tag} as follower to forum post ${forumPost.id}`, "discord-bot");
    } catch (followError) {
      log(`Could not add user ${interaction.user.tag} as follower: ${followError}`, "discord-bot");
      // Try alternative method - send a message mentioning the user to ensure they're notified
      try {
        await forumPost.send(`<@${interaction.user.id}> You've been added to follow this post for updates!`);
        log(`Mentioned user ${interaction.user.tag} in forum post ${forumPost.id} as fallback`, "discord-bot");
      } catch (mentionError) {
        log(`Could not mention user in forum post: ${mentionError}`, "discord-bot");
      }
    }
    
    // Track the forum post for auto-bump functionality
    await storage.createForumPost({
      threadId: forumPost.id,
      channelId: forumChannel.id,
      guildId: interaction.guild?.id || '',
      authorId: interaction.user.id,
      title: title,
      category: category,
      lastActivity: new Date(),
      bumpCount: 0,
      isActive: true
    });
    
    log(`Stored forum post with threadId: ${forumPost.id}`, "discord-bot");
    
    // Store the request in database
    await storage.createIsoRequest({
      content: `${action.toUpperCase()} ${title}`,
      username: interaction.user.tag,
      userId: interaction.user.id,
      discordMessageId: forumPost.id,
      category: category
    });

    // Confirm to user
    const appliedTagNames = [];
    if (categoryTag) appliedTagNames.push(tagName);
    if (actionTag) appliedTagNames.push(action);
    
    const tagText = appliedTagNames.length > 0 
      ? `with ${appliedTagNames.join(' and ')} tags` 
      : 'without tags (tags not found)';
    
    await interaction.editReply({
      content: `✅ Your ${action} request for "${title}" has been posted to the items-exchange forum ${tagText}!`
    });

    log(`Created forum post in #items-exchange with tags: ${appliedTagNames.join(', ')} for ${action} request: "${title}"`, "discord-bot");

    // Clean up temporary data
    tempUserData.delete(interaction.user.id);
  } catch (error) {
    log(`Error handling modal submission: ${error}`, "discord-bot");
    try {
      await interaction.editReply({
        content: "There was an error processing your request. Please try again."
      });
    } catch (editError) {
      log(`Error editing reply: ${editError}`, "discord-bot");
    }
  }
}

// Handle category selection from button interaction (legacy)
async function handleCategorySelection(
  interaction: any, 
  categoryId: string
): Promise<void> {
  try {
    const userId = interaction.user.id;
    const userRequests = await storage.getIsoRequestsByUser(userId, 5);
    
    if (userRequests.length === 0) {
      await interaction.reply({
        content: "I couldn't find your request in our system. Please send a new ISO or PIF request.",
        ephemeral: true
      });
      return;
    }
    
    const request = userRequests[0];
    const updatedRequest = await storage.updateIsoRequestCategory(request.id, categoryId);
    
    if (!updatedRequest) {
      await interaction.reply({
        content: "I had trouble updating your request. Please try again.",
        ephemeral: true
      });
      return;
    }
    
    const category = CATEGORIES.find(cat => cat.id === categoryId);
    const isPif = request.content.trim().toUpperCase().startsWith('PIF ');
    const requestType = isPif ? 'PIF offer' : 'ISO request';
    
    await interaction.update({
      content: `Your ${requestType} has been categorized as **${category?.label || categoryId}**. I'll cross-post it to the appropriate channel!`,
      components: []
    });
    
    // Cross-post to appropriate channel
    const categoryChannelMap: {[key: string]: string} = {
      'electronics': 'electronics',
      'accessories': 'accessories', 
      'clothing': 'clothing',
      'home_furniture': 'home-and-furniture',
      'footwear': 'footwear',
      'misc': 'misc'
    };
    
    const channelName = categoryChannelMap[categoryId];
    const targetChannel = interaction.client.channels.cache.find(
      channel => 
        channel.isTextBased() && 
        !channel.isDMBased() && 
        (channel as any).name?.toLowerCase() === channelName.toLowerCase()
    );
    
    if (targetChannel && targetChannel.isTextBased()) {
      // Extract the item from the original request using AI
      const { extractItemName } = await import('./openai-service');
      const item = await extractItemName(request.content.trim());
      
      // Create beautiful embed with different wording for PIF vs ISO
      const embed = new EmbedBuilder()
        .setTitle(isPif ? 'PIF Offer' : 'ISO Request')
        .setDescription(isPif 
          ? `<@${request.userId}> is offering ${item}`
          : `<@${request.userId}> is looking for ${item}`)
        .addFields(
          { name: 'Category', value: category?.label || categoryId, inline: true },
          { name: isPif ? 'Offered by' : 'Requested by', value: request.username, inline: true }
        )
        .setTimestamp(request.timestamp)
        .setColor(isPif ? 0x57F287 : 0x2b2d31); // Green for PIF, dark for ISO
      
      await (targetChannel as TextChannel).send({
        embeds: [embed]
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
    await interaction.deferReply({ ephemeral: true });
    
    const userId = interaction.user.id;
    const userRequests = await storage.getIsoRequestsByUser(userId, 10);
    
    if (userRequests.length === 0) {
      await interaction.editReply("I couldn't find any recent requests from you to mark as fulfilled.");
      return;
    }
    
    // Find the most recent request
    const recentRequest = userRequests[0];
    const isPif = recentRequest.content.trim().toUpperCase().startsWith('PIF ');
    
    // Find archive channel
    const archiveChannel = interaction.client.channels.cache.find(
      channel => 
        channel instanceof TextChannel && 
        (channel as any).name?.toLowerCase() === 'archive'
    ) as TextChannel;
    
    if (!archiveChannel) {
      await interaction.editReply("I couldn't find an archive channel. Please contact an admin.");
      return;
    }
    
    // Find the original embed in the specific category channel
    let originalMessage = null;
    let originalChannel = null;
    
    // Log the actual stored category to debug
    log(`Stored category in database: "${recentRequest.category}"`, "discord-bot");
    
    // Convert category ID to channel name format (categoryId is stored in database)
    const categoryToChannel: { [key: string]: string } = {
      'electronics': 'electronics',
      'accessories': 'accessories', 
      'clothing': 'clothing',
      'home_furniture': 'home-and-furniture',
      'footwear': 'footwear',
      'misc': 'misc'
    };
    
    const targetChannelName = categoryToChannel[recentRequest.category];
    log(`Searching for original message from user <@${userId}> in specific channel: #${targetChannelName} (mapped from "${recentRequest.category}")`, "discord-bot");
    
    if (targetChannelName) {
      const channel = interaction.client.channels.cache.find(
        ch => ch instanceof TextChannel && (ch as any).name?.toLowerCase() === targetChannelName
      ) as TextChannel;
      
      if (channel) {
        log(`Searching in #${targetChannelName}`, "discord-bot");
        try {
          const messages = await channel.messages.fetch({ limit: 50 });
          log(`Fetched ${messages.size} messages from #${targetChannelName}`, "discord-bot");
          
          const foundMessage = messages.find(msg => {
            const hasEmbed = msg.author.bot && msg.embeds.length > 0;
            const embed = msg.embeds[0];
            const hasUserMention = embed?.description?.includes(`<@${userId}>`);
            const isOriginalRequest = embed?.title && !embed.title.includes('Fulfilled') && !embed.title.includes('Given');
            const hasCategory = embed?.fields?.some(field => field.name === 'Category');
            
            if (hasEmbed) {
              log(`Message ${msg.id}: bot=${msg.author.bot}, embeds=${msg.embeds.length}, hasUserMention=${hasUserMention}, isOriginalRequest=${isOriginalRequest}, hasCategory=${hasCategory}, title="${embed?.title}", description="${embed?.description}"`, "discord-bot");
            }
            
            return hasEmbed && hasUserMention && isOriginalRequest && hasCategory;
          });
          
          if (foundMessage) {
            log(`Found original message in #${targetChannelName}: ${foundMessage.id}`, "discord-bot");
            originalMessage = foundMessage;
            originalChannel = channel;
          }
        } catch (error) {
          log(`Error searching channel ${targetChannelName}: ${error}`, "discord-bot");
        }
      } else {
        log(`Channel #${targetChannelName} not found`, "discord-bot");
      }
    }
    
    if (!originalMessage || !originalChannel) {
      await interaction.editReply("I couldn't find your original request to mark as fulfilled. It may have already been processed.");
      return;
    }
    
    // Copy the original embed to archive with fulfilled status
    const originalEmbed = originalMessage.embeds[0];
    log(`Found original embed - Title: ${originalEmbed.title}, Description: ${originalEmbed.description}`, "discord-bot");
    log(`Original embed fields: ${JSON.stringify(originalEmbed.fields)}`, "discord-bot");
    
    const archivedEmbed = new EmbedBuilder()
      .setTitle(originalEmbed.title + ' - ' + (isPif ? 'Given' : 'Fulfilled'))
      .setDescription(originalEmbed.description)
      .addFields(originalEmbed.fields)
      .addFields(
        { name: isPif ? 'Marked as given by' : 'Marked as fulfilled by', value: interaction.user.tag, inline: true },
        { name: isPif ? 'Given on' : 'Fulfilled on', value: new Date().toLocaleDateString(), inline: true }
      )
      .setTimestamp(new Date())
      .setColor('#57F287'); // Green for completed
    
    log(`Created archived embed - Title: ${archivedEmbed.data.title}, Description: ${archivedEmbed.data.description}`, "discord-bot");
    
    // Send to archive channel
    await archiveChannel.send({ embeds: [archivedEmbed] });
    log(`Sent embed to archive channel`, "discord-bot");
    
    // Delete the original message from the category channel
    try {
      await originalMessage.delete();
      log(`Successfully deleted original message from #${originalChannel.name}`, "discord-bot");
    } catch (deleteError) {
      log(`Error deleting original message: ${deleteError}`, "discord-bot");
    }
    
    // Update the request in storage
    await storage.markIsoRequestFulfilled(recentRequest.id);
    
    await interaction.editReply({
      content: `Your ${isPif ? 'PIF offer' : 'ISO request'} has been marked as ${isPif ? 'given' : 'fulfilled'} and moved to the archive!`
    });
    
    log(`${isPif ? 'PIF offer' : 'ISO request'} ${isPif ? 'given' : 'fulfilled'} by ${interaction.user.tag}`, "discord-bot");
  } catch (error) {
    log(`Error handling fulfill request: ${error}`, "discord-bot");
    try {
      await interaction.editReply("There was an error processing your request. Please try again.");
    } catch (replyError) {
      log(`Error replying to fulfill interaction: ${replyError}`, "discord-bot");
    }
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
      
      if (commandName === 'exchange' || commandName === 'help' || commandName === 'updatepost' || commandName === 'mystats' || commandName === 'exchanges' || commandName === 'contactus' || commandName === 'contactusanon') {
        log(`Processing /${commandName} slash command`, "discord-bot");
        await handleSlashCommand(interaction);
      }
      return;
    }
    
    // Handle select menu interactions (action and category selection)
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;
      
      if (customId === 'action_select') {
        const selectedAction = interaction.values[0];
        log(`User ${interaction.user.tag} selected action: ${selectedAction}`, "discord-bot");
        await handleActionSelection(interaction, selectedAction);
      } else if (customId === 'category_select') {
        const selectedCategory = interaction.values[0];
        log(`User ${interaction.user.tag} selected category: ${selectedCategory}`, "discord-bot");
        await handleCategoryModalSelection(interaction, selectedCategory);
      } else if (customId === 'update_post_select') {
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
    
    // Handle button interactions (legacy fulfill button)
    if (interaction.isButton()) {
      const customId = interaction.customId;
      log(`Button clicked: ${customId} by user ${interaction.user.tag}`, "discord-bot");
      
      // Handle legacy category selection (keep for backward compatibility)
      if (customId.startsWith('category:')) {
        const categoryId = customId.split(':')[1];
        log(`Processing legacy category selection: ${categoryId}`, "discord-bot");
        await handleCategorySelection(interaction, categoryId);
      }
      
      // Handle fulfill item button
      if (customId === 'fulfill:item') {
        log(`Processing fulfill request`, "discord-bot");
        await handleFulfillRequest(interaction);
      }
      
      // Handle post update buttons
      if (customId.startsWith('mark_claimed:')) {
        const threadId = customId.split(':')[1];
        log(`Processing mark as claimed for thread: ${threadId}`, "discord-bot");
        await handleMarkAsClaimed(interaction, threadId);
      } else if (customId.startsWith('still_available:')) {
        const threadId = customId.split(':')[1];
        log(`Processing still available for thread: ${threadId}`, "discord-bot");
        await handleStillAvailable(interaction, threadId);
      }
      return;
    }
    
    log(`Ignoring unsupported interaction type`, "discord-bot");
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
    // Stop auto-bump checker before restarting
    stopAutoBumpChecker();
    
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

// Helper function to send ephemeral message with auto-deletion
async function sendEphemeralWithAutoDelete(interaction: any, content: string | { content?: string; embeds?: any[]; components?: any[] }, deleteAfterSeconds: number = 15) {
  try {
    const response = await interaction.reply({
      ...(typeof content === 'string' ? { content } : content),
      ephemeral: true
    });
    
    // Schedule deletion after specified seconds
    setTimeout(async () => {
      try {
        await interaction.deleteReply();
        log(`Auto-deleted ephemeral message after ${deleteAfterSeconds} seconds`, "discord-bot");
      } catch (deleteError) {
        log(`Could not auto-delete ephemeral message: ${deleteError}`, "discord-bot");
      }
    }, deleteAfterSeconds * 1000);
    
    return response;
  } catch (error) {
    log(`Error sending ephemeral message with auto-delete: ${error}`, "discord-bot");
    throw error;
  }
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

// Handle post selection for update
async function handleUpdatePostSelection(interaction: any, threadId: string): Promise<void> {
  try {
    log(`Looking for post with threadId: ${threadId}`, "discord-bot");
    
    // Debug: Get all posts for this user to see what's actually stored
    const allUserPosts = await storage.getForumPostsByUser(interaction.user.id);
    log(`All posts for user ${interaction.user.id}:`, "discord-bot");
    allUserPosts.forEach(p => {
      log(`  - threadId: ${p.threadId}, title: ${p.title}, isActive: ${p.isActive}`, "discord-bot");
    });
    
    // Get the forum post from storage
    const post = await storage.getForumPost(threadId);
    
    if (!post) {
      log(`Post with threadId ${threadId} not found in storage`, "discord-bot");
      await interaction.update({
        content: "Post not found in our records. It may have been deleted.",
        components: [],
        ephemeral: true
      });
      return;
    }
    
    // Verify the user owns this post
    if (post.authorId !== interaction.user.id) {
      await interaction.update({
        content: "You can only update your own posts.",
        components: [],
        ephemeral: true
      });
      return;
    }
    
    // Create buttons for post status
    const statusButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`mark_claimed:${threadId}`)
          .setLabel('Mark as Claimed')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`still_available:${threadId}`)
          .setLabel('Still Available')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔄')
      );
    
    // Include clickable link to the original post
    const postLink = `[View Post](https://discord.com/channels/${post.guildId}/${threadId})`;
    
    await interaction.update({
      content: `**${post.title}**\n\nHas this item been fulfilled?\n\n${postLink}`,
      components: [statusButtons],
      ephemeral: true
    });
    
    log(`User ${interaction.user.tag} selected post for update: ${post.title}`, "discord-bot");
  } catch (error) {
    log(`Error handling post selection: ${error}`, "discord-bot");
    try {
      await interaction.update({
        content: "There was an error loading your post. Please try again.",
        components: [],
        ephemeral: true
      });
    } catch (updateError) {
      log(`Error updating interaction: ${updateError}`, "discord-bot");
    }
  }
}

// Handle "Mark as Claimed" button click
async function handleMarkAsClaimed(interaction: any, threadId: string): Promise<void> {
  try {
    // Verify ownership again
    const post = await storage.getForumPost(threadId);
    if (!post || post.authorId !== interaction.user.id) {
      await interaction.update({
        content: "You can only update your own posts.",
        components: [],
        ephemeral: true
      });
      return;
    }
    
    // Create modal to ask who received the item
    const claimModal = new ModalBuilder()
      .setCustomId(`claim_modal:${threadId}`)
      .setTitle('Mark Item as Claimed');
    
    const recipientInput = new TextInputBuilder()
      .setCustomId('recipient')
      .setLabel('Who received this item?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter the username or @ mention')
      .setRequired(true)
      .setMaxLength(100);
    
    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(recipientInput);
    claimModal.addComponents(actionRow);
    
    await interaction.showModal(claimModal);
    
    log(`Showing claim modal for thread: ${threadId}`, "discord-bot");
  } catch (error) {
    log(`Error handling mark as claimed: ${error}`, "discord-bot");
    try {
      await interaction.update({
        content: "There was an error processing your request. Please try again.",
        components: [],
        ephemeral: true
      });
    } catch (updateError) {
      log(`Error updating interaction: ${updateError}`, "discord-bot");
    }
  }
}

// Handle "Still Available" button click
async function handleStillAvailable(interaction: any, threadId: string): Promise<void> {
  try {
    // Verify ownership
    const post = await storage.getForumPost(threadId);
    if (!post || post.authorId !== interaction.user.id) {
      await interaction.update({
        content: "You can only update your own posts.",
        components: [],
        ephemeral: true
      });
      return;
    }
    
    // Update the post activity to bump it up
    await storage.updateForumPostActivity(threadId);
    
    // Create a link to the post
    const postLink = `[View Post](https://discord.com/channels/${post.guildId}/${threadId})`;
    
    await interaction.update({
      content: `✅ Your post "${post.title}" has been marked as still available and activity updated.\n\n${postLink}`,
      components: [],
      ephemeral: true
    });
    
    log(`User ${interaction.user.tag} marked post as still available: ${post.title}`, "discord-bot");
  } catch (error) {
    log(`Error handling still available: ${error}`, "discord-bot");
    try {
      await interaction.update({
        content: "There was an error updating your post. Please try again.",
        components: [],
        ephemeral: true
      });
    } catch (updateError) {
      log(`Error updating interaction: ${updateError}`, "discord-bot");
    }
  }
}

// Handle claim modal submission
async function handleClaimModalSubmission(interaction: any): Promise<void> {
  try {
    const threadId = interaction.customId.split(':')[1];
    const recipient = interaction.fields.getTextInputValue('recipient');
    
    // Verify ownership
    const post = await storage.getForumPost(threadId);
    if (!post || post.authorId !== interaction.user.id) {
      await interaction.reply({
        content: "You can only update your own posts.",
        ephemeral: true
      });
      return;
    }
    
    // Deactivate the forum post in storage
    await storage.deactivateForumPost(threadId);
    
    // Try to archive the thread
    try {
      const thread = await bot?.channels.fetch(threadId);
      if (thread && thread.isThread()) {
        await thread.setArchived(true);
        log(`Archived thread: ${threadId}`, "discord-bot");
      }
    } catch (archiveError) {
      log(`Could not archive thread ${threadId}: ${archiveError}`, "discord-bot");
    }
    
    // Create a link to the post
    const postLink = `[View Post](https://discord.com/channels/${post.guildId}/${threadId})`;
    
    await interaction.reply({
      content: `✅ Your post "${post.title}" has been marked as fulfilled and given to **${recipient}**.\n\nThe thread has been archived.\n\n${postLink}`,
      ephemeral: true
    });
    
    // Log the fulfillment
    await storage.createLog({
      userId: interaction.user.id,
      username: interaction.user.tag,
      command: 'updatepost',
      channel: 'items-exchange',
      status: 'fulfilled',
      message: `Post "${post.title}" marked as fulfilled by ${recipient}`,
      messageId: threadId
    });
    
    // Record the confirmed exchange for tracking
    try {
      // Determine exchange type based on post title/category
      let exchangeType = 'give'; // Default to give
      const titleLower = post.title.toLowerCase();
      if (titleLower.includes('trade') || titleLower.includes('swap') || titleLower.includes('exchange')) {
        exchangeType = 'trade';
      } else if (titleLower.includes('iso') || titleLower.includes('looking for') || titleLower.includes('need')) {
        exchangeType = 'request';
      }
      
      // Clean up recipient name (remove @ mentions and extra whitespace)
      const cleanRecipient = recipient.replace(/<@!?(\d+)>/g, '').trim();
      
      await storage.createConfirmedExchange({
        guildId: post.guildId,
        threadId: threadId,
        category: post.category,
        originalPosterId: interaction.user.id,
        originalPosterUsername: interaction.user.displayName || interaction.user.username,
        tradingPartnerId: cleanRecipient, // We don't have their Discord ID, just name
        tradingPartnerUsername: cleanRecipient,
        itemDescription: post.title,
        exchangeType: exchangeType
      });
      
      log(`Recorded confirmed exchange: ${interaction.user.tag} -> ${cleanRecipient} (${post.title})`, "discord-bot");
    } catch (exchangeError) {
      log(`Error recording confirmed exchange: ${exchangeError}`, "discord-bot");
      // Don't fail the whole operation if exchange recording fails
    }
    
    log(`User ${interaction.user.tag} marked post as fulfilled: ${post.title} -> ${recipient}`, "discord-bot");
  } catch (error) {
    log(`Error handling claim modal submission: ${error}`, "discord-bot");
    try {
      await interaction.reply({
        content: "There was an error processing your request. Please try again.",
        ephemeral: true
      });
    } catch (replyError) {
      log(`Error replying to interaction: ${replyError}`, "discord-bot");
    }
  }
}

// Auto-bump functionality
async function checkAndBumpInactivePosts(): Promise<void> {
  if (!bot) return;
  
  try {
    log('Checking for inactive forum posts to auto-bump', "discord-bot");
    
    // Get posts that have been inactive for 6 days
    const inactivePosts = await storage.getInactiveForumPosts(DAYS_BEFORE_BUMP);
    
    for (const post of inactivePosts) {
      try {
        // Get the forum thread
        const thread = await bot.channels.fetch(post.threadId);
        
        if (!thread || !thread.isThread()) {
          log(`Thread ${post.threadId} not found or not a thread, deactivating post`, "discord-bot");
          await storage.deactivateForumPost(post.threadId);
          continue;
        }
        
        // Check if thread is archived - if so, skip bumping
        if (thread.archived) {
          log(`Thread ${post.threadId} is archived, deactivating post`, "discord-bot");
          await storage.deactivateForumPost(post.threadId);
          continue;
        }
        
        // Send silent bump message
        log(`Auto-bumping post: ${post.title} (inactive for ${DAYS_BEFORE_BUMP} days)`, "discord-bot");
        
        const bumpMessage = await thread.send({
          content: ".",
          flags: ['SuppressNotifications'] // Silent message
        });
        
        // Delete the bump message immediately
        setTimeout(async () => {
          try {
            await bumpMessage.delete();
            log(`Deleted auto-bump message for post: ${post.title}`, "discord-bot");
          } catch (deleteError) {
            log(`Could not delete auto-bump message: ${deleteError}`, "discord-bot");
          }
        }, 1000); // Delete after 1 second
        
        // Update the post's bump count and last activity
        await storage.incrementBumpCount(post.threadId);
        
        log(`Successfully auto-bumped post: ${post.title} (bump #${post.bumpCount + 1})`, "discord-bot");
        
        // Add a small delay between bumps to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        log(`Error auto-bumping post ${post.title}: ${error}`, "discord-bot");
        
        // If there's an error accessing the thread, deactivate tracking
        if (error.message?.includes('Unknown Channel') || error.message?.includes('Missing Permissions')) {
          await storage.deactivateForumPost(post.threadId);
        }
      }
    }
    
    if (inactivePosts.length > 0) {
      log(`Auto-bump check completed: processed ${inactivePosts.length} inactive posts`, "discord-bot");
    }
    
  } catch (error) {
    log(`Error in auto-bump check: ${error}`, "discord-bot");
  }
}

function startAutoBumpChecker(): void {
  // Clear existing interval if any
  if (autoBumpInterval) {
    clearInterval(autoBumpInterval);
  }
  
  // Start the auto-bump checker
  autoBumpInterval = setInterval(checkAndBumpInactivePosts, AUTO_BUMP_CHECK_INTERVAL);
  log(`Auto-bump checker started (checking every ${AUTO_BUMP_CHECK_INTERVAL / 1000 / 60} minutes)`, "discord-bot");
  
  // Run an initial check after 1 minute
  setTimeout(checkAndBumpInactivePosts, 60000);
}

function stopAutoBumpChecker(): void {
  if (autoBumpInterval) {
    clearInterval(autoBumpInterval);
    autoBumpInterval = null;
    log('Auto-bump checker stopped', "discord-bot");
  }
}
