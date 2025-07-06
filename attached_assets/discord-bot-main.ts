// Copy this entire file as: server/discord-bot-fixed.ts
// Main Discord bot logic for Batata Exchange Bot

import { 
  Client, 
  GatewayIntentBits, 
  Message, 
  TextChannel, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ChatInputCommandInteraction,
  Interaction,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  SlashCommandBuilder,
  REST,
  Routes,
  ChannelType,
  User,
  ForumChannel,
  PermissionFlagsBits,
  Guild,
  Collection
} from 'discord.js';

import { storage } from './storage';
import { log } from './storage';
import type { InsertISORequest, InsertForumPost, InsertConfirmedExchange, InsertDonation } from '@shared/schema';
import { analyzeISORequest, extractItemName } from './openai-service';
import crypto from 'crypto';

// Global bot instance
let bot: Client | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let autoBumpInterval: NodeJS.Timeout | null = null;

// Stats tracking
let lastMessageTimestamp = Date.now();
let healthCheckFailures = 0;
let commandsProcessed = 0;
let connectionStartTime = new Date(); // When the current connection was established
const processStartTime = new Date(); // When the entire process started

// For processing ISO requests, use a global lock to prevent duplicates
let isProcessingIsoRequest = false;

// Helper function to determine the correct article (a, an, or none for plurals)
function getArticle(noun: string): string {
  if (!noun) return "a"; // Default if noun is empty
  
  // Check if the noun is plural (simplified check)
  if (noun.toLowerCase().endsWith('s')) {
    return ""; // No article for plurals
  }
  
  // Check if it starts with a vowel sound
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
    // Initialize bot configuration first
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
      GatewayIntentBits.DirectMessages
    ];

    bot = new Client({ intents });

    // Get bot token from storage
    const config = await storage.getBotConfig();
    if (!config?.token) {
      throw new Error("Bot token not configured");
    }

    const requiredPermissions = [
      'READ_MESSAGES',
      'SEND_MESSAGES', 
      'READ_MESSAGE_HISTORY',
      'ADD_REACTIONS',
      'EMBED_LINKS'
    ];
    
    log(`Required permissions: ${requiredPermissions.join(', ')}`, "discord-bot");

    // Set up event handlers
    bot.on('ready', async () => {
      log(`Bot logged in as ${bot?.user?.tag}`, "discord-bot");
      
      lastMessageTimestamp = Date.now();
      connectionStartTime = new Date();
      
      // Register slash commands
      await registerSlashCommands();
      
      // Start health check
      await performHealthCheck();
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
      healthCheckInterval = setInterval(performHealthCheck, 60000); // Every minute
      
      log("Bot initialized successfully", "discord-bot");
    });

    // Register interaction handler for button clicks
    log("Registered interaction handler for button clicks", "discord-bot");
    bot.on('interactionCreate', handleInteraction);

    bot.on('messageCreate', handleMessage);

    bot.on('disconnect', () => {
      log("Bot disconnected from Discord", "discord-bot");
    });

    bot.on('reconnecting', () => {
      log("Bot attempting to reconnect to Discord", "discord-bot");
    });

    bot.on('error', (error) => {
      log(`Discord client error: ${error.message}`, "discord-bot");
    });

    bot.on('warn', (warning) => {
      log(`Discord client warning: ${warning}`, "discord-bot");
    });

    // Login to Discord
    await bot.login(config.token);
    
    return bot;
  } catch (error) {
    log(`Failed to initialize bot: ${error}`, "discord-bot");
    throw error;
  }
}

// Handle incoming messages
async function handleMessage(message: Message) {
  try {
    // Ignore messages from bots and DMs
    if (message.author.bot || !message.guild) return;
    
    // Update last message timestamp for health check
    lastMessageTimestamp = Date.now();
    
    // Get bot configuration
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
    
    // Check for pending claim responses - user mentioning who they traded with
    if (message.mentions.users.size > 0) {
      try {
        const pendingClaims = await storage.getPendingClaimsByUserId(message.author.id);
        
        if (pendingClaims.length > 0) {
          // User has pending claims and mentioned someone - might be completing a claim
          const mentionedUser = message.mentions.users.first();
          if (mentionedUser && !mentionedUser.bot) {
            // Find the most recent pending claim
            const pendingClaim = pendingClaims[0];
            
            log(`User ${message.author.username} mentioned ${mentionedUser.username} with pending claim for thread ${pendingClaim.threadId}`, "discord-bot");
            
            // Process the claim completion
            await processPendingClaimCompletion(pendingClaim, message.author, mentionedUser, message);
          }
        }
      } catch (error) {
        log(`Error checking pending claims: ${error}`, "discord-bot");
      }
    }
    
  } catch (error) {
    log(`Error in handleMessage: ${error}`, "discord-bot");
  }
}

// Function to create category selection buttons
function createCategoryButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const categories = [
    { id: "electronics", label: "Electronics", emoji: "📱" },
    { id: "home_furniture", label: "Home & Furniture", emoji: "🏠" },
    { id: "clothing", label: "Clothing", emoji: "👕" },
    { id: "accessories", label: "Accessories", emoji: "👜" },
    { id: "footwear", label: "Footwear", emoji: "👟" },
    { id: "misc", label: "Miscellaneous", emoji: "📦" }
  ];

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  // Create rows of 3 buttons each
  for (let i = 0; i < categories.length; i += 3) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    for (let j = i; j < Math.min(i + 3, categories.length); j++) {
      const category = categories[j];
      const button = new ButtonBuilder()
        .setCustomId(`category_${category.id}`)
        .setLabel(category.label)
        .setEmoji(category.emoji)
        .setStyle(ButtonStyle.Secondary);
      
      row.addComponents(button);
    }
    
    rows.push(row);
  }
  
  return rows;
}

// Function to create the fulfill button
function createFulfillButton(): ActionRowBuilder<ButtonBuilder> {
  const fulfilledButton = new ButtonBuilder()
    .setCustomId('mark_fulfilled')
    .setLabel('Mark as Fulfilled')
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');
  
  return new ActionRowBuilder<ButtonBuilder>().addComponents(fulfilledButton);
}

// Check if message is a formatted ISO request (structured)
function isFormattedIsoRequest(message: Message): boolean {
  const content = message.content.toLowerCase();
  
  // Look for structured patterns
  const hasStructuredElements = [
    content.includes('looking for:'),
    content.includes('item:'),
    content.includes('category:'),
    content.includes('location:'),
    content.includes('offering:'),
    content.includes('trade:')
  ].some(Boolean);
  
  return hasStructuredElements;
}

// Check if message is a direct ISO request (simple text)
function isDirectIsoRequest(message: Message): boolean {
  const content = message.content.trim();
  
  // Simple ISO pattern: "ISO [item description]"
  const directPattern = /^iso\s+(.+)/i;
  
  return directPattern.test(content) && !isFormattedIsoRequest(message);
}

// Handle slash commands
async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;
  commandsProcessed++;
  
  log(`Processing /${commandName} slash command`, "discord-bot");
  
  try {
    switch (commandName) {
      case 'exchange':
        log(`Processing /exchange command from ${interaction.user.username}`, "discord-bot");
        
        try {
          // Generate a secure token for this user
          const token = crypto.randomBytes(32).toString('hex');
          
          // Store the token with user info and expiration (24 hours)
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await storage.createFormToken({
            token,
            userId: interaction.user.id,
            username: interaction.user.username,
            expiresAt
          });
          
          // Get the base URL from environment
          const baseUrl = process.env.REPLIT_DOMAINS ? 
            `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 
            'http://localhost:5000';
          
          log(`Generated form URL: ${baseUrl}/exchange?token=${token}`, "discord-bot");
          log(`Base URL used: ${baseUrl}`, "discord-bot");
          log(`REPLIT_DOMAINS: ${process.env.REPLIT_DOMAINS}`, "discord-bot");
          
          const formUrl = `${baseUrl}/exchange?token=${token}`;
          
          // Send ephemeral response with form link
          await sendEphemeralWithAutoDelete(interaction, {
            content: `🔗 **Create Exchange Request**\n\nClick the link below to fill out your exchange form:\n${formUrl}\n\n*This link is private and expires in 24 hours.*`,
          });
          
          log(`Successfully created authenticated form token for ${interaction.user.username}`, "discord-bot");
          
        } catch (error) {
          log(`Error in /exchange command: ${error}`, "discord-bot");
          await sendEphemeralWithAutoDelete(interaction, 
            "❌ Sorry, there was an error creating your exchange form. Please try again later."
          );
        }
        break;
        
      case 'help':
        const helpEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🤖 Batata Bot Commands')
          .setDescription('Here are all the available commands:')
          .addFields([
            {
              name: '📝 Exchange Commands',
              value: '`/exchange` - Create a new exchange request via web form\n`/markfulfilled tradedwith:@username` - Mark your exchange as completed',
              inline: false
            },
            {
              name: '📊 Information Commands',
              value: '`/mystats` - View your exchange statistics\n`/exchanges` - View all confirmed exchanges (moderators only)',
              inline: false
            },
            {
              name: '💬 Contact Commands',
              value: '`/contactus` - Contact the moderators\n`/contactusanon` - Contact the moderators anonymously',
              inline: false
            },
            {
              name: '💰 Donation Commands',
              value: '`/initgoal amount:number` - Set up a donation goal (admin only)\n`/resetgoal` - Reset donation progress (admin only)\n`/donate` - Get donation link\n`/testkofi` - Test Ko-fi webhook (admin only)',
              inline: false
            },
            {
              name: '🔧 Admin Commands', 
              value: '`/testautobump` - Test the auto-bump system (admin only)',
              inline: false
            }
          ])
          .setFooter({ text: 'Use /exchange to get started with creating exchange requests!' });
        
        await sendEphemeralWithAutoDelete(interaction, { embeds: [helpEmbed] });
        break;
        
      case 'markfulfilled':
        await handleMarkFulfilledDirect(interaction, '', interaction.options.getUser('tradedwith', true));
        break;
        
      case 'mystats':
        try {
          const userId = interaction.user.id;
          const username = interaction.user.username;
          
          // Get user's confirmed exchanges
          const exchanges = await storage.getExchangesByUserId(userId);
          
          // Get user's active forum posts
          const activePosts = await storage.getActiveForumPostsByUserId(userId);
          
          const statsEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`📊 Exchange Statistics for ${username}`)
            .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 128 }))
            .addFields([
              {
                name: '✅ Completed Exchanges',
                value: `${exchanges.length} total exchanges`,
                inline: true
              },
              {
                name: '📝 Active Posts',
                value: `${activePosts.length} currently active`,
                inline: true
              },
              {
                name: '📅 Member Since',
                value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:D>`,
                inline: true
              }
            ]);
          
          if (exchanges.length > 0) {
            const recentExchanges = exchanges
              .slice(-3)
              .map(ex => `• ${ex.itemDescription} with ${ex.tradingPartnerUsername}`)
              .join('\n');
            
            statsEmbed.addFields([
              {
                name: '🔄 Recent Exchanges',
                value: recentExchanges || 'None yet',
                inline: false
              }
            ]);
          }
          
          await sendEphemeralWithAutoDelete(interaction, { embeds: [statsEmbed] });
          
        } catch (error) {
          log(`Error in /mystats command: ${error}`, "discord-bot");
          await sendEphemeralWithAutoDelete(interaction, 
            "❌ Sorry, there was an error retrieving your statistics. Please try again later."
          );
        }
        break;
        
      case 'exchanges':
        // Check if user has admin permissions
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          await sendEphemeralWithAutoDelete(interaction, 
            "❌ You need Administrator permissions to use this command."
          );
          return;
        }
        
        try {
          const exchanges = await storage.getAllConfirmedExchanges();
          
          if (exchanges.length === 0) {
            await sendEphemeralWithAutoDelete(interaction, 
              "📊 No confirmed exchanges found yet."
            );
            return;
          }
          
          const exchangesEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('📊 All Confirmed Exchanges')
            .setDescription(`Total exchanges: ${exchanges.length}`)
            .addFields(
              exchanges.slice(-10).map(ex => ({
                name: `${ex.itemDescription}`,
                value: `**${ex.originalPosterUsername}** ↔ **${ex.tradingPartnerUsername}**\n<t:${Math.floor(ex.confirmedAt.getTime() / 1000)}:R>`,
                inline: false
              }))
            );
          
          if (exchanges.length > 10) {
            exchangesEmbed.setFooter({ text: `Showing latest 10 of ${exchanges.length} total exchanges` });
          }
          
          await sendEphemeralWithAutoDelete(interaction, { embeds: [exchangesEmbed] });
          
        } catch (error) {
          log(`Error in /exchanges command: ${error}`, "discord-bot");
          await sendEphemeralWithAutoDelete(interaction, 
            "❌ Sorry, there was an error retrieving exchange data. Please try again later."
          );
        }
        break;
        
      case 'contactus':
        await handleContactSelection(interaction, 'general', false);
        break;
        
      case 'contactusanon':
        await handleContactSelection(interaction, 'general', true);
        break;
        
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
        
      case 'testautobump':
        await handleTestAutoBump(interaction);
        break;
        
      default:
        await sendEphemeralWithAutoDelete(interaction, 
          `❌ Unknown command: /${commandName}`
        );
    }
  } catch (error) {
    log(`Error handling slash command /${commandName}: ${error}`, "discord-bot");
    
    try {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ Sorry, there was an error processing your command. Please try again later."
      );
    } catch (replyError) {
      log(`Error sending error reply: ${replyError}`, "discord-bot");
    }
  }
}

// Function to handle ISO requests
async function handleIsoRequest(message: Message): Promise<void> {
  try {
    const content = message.content.trim();
    
    // Check if it's a formatted request
    if (isFormattedIsoRequest(message)) {
      log("ISO request appears to be formatted, processing as structured request", "discord-bot");
      // For formatted requests, we can extract information directly
      // This would be implemented based on the specific format expected
      return;
    }
    
    // For direct ISO requests, use AI analysis
    if (isDirectIsoRequest(message)) {
      log("ISO request appears to be direct text, forwarding to category selection", "discord-bot");
      
      // Forward to user's DM with category selection
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔍 ISO Request Received!')
        .setDescription(`I noticed you're looking for something! To help organize your request, please select a category:`)
        .addFields([
          {
            name: '📝 Your Request',
            value: content,
            inline: false
          },
          {
            name: '📂 Next Step',
            value: 'Choose the best category for your item below:',
            inline: false
          }
        ])
        .setFooter({ text: 'This message will help organize your request in the forum' });
      
      // Create category buttons
      const categoryRows = createCategoryButtons();
      
      // Create fulfilled button
      const fulfilledButton = new ButtonBuilder()
        .setCustomId('mark_fulfilled')
        .setLabel('Mark as Fulfilled')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');
      
      // Create button rows
      const categoryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(defaultButtons);
      const fulfillRow = new ActionRowBuilder<ButtonBuilder>().addComponents(fulfilledButton);
      
      // Forward to DM with buttons
      try {
        const dmChannel = await message.author.createDM();
        
        await dmChannel.send({
          embeds: [embed],
          components: [...categoryRows, fulfillRow]
        });
        
        // React to original message to confirm receipt
        await message.react('👍');
        
        log(`Forwarded ISO request to DM for ${message.author.username}`, "discord-bot");
        
      } catch (dmError) {
        log(`Could not send DM to ${message.author.username}: ${dmError}`, "discord-bot");
        
        // If DM fails, react with different emoji
        await message.react('❌');
      }
    }
    
  } catch (error) {
    log(`Error in handleIsoRequest: ${error}`, "discord-bot");
  }
}

// Handle action selection (updated or new post)
async function handleActionSelection(interaction: any, selectedAction: string): Promise<void> {
  log(`User ${interaction.user.username} selected action: ${selectedAction}`, "discord-bot");
  
  if (selectedAction === 'new_post') {
    // User wants to create a new post - show category selection
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('📂 Select Category')
      .setDescription('Choose the category that best fits your item:');
    
    const categoryRows = createCategoryButtons();
    
    await interaction.update({
      embeds: [embed],
      components: categoryRows
    });
  } else if (selectedAction === 'update_existing') {
    // User wants to update an existing post
    await handleUpdatePostSelection(interaction, '');
  }
}

// Handle category modal selection
async function handleCategoryModalSelection(interaction: any, selectedCategory: string): Promise<void> {
  log(`User ${interaction.user.username} selected category: ${selectedCategory}`, "discord-bot");
  
  const categoryNames: { [key: string]: string } = {
    electronics: "Electronics",
    home_furniture: "Home & Furniture", 
    clothing: "Clothing",
    accessories: "Accessories",
    footwear: "Footwear",
    misc: "Miscellaneous"
  };
  
  const categoryName = categoryNames[selectedCategory] || selectedCategory;
  
  // Create and show modal for item details
  const modal = new ModalBuilder()
    .setCustomId(`item_modal_${selectedCategory}`)
    .setTitle(`New ${categoryName} Request`);
  
  const itemInput = new TextInputBuilder()
    .setCustomId('item_description')
    .setLabel('What are you looking for?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe the item you need in detail...')
    .setRequired(true)
    .setMaxLength(1000);
  
  const locationInput = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Your general location (optional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., Downtown Toronto, North York, etc.')
    .setRequired(false)
    .setMaxLength(100);
  
  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(itemInput);
  const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput);
  
  modal.addComponents(firstActionRow, secondActionRow);
  
  await interaction.showModal(modal);
}

// Handle contact selection
async function handleContactSelection(interaction: any, contactType: string, isAnonymous: boolean): Promise<void> {
  log(`User ${interaction.user.username} initiating ${isAnonymous ? 'anonymous' : 'regular'} contact: ${contactType}`, "discord-bot");
  
  // Create modal for contact message
  const modal = new ModalBuilder()
    .setCustomId(`contact_modal_${contactType}_${isAnonymous ? 'anon' : 'regular'}`)
    .setTitle(isAnonymous ? 'Anonymous Contact' : 'Contact Moderators');
  
  const messageInput = new TextInputBuilder()
    .setCustomId('contact_message')
    .setLabel('Your message')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Please describe your question, concern, or feedback...')
    .setRequired(true)
    .setMaxLength(2000);
  
  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);
  modal.addComponents(actionRow);
  
  await interaction.showModal(modal);
}

// Handle contact modal submission
async function handleContactModalSubmission(interaction: any): Promise<void> {
  const customId = interaction.customId;
  const [, , contactType, anonymityType] = customId.split('_');
  const isAnonymous = anonymityType === 'anon';
  
  const message = interaction.fields.getTextInputValue('contact_message');
  
  log(`Processing ${isAnonymous ? 'anonymous' : 'regular'} contact submission from ${interaction.user.username}`, "discord-bot");
  
  try {
    // Find the moderator-contact forum channel
    const guild = interaction.guild;
    const contactChannel = guild.channels.cache.find((ch: any) => 
      ch.name === 'moderator-contact' && ch.type === ChannelType.GuildForum
    ) as ForumChannel;
    
    if (!contactChannel) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ Contact forum channel not found. Please contact a moderator directly."
      );
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#ff9900')
      .setTitle(isAnonymous ? '📪 Anonymous Contact' : '📬 Contact Request')
      .setDescription(message)
      .setTimestamp();
    
    if (!isAnonymous) {
      embed.setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL({ extension: 'png' })
      });
    } else {
      embed.setAuthor({
        name: 'Anonymous User',
        iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png'
      });
    }
    
    // Create forum post
    const thread = await contactChannel.threads.create({
      name: isAnonymous ? 
        `Anonymous Contact - ${new Date().toLocaleDateString()}` : 
        `Contact from ${interaction.user.username}`,
      message: { embeds: [embed] }
    });
    
    // Auto-follow the thread if not anonymous
    if (!isAnonymous) {
      try {
        await thread.members.add(interaction.user.id);
        log(`Auto-follow enabled for ${interaction.user.username} on thread ${thread.id}`, "discord-bot");
      } catch (followError) {
        log(`Could not auto-follow thread for ${interaction.user.username}: ${followError}`, "discord-bot");
      }
    }
    
    await sendEphemeralWithAutoDelete(interaction, 
      `✅ Your ${isAnonymous ? 'anonymous ' : ''}message has been sent to the moderators. ${!isAnonymous ? 'You will be notified of any responses.' : ''}`
    );
    
  } catch (error) {
    log(`Error creating contact post: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error sending your message. Please try again later."
    );
  }
}

// Handle modal submission
async function handleModalSubmission(interaction: any): Promise<void> {
  const customId = interaction.customId;
  
  if (customId.startsWith('contact_modal_')) {
    await handleContactModalSubmission(interaction);
    return;
  }
  
  if (customId.startsWith('claim_modal_')) {
    await handleClaimModalSubmission(interaction);
    return;
  }
  
  if (!customId.startsWith('item_modal_')) {
    log(`Unknown modal submission: ${customId}`, "discord-bot");
    return;
  }
  
  const category = customId.replace('item_modal_', '');
  const itemDescription = interaction.fields.getTextInputValue('item_description');
  const location = interaction.fields.getTextInputValue('location') || 'Not specified';
  
  log(`Processing modal submission for category: ${category}`, "discord-bot");
  
  try {
    // Get the user's original ISO message content for AI analysis
    let username = interaction.user.username;
    let messageContent = `ISO ${itemDescription}`;
    
    // Use AI to analyze and get structured information
    let analysisResult;
    try {
      analysisResult = await analyzeISORequest(username, messageContent);
      log(`AI analysis result: ${JSON.stringify(analysisResult)}`, "discord-bot");
    } catch (aiError) {
      log(`AI analysis failed: ${aiError}`, "discord-bot");
      // Fallback to basic extraction
      analysisResult = {
        itemName: await extractItemName(messageContent).catch(() => "Item"),
        category: category,
        exchangeType: "request",
        location: location,
        description: itemDescription
      };
    }
    
    // Create forum post
    await createForumPost({
      title: `Request: ${analysisResult.itemName}`,
      description: itemDescription,
      category: analysisResult.category,
      type: analysisResult.exchangeType,
      location: location,
      image_url: null,
      username: username,
      user_id: interaction.user.id,
      lat: null,
      lng: null
    });
    
    await sendEphemeralWithAutoDelete(interaction, 
      `✅ Your ISO request for **${analysisResult.itemName}** has been posted to the forum!`
    );
    
  } catch (error) {
    log(`Error creating forum post: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error creating your post. Please try again later."
    );
  }
}

// Handle category selection (for new posts or updates)
async function handleCategorySelection(
  interaction: ButtonInteraction | StringSelectMenuInteraction, 
  selectedCategory: string
): Promise<void> {
  // Check if this is for updating an existing post or creating a new one
  // For now, we'll assume it's for creating a new post
  await handleCategoryModalSelection(interaction, selectedCategory);
}

// Handle fulfill request
async function handleFulfillRequest(interaction: any): Promise<void> {
  log(`User ${interaction.user.username} clicked fulfill button`, "discord-bot");
  
  await sendEphemeralWithAutoDelete(interaction, 
    "✅ Great! Your request has been marked as fulfilled. The post will be archived automatically."
  );
}

// Main interaction handler
async function handleInteraction(interaction: Interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      const customId = interaction.customId;
      
      log(`Button interaction: ${customId} from ${interaction.user.username}`, "discord-bot");
      
      if (customId.startsWith('category_')) {
        const category = customId.replace('category_', '');
        await handleCategorySelection(interaction, category);
      } else if (customId === 'mark_fulfilled') {
        await handleFulfillRequest(interaction);
      } else if (customId.startsWith('action_')) {
        const action = customId.replace('action_', '');
        await handleActionSelection(interaction, action);
      } else if (customId.startsWith('updatepost_')) {
        const threadId = customId.replace('updatepost_', '');
        await handleUpdatePostSelection(interaction, threadId);
      } else if (customId.startsWith('claim_')) {
        const threadId = customId.replace('claim_', '');
        await handleMarkAsClaimed(interaction, threadId);
      } else if (customId.startsWith('available_')) {
        const threadId = customId.replace('available_', '');
        await handleStillAvailable(interaction, threadId);
      } else {
        log(`Unknown button interaction: ${customId}`, "discord-bot");
      }
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmission(interaction);
    } else if (interaction.isStringSelectMenu()) {
      // Handle select menu interactions
      const customId = interaction.customId;
      const selectedValue = interaction.values[0];
      
      log(`Select menu interaction: ${customId}, selected: ${selectedValue}`, "discord-bot");
      
      if (customId === 'post_selection') {
        await handleUpdatePostSelection(interaction, selectedValue);
      } else {
        log(`Unknown select menu interaction: ${customId}`, "discord-bot");
      }
    }
  } catch (error) {
    log(`Error in handleInteraction: ${error}`, "discord-bot");
    
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await sendEphemeralWithAutoDelete(interaction, 
          "❌ Sorry, there was an error processing your request. Please try again later."
        );
      }
    } catch (replyError) {
      log(`Error sending error reply: ${replyError}`, "discord-bot");
    }
  }
}

// Export function to process commands programmatically
export async function processCommand(command: string) {
  try {
    log(`Processing programmatic command: ${command}`, "discord-bot");
    
    switch (command) {
      case 'ping':
        return { success: true, message: 'Pong!' };
      case 'status':
        return await getBotStatus();
      case 'restart':
        return await restartBot();
      default:
        return { success: false, message: `Unknown command: ${command}` };
    }
  } catch (error) {
    log(`Error processing command: ${error}`, "discord-bot");
    return { success: false, error: `${error}` };
  }
}

// Export function to get bot status
export async function getBotStatus() {
  try {
    const isOnline = bot?.isReady() || false;
    const connectionTime = connectionStartTime ? calculateUptime(connectionStartTime) : "Unknown";
    const processTime = calculateUptime(processStartTime);
    
    return {
      status: isOnline ? "online" : "offline",
      uptime: connectionTime,
      processUptime: processTime,
      processedCommands: commandsProcessed,
      lastActivity: new Date(lastMessageTimestamp).toISOString(),
      guilds: bot?.guilds.cache.size || 0,
      users: bot?.users.cache.size || 0
    };
  } catch (error) {
    return { success: false, error: `${error}` };
  }
}

// Export function to update bot configuration
export async function updateBotConfig(newConfig: { webhookUrl?: string; token?: string }) {
  try {
    log(`Updating bot configuration`, "discord-bot");
    
    const currentConfig = await storage.getBotConfig();
    const updatedConfig = {
      ...currentConfig,
      ...newConfig,
      createdAt: currentConfig?.createdAt || new Date()
    };
    
    await storage.updateBotConfig(updatedConfig);
    
    // If token was updated and bot is running, restart it
    if (newConfig.token && bot) {
      log("Token updated, restarting bot...", "discord-bot");
      await restartBot();
    }
    
    return { success: true, message: "Configuration updated successfully" };
  } catch (error) {
    log(`Error updating bot configuration: ${error}`, "discord-bot");
    return { success: false, error: `${error}` };
  }
}

// Export function to restart bot
export async function restartBot() {
  try {
    log("Restarting bot...", "discord-bot");
    
    // Clear intervals
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
    
    if (autoBumpInterval) {
      clearInterval(autoBumpInterval);
      autoBumpInterval = null;
    }
    
    // Disconnect current bot
    if (bot) {
      await bot.destroy();
      bot = null;
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reinitialize
    await initializeBot();
    
    return { success: true, message: "Bot restarted successfully" };
  } catch (error) {
    log(`Error restarting bot: ${error}`, "discord-bot");
    return { success: false, error: `${error}` };
  }
}

// Function to ensure category channels exist
export async function ensureCategoryChannels() {
  try {
    if (!bot || !bot.isReady()) {
      log("Bot not ready, skipping category channel creation", "discord-bot");
      return { success: false, error: "Bot not ready" };
    }

    const guild = bot.guilds.cache.first();
    if (!guild) {
      log("No guild found", "discord-bot");
      return { success: false, error: "No guild found" };
    }

    const categories = [
      'electronics',
      'home-furniture', 
      'clothing',
      'accessories',
      'footwear',
      'miscellaneous'
    ];

    let channelsCreated = 0;

    for (const categoryName of categories) {
      const existingChannel = guild.channels.cache.find((ch: any) => 
        ch.name === categoryName && ch.type === ChannelType.GuildText
      );

      if (!existingChannel) {
        try {
          await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildText,
            topic: `Exchange requests for ${categoryName.replace('-', ' ')} items`
          });
          
          channelsCreated++;
          log(`Created channel: ${categoryName}`, "discord-bot");
        } catch (channelError) {
          log(`Error creating channel ${categoryName}: ${channelError}`, "discord-bot");
        }
      }
    }

    return { 
      success: true, 
      message: `Category channels verified. Created ${channelsCreated} new channels.` 
    };
  } catch (error) {
    log(`Error in ensureCategoryChannels: ${error}`, "discord-bot");
    return { success: false, error: `${error}` };
  }
}

// Process ISO request with proper isolation and error handling
async function processISORequest(message: Message): Promise<void> {
  // Double check - we should only process ISO messages
  if (!message.content.trim().startsWith("ISO")) {
    return;
  }

  const username = message.author.username;
  const messageContent = message.content;
  
  log(`Processing ISO request from ${username}: ${messageContent.substring(0, 100)}...`, "discord-bot");
  
  try {
    // Store the original ISO request
    const isoRequest: InsertISORequest = {
      userId: message.author.id,
      username: username,
      guildId: message.guild?.id || '',
      channelId: message.channel.id,
      messageId: message.id,
      originalMessage: messageContent,
      processed: false
    };
    
    await storage.createISORequest(isoRequest);
    log(`Stored ISO request in database for ${username}`, "discord-bot");
    
    // Attempt to analyze the ISO request with OpenAI
    let analysisResult;
    try {
      analysisResult = await analyzeISORequest(username, messageContent);
      log(`OpenAI analysis successful for ${username}`, "discord-bot");
    } catch (aiError) {
      log(`OpenAI analysis failed for ${username}: ${aiError}`, "discord-bot");
      
      // Fallback: Extract item name using pattern matching
      const itemName = await extractItemName(messageContent);
      analysisResult = {
        itemName: itemName,
        category: "misc", // Default category
        exchangeType: "request", // Default type
        location: "Not specified",
        description: messageContent.replace(/^ISO\s*/i, '').trim()
      };
      log(`Using fallback analysis for ${username}: ${JSON.stringify(analysisResult)}`, "discord-bot");
    }
    
    // Create forum post with the analysis
    await createForumPost({
      title: `Request: ${analysisResult.itemName}`,
      description: analysisResult.description,
      category: analysisResult.category,
      type: analysisResult.exchangeType,
      location: analysisResult.location,
      image_url: null,
      username: username,
      user_id: message.author.id,
      lat: null,
      lng: null
    });
    
    // Mark the ISO request as processed
    await storage.updateISORequest(message.id, { processed: true });
    
    // React to the original message to show it was processed
    await message.react('✅');
    
    log(`Successfully processed ISO request from ${username}`, "discord-bot");
    
  } catch (error) {
    log(`Error processing ISO request from ${username}: ${error}`, "discord-bot");
    
    try {
      // React with error emoji
      await message.react('❌');
    } catch (reactError) {
      log(`Could not react to message: ${reactError}`, "discord-bot");
    }
  }
}

// Health check function
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
  try {
    log("Attempting to reconnect bot...", "discord-bot");
    
    if (bot) {
      await bot.destroy();
    }
    
    await initializeBot();
    log("Bot reconnection successful", "discord-bot");
    
    healthCheckFailures = 0;
  } catch (error) {
    log(`Bot reconnection failed: ${error}`, "discord-bot");
  }
}

// Helper function to calculate uptime
function calculateUptime(startTime: Date): string {
  const uptime = Date.now() - startTime.getTime();
  const minutes = Math.floor(uptime / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} days, ${hours % 24} hours`;
  } else if (hours > 0) {
    return `${hours} hours, ${minutes % 60} minutes`;
  } else if (minutes > 0) {
    return `${minutes} minutes`;
  } else {
    return "Just started";
  }
}

// Helper function to send ephemeral messages with auto-delete
async function sendEphemeralWithAutoDelete(interaction: any, content: string | { content?: string; embeds?: any[]; components?: any[] }, deleteAfterSeconds: number = 120) {
  try {
    let response;
    
    if (typeof content === 'string') {
      response = await interaction.reply({
        content,
        ephemeral: true
      });
    } else {
      response = await interaction.reply({
        ...content,
        ephemeral: true
      });
    }
    
    // Schedule deletion after specified time (default 2 minutes)
    setTimeout(async () => {
      try {
        if (response && typeof response.delete === 'function') {
          await response.delete();
          log(`Auto-deleted ephemeral message after ${deleteAfterSeconds}s`, "discord-bot");
        }
      } catch (deleteError) {
        // Ephemeral messages may not be deletable in some cases - this is expected
        log(`Could not delete ephemeral message (may have expired): ${deleteError}`, "discord-bot");
      }
    }, deleteAfterSeconds * 1000);
    
    return response;
  } catch (error) {
    log(`Error sending ephemeral message: ${error}`, "discord-bot");
    throw error;
  }
}

// Initialize bot configuration
export async function initializeBotConfig() {
  try {
    const config = await storage.getBotConfig();
    if (!config) {
      log("No bot configuration found, please set up the bot token", "discord-bot");
      return;
    }
    
    if (!config.token || !isValidDiscordToken(config.token)) {
      log("Invalid or missing Discord bot token", "discord-bot");
      return;
    }
    
    log("Bot configuration initialized", "discord-bot");
  } catch (error) {
    log(`Error initializing bot configuration: ${error}`, "discord-bot");
  }
}

// Add default channels if none exist
async function addDefaultChannels() {
  try {
    const channels = await storage.getAllowedChannels();
    if (channels.length === 0) {
      log("No allowed channels found, will rely on runtime discovery", "discord-bot");
    }
  } catch (error) {
    log(`Error checking allowed channels: ${error}`, "discord-bot");
  }
}

// Validate Discord token format
function isValidDiscordToken(token: string): boolean {
  // Basic Discord token validation
  return token.length > 20 && /^[A-Za-z0-9._-]+$/.test(token);
}

// Handle update post selection
async function handleUpdatePostSelection(interaction: any, threadId: string): Promise<void> {
  log(`Handling update post selection for thread: ${threadId}`, "discord-bot");
  
  try {
    // Get user's active forum posts
    const userPosts = await storage.getActiveForumPostsByUserId(interaction.user.id);
    
    if (userPosts.length === 0) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ You don't have any active posts to update."
      );
      return;
    }
    
    // Filter out deleted posts by checking if threads still exist
    const validPosts = [];
    for (const post of userPosts) {
      try {
        const thread = await interaction.guild.channels.fetch(post.threadId);
        if (thread) {
          validPosts.push(post);
        }
      } catch (error) {
        // Thread doesn't exist anymore, skip it
        log(`Thread ${post.threadId} no longer exists, filtering out`, "discord-bot");
      }
    }
    
    if (validPosts.length === 0) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ You don't have any active posts to update. Your previous posts may have been deleted."
      );
      return;
    }
    
    if (threadId) {
      // Specific thread selected, show action options
      const post = validPosts.find(p => p.threadId === threadId);
      if (!post) {
        await sendEphemeralWithAutoDelete(interaction, 
          "❌ Post not found or you don't have permission to update it."
        );
        return;
      }
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📝 Update Your Post')
        .setDescription(`**${post.title}**\n\n${post.description?.substring(0, 200)}${post.description && post.description.length > 200 ? '...' : ''}`)
        .addFields([
          { name: 'Category', value: post.category, inline: true },
          { name: 'Type', value: post.exchangeType, inline: true },
          { name: 'Created', value: `<t:${Math.floor(post.createdAt.getTime() / 1000)}:R>`, inline: true }
        ]);
      
      const claimButton = new ButtonBuilder()
        .setCustomId(`claim_${threadId}`)
        .setLabel('Mark as Claimed')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');
      
      const availableButton = new ButtonBuilder()
        .setCustomId(`available_${threadId}`)
        .setLabel('Still Available')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄');
      
      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(claimButton, availableButton);
      
      await sendEphemeralWithAutoDelete(interaction, {
        embeds: [embed],
        components: [actionRow]
      });
    } else {
      // No specific thread, show selection menu
      const options = validPosts.slice(0, 25).map(post => ({
        label: post.title.length > 100 ? post.title.substring(0, 97) + '...' : post.title,
        value: post.threadId,
        description: `${post.category} • ${post.exchangeType} • ${post.createdAt.toLocaleDateString()}`
      }));
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('post_selection')
        .setPlaceholder('Select a post to update...')
        .addOptions(options);
      
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📝 Select Post to Update')
        .setDescription(`You have ${validPosts.length} active post${validPosts.length === 1 ? '' : 's'}. Select one to update:`);
      
      await sendEphemeralWithAutoDelete(interaction, {
        embeds: [embed],
        components: [row]
      });
    }
  } catch (error) {
    log(`Error in handleUpdatePostSelection: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error loading your posts. Please try again later."
    );
  }
}

// Handle mark as claimed
async function handleMarkAsClaimed(interaction: any, threadId: string): Promise<void> {
  log(`User ${interaction.user.username} marking post ${threadId} as claimed`, "discord-bot");
  
  try {
    // Get the forum post
    const post = await storage.getForumPostByThreadId(threadId);
    if (!post || post.originalPosterId !== interaction.user.id) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ You can only update your own posts."
      );
      return;
    }
    
    // Create modal for claiming details
    const modal = new ModalBuilder()
      .setCustomId(`claim_modal_${threadId}`)
      .setTitle('Mark as Claimed');
    
    const traderInput = new TextInputBuilder()
      .setCustomId('traded_with')
      .setLabel('Who are you trading/traded with?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter their Discord username or @mention')
      .setRequired(true)
      .setMaxLength(100);
    
    const notesInput = new TextInputBuilder()
      .setCustomId('trade_notes')
      .setLabel('Additional notes (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Any additional details about the trade...')
      .setRequired(false)
      .setMaxLength(500);
    
    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(traderInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput);
    
    modal.addComponents(firstRow, secondRow);
    
    await interaction.showModal(modal);
    
  } catch (error) {
    log(`Error in handleMarkAsClaimed: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error processing your request. Please try again later."
    );
  }
}

// Handle still available
async function handleStillAvailable(interaction: any, threadId: string): Promise<void> {
  log(`User ${interaction.user.username} marking post ${threadId} as still available`, "discord-bot");
  
  try {
    // Get the forum post
    const post = await storage.getForumPostByThreadId(threadId);
    if (!post || post.originalPosterId !== interaction.user.id) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ You can only update your own posts."
      );
      return;
    }
    
    // Update the forum post to bump it
    await storage.updateForumPost(threadId, {
      lastBumpedAt: new Date()
    });
    
    // Get the thread and bump it
    const thread = await interaction.guild.channels.fetch(threadId);
    if (thread && thread.isThread()) {
      await thread.send("🔄 **Still Available** - This item is still available for exchange!");
    }
    
    await sendEphemeralWithAutoDelete(interaction, 
      "✅ Your post has been bumped and marked as still available!"
    );
    
  } catch (error) {
    log(`Error in handleStillAvailable: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error bumping your post. Please try again later."
    );
  }
}

// Handle claim modal submission
async function handleClaimModalSubmission(interaction: any): Promise<void> {
  const threadId = interaction.customId.replace('claim_modal_', '');
  const tradedWith = interaction.fields.getTextInputValue('traded_with');
  const notes = interaction.fields.getTextInputValue('trade_notes') || '';
  
  log(`Processing claim completion for thread ${threadId}, traded with: ${tradedWith}`, "discord-bot");
  
  try {
    // Get the forum post
    const post = await storage.getForumPostByThreadId(threadId);
    if (!post || post.originalPosterId !== interaction.user.id) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ You can only update your own posts."
      );
      return;
    }
    
    // Create a pending claim that needs confirmation
    await storage.createPendingClaim({
      threadId,
      originalPosterId: interaction.user.id,
      originalPosterUsername: interaction.user.username,
      tradingPartnerUsername: tradedWith.replace(/[@<>!]/g, ''), // Clean up mentions
      notes,
      createdAt: new Date()
    });
    
    await sendEphemeralWithAutoDelete(interaction, 
      `✅ Claim submitted! Please have **${tradedWith}** confirm the trade by mentioning you in this channel, or use the \`/markfulfilled\` command for immediate completion.`
    );
    
  } catch (error) {
    log(`Error in handleClaimModalSubmission: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error processing your claim. Please try again later."
    );
  }
}

// Process pending claim completion
async function processPendingClaimCompletion(pendingClaim: any, originalPoster: any, tradingPartner: any, message: any): Promise<void> {
  try {
    log(`Processing claim completion: ${originalPoster.username} <-> ${tradingPartner.username}`, "discord-bot");
    
    // Get the forum post
    const post = await storage.getForumPostByThreadId(pendingClaim.threadId);
    if (!post) {
      log(`Forum post not found for thread ${pendingClaim.threadId}`, "discord-bot");
      return;
    }
    
    // Create confirmed exchange record
    const exchange: InsertConfirmedExchange = {
      guildId: message.guild.id,
      threadId: pendingClaim.threadId,
      category: post.category,
      originalPosterId: originalPoster.id,
      originalPosterUsername: originalPoster.username,
      tradingPartnerId: tradingPartner.id,
      tradingPartnerUsername: tradingPartner.username,
      itemDescription: post.description || post.title,
      exchangeType: post.exchangeType,
      confirmedAt: new Date()
    };
    
    await storage.createConfirmedExchange(exchange);
    
    // Mark forum post as completed
    await storage.updateForumPost(pendingClaim.threadId, {
      status: 'completed',
      completedAt: new Date()
    });
    
    // Archive the thread
    const thread = await message.guild.channels.fetch(pendingClaim.threadId);
    if (thread && thread.isThread()) {
      await thread.setArchived(true);
      
      // Send completion message before archiving
      await thread.send({
        embeds: [new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('✅ Exchange Completed!')
          .setDescription(`**${originalPoster.username}** and **${tradingPartner.username}** have completed their exchange!`)
          .addFields([
            { name: 'Item', value: post.itemDescription || post.title, inline: true },
            { name: 'Category', value: post.category, inline: true },
            { name: 'Type', value: post.exchangeType, inline: true }
          ])
          .setTimestamp()
        ]
      });
    }
    
    // Remove the pending claim
    await storage.deletePendingClaim(pendingClaim.id);
    
    // React to the confirmation message
    await message.react('✅');
    
    log(`Exchange completed: ${exchange.itemDescription} between ${originalPoster.username} and ${tradingPartner.username}`, "discord-bot");
    
  } catch (error) {
    log(`Error processing pending claim completion: ${error}`, "discord-bot");
  }
}

// Handle mark fulfilled direct (new /markfulfilled command)
async function handleMarkFulfilledDirect(interaction: any, threadId: string, tradedWithUser: User): Promise<void> {
  log(`User ${interaction.user.username} using /markfulfilled with ${tradedWithUser.username}`, "discord-bot");
  
  try {
    // Get user's active forum posts
    const userPosts = await storage.getActiveForumPostsByUserId(interaction.user.id);
    
    if (userPosts.length === 0) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ You don't have any active posts to mark as fulfilled."
      );
      return;
    }
    
    // Filter out deleted posts by checking if threads still exist
    const validPosts = [];
    for (const post of userPosts) {
      try {
        const thread = await interaction.guild.channels.fetch(post.threadId);
        if (thread) {
          validPosts.push(post);
        }
      } catch (error) {
        log(`Thread ${post.threadId} no longer exists, filtering out`, "discord-bot");
      }
    }
    
    if (validPosts.length === 0) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ You don't have any active posts to mark as fulfilled. Your posts may have been deleted."
      );
      return;
    }
    
    if (validPosts.length === 1) {
      // Only one post, proceed directly
      const post = validPosts[0];
      
      // Create confirmed exchange record
      const exchange: InsertConfirmedExchange = {
        guildId: interaction.guild.id,
        threadId: post.threadId,
        category: post.category,
        originalPosterId: interaction.user.id,
        originalPosterUsername: interaction.user.username,
        tradingPartnerId: tradedWithUser.id,
        tradingPartnerUsername: tradedWithUser.username,
        itemDescription: post.description || post.title,
        exchangeType: post.exchangeType,
        confirmedAt: new Date()
      };
      
      await storage.createConfirmedExchange(exchange);
      
      // Mark forum post as completed
      await storage.updateForumPost(post.threadId, {
        status: 'completed',
        completedAt: new Date()
      });
      
      // Archive the thread
      try {
        const thread = await interaction.guild.channels.fetch(post.threadId);
        if (thread && thread.isThread()) {
          // Send completion message before archiving
          await thread.send({
            embeds: [new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('✅ Exchange Completed!')
              .setDescription(`**${interaction.user.username}** and **${tradedWithUser.username}** have completed their exchange!`)
              .addFields([
                { name: 'Item', value: post.description || post.title, inline: true },
                { name: 'Category', value: post.category, inline: true },
                { name: 'Type', value: post.exchangeType, inline: true }
              ])
              .setTimestamp()
            ]
          });
          
          await thread.setArchived(true);
        }
      } catch (threadError) {
        log(`Error archiving thread ${post.threadId}: ${threadError}`, "discord-bot");
      }
      
      await sendEphemeralWithAutoDelete(interaction, 
        `✅ **Exchange completed!** Your post "${post.title}" has been marked as fulfilled and archived. Trade recorded with ${tradedWithUser.username}.`
      );
      
      log(`Exchange completed: ${post.title} between ${interaction.user.username} and ${tradedWithUser.username}`, "discord-bot");
      
    } else {
      // Multiple posts, show selection menu
      const options = validPosts.slice(0, 25).map(post => ({
        label: post.title.length > 100 ? post.title.substring(0, 97) + '...' : post.title,
        value: `markfulfilled_${post.threadId}_${tradedWithUser.id}`,
        description: `${post.category} • ${post.exchangeType} • ${post.createdAt.toLocaleDateString()}`
      }));
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('markfulfilled_selection')
        .setPlaceholder('Select which post to mark as fulfilled...')
        .addOptions(options);
      
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📝 Select Post to Mark Fulfilled')
        .setDescription(`You have ${validPosts.length} active posts. Select which one you completed with **${tradedWithUser.username}**:`);
      
      await sendEphemeralWithAutoDelete(interaction, {
        embeds: [embed],
        components: [row]
      });
    }
    
  } catch (error) {
    log(`Error in handleMarkFulfilledDirect: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error processing your request. Please try again later."
    );
  }
}

// Auto-bump checking functions
async function checkAndBumpInactivePosts(): Promise<void> {
  try {
    if (!bot?.isReady()) return;
    
    log("Checking for posts to auto-bump...", "discord-bot");
    
    const posts = await storage.getAllActiveForumPosts();
    const now = new Date();
    const bumpThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    let bumped = 0;
    
    for (const post of posts) {
      const lastActivity = post.lastBumpedAt || post.createdAt;
      const timeSinceActivity = now.getTime() - lastActivity.getTime();
      
      if (timeSinceActivity >= bumpThreshold) {
        try {
          const guild = bot.guilds.cache.first();
          if (!guild) continue;
          
          const thread = await guild.channels.fetch(post.threadId);
          if (thread && thread.isThread() && !thread.archived) {
            await thread.send("🔔 **Auto-bump** - This post is still active and looking for exchanges!");
            
            await storage.updateForumPost(post.threadId, {
              lastBumpedAt: now
            });
            
            bumped++;
            log(`Auto-bumped post: ${post.title}`, "discord-bot");
          }
        } catch (error) {
          log(`Error bumping post ${post.threadId}: ${error}`, "discord-bot");
        }
      }
    }
    
    log(`Auto-bump check completed. Bumped ${bumped} posts.`, "discord-bot");
    
  } catch (error) {
    log(`Error in auto-bump check: ${error}`, "discord-bot");
  }
}

function startAutoBumpChecker(): void {
  if (autoBumpInterval) {
    clearInterval(autoBumpInterval);
  }
  
  // Check every hour
  autoBumpInterval = setInterval(checkAndBumpInactivePosts, 60 * 60 * 1000);
  log("Auto-bump checker started", "discord-bot");
}

function stopAutoBumpChecker(): void {
  if (autoBumpInterval) {
    clearInterval(autoBumpInterval);
    autoBumpInterval = null;
    log("Auto-bump checker stopped", "discord-bot");
  }
}

// Get neighborhood from coordinates using Nominatim
async function getNeighborhoodFromCoordinates(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=15&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'BNE-Bot/1.0 (Exchange location service)'
        }
      }
    );
    
    const data = await response.json();
    
    if (data && data.address) {
      // Try to get neighborhood/suburb, fall back to city
      const neighborhood = data.address.neighbourhood || 
                          data.address.suburb || 
                          data.address.city || 
                          data.address.town || 
                          data.address.village ||
                          'Unknown Location';
      
      const city = data.address.city || data.address.town || data.address.village || '';
      
      // Return neighborhood with city if different
      if (city && neighborhood !== city) {
        return `${neighborhood}, ${city}`;
      }
      
      return neighborhood;
    }
    
    return 'Unknown Location';
  } catch (error) {
    log(`Error getting neighborhood from coordinates: ${error}`, "discord-bot");
    return 'Unknown Location';
  }
}

// Create forum post (used by external form)
export async function createForumPost(postData: {
  title: string;
  description: string;
  category: string;
  type: string;
  image_url: string | null;
  location?: string | null;
  username?: string;
  user_id?: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  try {
    if (!bot?.isReady()) {
      throw new Error("Bot not ready");
    }

    const guild = bot.guilds.cache.first();
    if (!guild) {
      throw new Error("No guild found");
    }

    // Find the items-exchange forum channel
    const forumChannel = guild.channels.cache.find((ch: any) => 
      ch.name === 'items-exchange' && ch.type === ChannelType.GuildForum
    ) as ForumChannel;

    if (!forumChannel) {
      throw new Error("Forum channel 'items-exchange' not found");
    }

    // Get neighborhood from coordinates if provided
    let neighborhoodName = postData.location || 'Location not specified';
    if (postData.lat && postData.lng) {
      try {
        neighborhoodName = await getNeighborhoodFromCoordinates(postData.lat, postData.lng);
        log(`Reverse geocoding result for ${postData.lat},${postData.lng}: ${neighborhoodName}`, "discord-bot");
      } catch (geoError) {
        log(`Error getting neighborhood: ${geoError}`, "discord-bot");
      }
    }

    // Get available forum tags
    const availableTags = forumChannel.availableTags;
    log(`Found ${availableTags.length} available forum tags`, "discord-bot");
    
    // Log all available tags for debugging
    availableTags.forEach(tag => {
      log(`Processing forum tag: ${tag.name} (ID: ${tag.id})`, "discord-bot");
    });
    
    // Create category mapping
    const categoryTagMap: { [key: string]: string } = {};
    const typeTagMap: { [key: string]: string } = {};
    
    availableTags.forEach(tag => {
      const tagName = tag.name.toLowerCase().replace(/\s+/g, '_');
      
      // Category tags
      if (['electronics', 'home_furniture', 'misc', 'clothing', 'accessories', 'footwear'].includes(tagName)) {
        categoryTagMap[tagName] = tag.id;
      }
      
      // Type tags
      if (['trade', 'request', 'give'].includes(tagName)) {
        typeTagMap[tagName] = tag.id;
      }
    });
    
    log(`Category tags mapped: ${JSON.stringify(categoryTagMap)}`, "discord-bot");
    log(`Type tags mapped: ${JSON.stringify(typeTagMap)}`, "discord-bot");
    
    // Find matching tags
    const tags: string[] = [];
    
    // Add category tag
    const categoryKey = postData.category.toLowerCase().replace(/\s+/g, '_').replace(/&/g, '');
    if (categoryTagMap[categoryKey]) {
      tags.push(categoryTagMap[categoryKey]);
    }
    
    // Add type tag
    const typeKey = postData.type.toLowerCase();
    if (typeTagMap[typeKey]) {
      tags.push(typeTagMap[typeKey]);
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle(postData.title)
      .setDescription(postData.description)
      .addFields([
        { name: '📂 Category', value: postData.category, inline: true },
        { name: '🔄 Type', value: postData.type === 'give' ? 'Offer' : postData.type.charAt(0).toUpperCase() + postData.type.slice(1), inline: true },
        { name: '📍 Location', value: `[${neighborhoodName}](https://www.google.com/maps/search/${encodeURIComponent(neighborhoodName)},+Toronto/@43.6532,-79.3832,15z)`, inline: true }
      ])
      .setTimestamp();

    // Add user info if provided
    if (postData.username) {
      embed.setAuthor({
        name: postData.username,
        iconURL: postData.user_id ? 
          `https://cdn.discordapp.com/avatars/${postData.user_id}/avatar.png` : 
          undefined
      });
    }

    // Add image if provided
    if (postData.image_url) {
      embed.setImage(postData.image_url);
    }

    // Create the forum post
    const messageData: any = {
      embeds: [embed]
    };

    const threadData: any = {
      name: postData.title,
      message: messageData
    };

    // Add tags if we found any
    if (tags.length > 0) {
      threadData.appliedTags = tags;
    }

    const thread = await forumChannel.threads.create(threadData);

    // Auto-follow the thread if user_id is provided
    if (postData.user_id) {
      try {
        await thread.members.add(postData.user_id);
        log(`Auto-follow enabled for ${postData.username} on thread ${thread.id}`, "discord-bot");
      } catch (followError) {
        log(`Could not auto-follow thread for ${postData.username}: ${followError}`, "discord-bot");
      }
    }

    // Store in database
    const forumPost: InsertForumPost = {
      threadId: thread.id,
      guildId: guild.id,
      channelId: forumChannel.id,
      title: postData.title,
      description: postData.description,
      category: postData.category,
      exchangeType: postData.type,
      originalPosterId: postData.user_id || 'external',
      originalPosterUsername: postData.username || 'External User',
      status: 'active',
      createdAt: new Date()
    };

    await storage.createForumPost(forumPost);

    log(`Created forum post via external form: ${postData.title} by ${postData.username}`, "discord-bot");

  } catch (error) {
    log(`Error creating forum post: ${error}`, "discord-bot");
    throw error;
  }
}

// Ko-fi donation processing
export async function processKofiDonation(donationData: InsertDonation): Promise<void> {
  try {
    log(`Processing Ko-fi donation: ${donationData.amount} from ${donationData.donorName}`, "discord-bot");
    
    // Store the donation
    await storage.createDonation(donationData);
    
    // Get the current donation goal
    const goal = await storage.getCurrentDonationGoal();
    if (!goal) {
      log("No active donation goal found", "discord-bot");
      return;
    }
    
    // Get total donations for this goal
    const totalDonations = await storage.getTotalDonationsForGoal(goal.id);
    const newTotal = totalDonations + donationData.amount;
    
    // Update progress message if it exists
    if (goal.channelId && goal.messageId) {
      await updateDonationProgressMessage(goal.channelId, goal.messageId, newTotal, goal.goalAmount);
    }
    
    log(`Updated donation progress: ${newTotal}/${goal.goalAmount} cents`, "discord-bot");
    
  } catch (error) {
    log(`Error processing Ko-fi donation: ${error}`, "discord-bot");
    throw error;
  }
}

// Update donation progress message
async function updateDonationProgressMessage(channelId: string, messageId: string, currentAmount: number, goalAmount: number): Promise<void> {
  try {
    if (!bot?.isReady()) return;
    
    const guild = bot.guilds.cache.first();
    if (!guild) return;
    
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;
    
    const message = await channel.messages.fetch(messageId);
    if (!message) return;
    
    const currentDollars = currentAmount / 100;
    const goalDollars = goalAmount / 100;
    const percentage = Math.min((currentAmount / goalAmount) * 100, 100);
    
    const progressBar = createProgressBar(percentage);
    
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('💰 Donation Goal Progress')
      .setDescription(`**$${currentDollars.toFixed(2)} / $${goalDollars.toFixed(2)}** (${percentage.toFixed(1)}%)`)
      .addFields([
        { name: '📊 Progress', value: progressBar, inline: false },
        { name: '🎯 Goal', value: `$${goalDollars.toFixed(2)}`, inline: true },
        { name: '💵 Current', value: `$${currentDollars.toFixed(2)}`, inline: true },
        { name: '📈 Remaining', value: `$${Math.max(0, goalDollars - currentDollars).toFixed(2)}`, inline: true }
      ])
      .setFooter({ text: 'Thank you for your support!' })
      .setTimestamp();
    
    await message.edit({ embeds: [embed] });
    
  } catch (error) {
    log(`Error updating donation progress message: ${error}`, "discord-bot");
  }
}

// Create progress bar
function createProgressBar(percent: number): string {
  const totalBars = 20;
  const filledBars = Math.round((percent / 100) * totalBars);
  const emptyBars = totalBars - filledBars;
  
  return '🟩'.repeat(filledBars) + '⬜'.repeat(emptyBars);
}

// Handle donation commands
async function handleDonationCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check if we're in a donation channel
  const isDonateChannel = interaction.channel?.isTextBased() && 
    (interaction.channel as any).name?.toLowerCase().includes('donat');
  
  const embed = new EmbedBuilder()
    .setColor('#ff9900')
    .setTitle('💰 Support Our Community')
    .setDescription('Your donations help keep our exchange community running smoothly!')
    .addFields([
      { name: '🎯 Goal', value: 'Help cover server costs and community features', inline: false },
      { name: '💳 Donate', value: '[Click here to donate via Ko-fi](https://ko-fi.com/yourpage)', inline: false }
    ])
    .setFooter({ text: 'Every contribution helps! Thank you for your support.' });
  
  const donateButton = new ButtonBuilder()
    .setLabel('Donate Now')
    .setStyle(ButtonStyle.Link)
    .setURL('https://ko-fi.com/yourpage')
    .setEmoji('☕');
  
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(donateButton);
  
  if (isDonateChannel) {
    await sendEphemeralWithAutoDelete(interaction, {
      embeds: [embed],
      components: [row]
    });
  } else {
    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }
}

// Handle init goal command
async function handleInitGoal(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ You need Administrator permissions to initialize donation goals."
    );
    return;
  }
  
  const amount = interaction.options.getInteger('amount', true);
  
  if (amount <= 0) {
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Goal amount must be greater than 0."
    );
    return;
  }
  
  try {
    // Check if there's an existing active goal
    const existingGoal = await storage.getCurrentDonationGoal();
    if (existingGoal) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ There's already an active donation goal. Use `/resetgoal` first if you want to start over."
      );
      return;
    }
    
    // Create the initial progress message
    const goalDollars = amount;
    const goalCents = amount * 100;
    
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('💰 Donation Goal Progress')
      .setDescription(`**$0.00 / $${goalDollars.toFixed(2)}** (0%)`)
      .addFields([
        { name: '📊 Progress', value: createProgressBar(0), inline: false },
        { name: '🎯 Goal', value: `$${goalDollars.toFixed(2)}`, inline: true },
        { name: '💵 Current', value: '$0.00', inline: true },
        { name: '📈 Remaining', value: `$${goalDollars.toFixed(2)}`, inline: true }
      ])
      .setFooter({ text: 'Thank you for your support!' })
      .setTimestamp();
    
    const message = await interaction.reply({
      embeds: [embed],
      fetchReply: true
    });
    
    // Store the donation goal
    await storage.createDonationGoal({
      guildId: interaction.guildId!,
      channelId: interaction.channelId,
      messageId: message.id,
      goalAmount: goalCents,
      currentAmount: 0,
      isActive: true,
      createdAt: new Date()
    });
    
    log(`Created donation goal: $${goalDollars} in ${interaction.channel}`, "discord-bot");
    
  } catch (error) {
    log(`Error initializing donation goal: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error creating the donation goal. Please try again later."
    );
  }
}

// Handle reset goal command
async function handleResetGoal(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ You need Administrator permissions to reset donation goals."
    );
    return;
  }
  
  try {
    const goal = await storage.getCurrentDonationGoal();
    if (!goal) {
      await sendEphemeralWithAutoDelete(interaction, 
        "❌ No active donation goal found to reset."
      );
      return;
    }
    
    // Deactivate the current goal
    await storage.deactivateDonationGoal(goal.id);
    
    // Try to delete the progress message
    try {
      if (goal.channelId && goal.messageId) {
        const channel = await interaction.guild?.channels.fetch(goal.channelId);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(goal.messageId);
          await message.delete();
        }
      }
    } catch (deleteError) {
      log(`Could not delete progress message: ${deleteError}`, "discord-bot");
    }
    
    await sendEphemeralWithAutoDelete(interaction, 
      "✅ Donation goal has been reset. You can now create a new goal with `/initgoal`."
    );
    
    log("Donation goal reset by admin", "discord-bot");
    
  } catch (error) {
    log(`Error resetting donation goal: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error resetting the donation goal. Please try again later."
    );
  }
}

// Handle donate command
async function handleDonate(interaction: ChatInputCommandInteraction): Promise<void> {
  await handleDonationCommand(interaction);
}

// Handle test Ko-fi command
async function handleTestKofi(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ You need Administrator permissions to test Ko-fi integration."
    );
    return;
  }
  
  try {
    // Create a test donation
    const testDonation: InsertDonation = {
      kofiTransactionId: `test_${Date.now()}`,
      donorName: 'Test Donor',
      amount: 500, // $5.00 in cents
      message: 'This is a test donation from the /testkofi command',
      isPublic: true,
      createdAt: new Date()
    };
    
    await processKofiDonation(testDonation);
    
    await sendEphemeralWithAutoDelete(interaction, 
      "✅ Test donation processed successfully! Check the donation progress for updates."
    );
    
    log("Test Ko-fi donation processed via command", "discord-bot");
    
  } catch (error) {
    log(`Error processing test Ko-fi donation: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error processing the test donation. Please check the logs."
    );
  }
}

// Handle test auto bump command
async function handleTestAutoBump(interaction: ChatInputCommandInteraction): Promise<void> {
  // Check permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ You need Administrator permissions to test auto-bump."
    );
    return;
  }
  
  const forceTest = interaction.options.getBoolean('force', false);
  
  try {
    const posts = await storage.getAllActiveForumPosts();
    const autoBumpStatus = getAutoBumpStatus();
    
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🔧 Auto-Bump System Status')
      .addFields([
        { name: '📊 System Status', value: autoBumpStatus.enabled ? '✅ Running' : '❌ Stopped', inline: true },
        { name: '📝 Active Posts', value: `${posts.length} posts`, inline: true },
        { name: '⏰ Check Interval', value: '60 minutes', inline: true }
      ]);
    
    if (forceTest) {
      const testResults = await testBumpPosts(posts.slice(0, 3)); // Test on first 3 posts
      embed.addFields([
        { name: '🧪 Test Results', value: `Checked: ${testResults.checked}, Bumped: ${testResults.bumped}, Errors: ${testResults.errors}`, inline: false }
      ]);
    }
    
    await sendEphemeralWithAutoDelete(interaction, { embeds: [embed] });
    
  } catch (error) {
    log(`Error in test auto-bump: ${error}`, "discord-bot");
    await sendEphemeralWithAutoDelete(interaction, 
      "❌ Sorry, there was an error testing the auto-bump system."
    );
  }
}

// Get auto-bump status
function getAutoBumpStatus() {
  return {
    enabled: autoBumpInterval !== null,
    interval: '60 minutes',
    lastCheck: 'N/A' // Could be enhanced to track this
  };
}

// Test bump posts (limited version for testing)
async function testBumpPosts(posts: any[]): Promise<{checked: number, bumped: number, errors: number, archived: number}> {
  let checked = 0;
  let bumped = 0;
  let errors = 0;
  let archived = 0;
  
  for (const post of posts) {
    checked++;
    try {
      if (!bot?.isReady()) break;
      
      const guild = bot.guilds.cache.first();
      if (!guild) continue;
      
      const thread = await guild.channels.fetch(post.threadId);
      if (thread && thread.isThread()) {
        if (thread.archived) {
          archived++;
        } else {
          // For testing, we'll just send a test message instead of actually bumping
          await thread.send("🧪 **Test Auto-bump** - This is a test message and will be cleaned up automatically.");
          bumped++;
          
          // Clean up test message after a few seconds
          setTimeout(async () => {
            try {
              const messages = await thread.messages.fetch({ limit: 1 });
              const lastMessage = messages.first();
              if (lastMessage && lastMessage.content.includes('🧪 **Test Auto-bump**')) {
                await lastMessage.delete();
              }
            } catch (cleanupError) {
              log(`Error cleaning up test message: ${cleanupError}`, "discord-bot");
            }
          }, 5000);
        }
      }
    } catch (error) {
      errors++;
      log(`Error testing bump for post ${post.threadId}: ${error}`, "discord-bot");
    }
  }
  
  return { checked, bumped, errors, archived };
}

// Register slash commands
async function registerSlashCommands() {
  try {
    const config = await storage.getBotConfig();
    if (!config?.token) {
      throw new Error("Bot token not configured");
    }

    const rest = new REST({ version: '10' }).setToken(config.token);

    const commands = [
      new SlashCommandBuilder()
        .setName('exchange')
        .setDescription('Create a new exchange request via web form'),
      
      new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available bot commands'),
      
      new SlashCommandBuilder()
        .setName('markfulfilled')
        .setDescription('Mark your exchange as completed')
        .addUserOption(option =>
          option.setName('tradedwith')
            .setDescription('Who did you complete the exchange with?')
            .setRequired(true)),
      
      new SlashCommandBuilder()
        .setName('mystats')
        .setDescription('View your exchange statistics'),
      
      new SlashCommandBuilder()
        .setName('exchanges')
        .setDescription('View all confirmed exchanges (moderators only)'),
      
      new SlashCommandBuilder()
        .setName('contactus')
        .setDescription('Contact the moderators'),
      
      new SlashCommandBuilder()
        .setName('contactusanon')
        .setDescription('Contact the moderators anonymously'),
      
      new SlashCommandBuilder()
        .setName('initgoal')
        .setDescription('Initialize a donation goal (admin only)')
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Goal amount in dollars')
            .setRequired(true)
            .setMinValue(1)),
      
      new SlashCommandBuilder()
        .setName('resetgoal')
        .setDescription('Reset the current donation goal (admin only)'),
      
      new SlashCommandBuilder()
        .setName('donate')
        .setDescription('Get the donation link'),
      
      new SlashCommandBuilder()
        .setName('testkofi')
        .setDescription('Test Ko-fi webhook integration (admin only)'),
      
      new SlashCommandBuilder()
        .setName('testautobump')
        .setDescription('Test the auto-bump system (admin only)')
        .addBooleanOption(option =>
          option.setName('force')
            .setDescription('Force test bumping on sample posts')
            .setRequired(false))
    ];

    log('Started refreshing application (/) commands.', "discord-bot");
    log(`Total commands to register: ${commands.length}`, "discord-bot");
    log(`Commands: ${commands.map(cmd => cmd.name).join(', ')}`, "discord-bot");

    // Use guild-specific registration for immediate availability during development
    const guilds = bot?.guilds.cache;
    if (guilds) {
      for (const [guildId, guild] of guilds) {
        log(`Registering commands for guild: ${guild.name} (${guildId})`, "discord-bot");
        
        await rest.put(
          Routes.applicationGuildCommands(bot?.user?.id || '', guildId),
          { body: commands.map(cmd => cmd.toJSON()) }
        );
        
        log(`Successfully registered ${commands.length} commands for guild: ${guild.name}`, "discord-bot");
      }
    }
    
    // Clear any global commands to avoid duplicates
    await rest.put(
      Routes.applicationCommands(bot?.user?.id || ''),
      { body: [] }
    );

    log('Successfully reloaded guild-specific commands. Commands should appear immediately in Discord.', "discord-bot");
  } catch (error) {
    log(`Error registering slash commands: ${error}`, "discord-bot");
  }
}