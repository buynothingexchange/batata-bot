# BNE Bot Code Package for Batata Integration

This package contains all the core functionality that BNE Bot implements for ISO request management, which can be integrated into Batata.

## Core Features Implemented

1. **ISO Request Detection** - Detects formatted ISO requests from Batata
2. **Category Selection** - Interactive buttons for Electronics, Accessories, Clothing, Home & Furniture
3. **Cross-posting** - Posts categorized requests to appropriate channels
4. **Fulfillment Tracking** - "Mark as Fulfilled" functionality
5. **Archiving** - Archives fulfilled items to #archive channel
6. **DM Management** - Handles all button interactions via DMs only

## Key Files and Functions

### 1. Bot Configuration (bot.ts)

```typescript
import { Client, GatewayIntentBits, Partials } from "discord.js";

const createDiscordClient = (): Client => {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
      Partials.Channel,
      Partials.Message, 
      Partials.Reaction,
      Partials.User
    ]
  });
};
```

### 2. Event Handlers (events.ts)

```typescript
import { 
  Client, Events, Message, CommandInteraction, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  EmbedBuilder, MessageComponentInteraction,
  TextChannel, ButtonInteraction, ChannelType
} from "discord.js";

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

// Main event registration function
export function registerEvents(client: Client): void {
  client.on(Events.Ready, async () => {
    console.log(`Bot logged in as ${client.user?.tag}`);
  });

  // Message event - handles both server messages and DMs
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot && message.author.id === client.user?.id) return;
    
    console.log(`Received message from ${message.author.tag} in ${message.guild ? 'server' : 'DM'}`);
    
    // Check if this is a message from Batata Bot
    if (message.author.username === 'Batata') {
      console.log(`Checking if message is from Batata Bot: Yes`);
      console.log(`Message content: "${message.content}"`);
      console.log(`Message appears to be formatted ISO request: ${isFormattedIsoRequest(message)}`);
      
      if (isFormattedIsoRequest(message)) {
        console.log('Processing formatted ISO request from Batata Bot');
        await handleBatataIsoRequest(message);
      }
    } else {
      console.log(`Checking if message is from Batata Bot: No`);
      
      // Handle direct ISO posts in server
      if (message.guild && isDirectIsoRequest(message)) {
        console.log(`Detected direct ISO post in server by ${message.author.tag}`);
        console.log('Processing formatted ISO request from Batata Bot');
        await handleIsoRequest(message);
      }
    }
  });

  // Interaction event - for button clicks
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      console.log(`Received interaction: type=${interaction.type}, user=${interaction.user?.tag}`);
      
      if (interaction.isButton()) {
        const customId = interaction.customId;
        console.log(`Button interaction: ${customId} from ${interaction.user.tag}`);
        
        // Handle category selection
        if (customId.startsWith('category:')) {
          const categoryId = customId.split(':')[1];
          console.log(`Processing category selection: ${categoryId}`);
          await handleCategorySelection(interaction, categoryId);
        }
        
        // Handle fulfill item button
        if (customId === 'fulfill:item') {
          console.log(`Processing fulfill request`);
          await handleFulfillRequest(interaction);
        }
      }
    } catch (error) {
      console.error('Error handling interaction:', error);
    }
  });
}
```

### 3. ISO Request Handling Functions

```typescript
// Handle ISO request from Batata Bot message
async function handleBatataIsoRequest(message: Message): Promise<void> {
  try {
    // Extract user mention from message
    const mentionMatch = message.content.match(/<@(\d+)>/);
    if (!mentionMatch) return;
    
    const userId = mentionMatch[1];
    const mentionedUser = await message.client.users.fetch(userId);
    
    if (!mentionedUser) return;
    
    // Create ISO request record
    const isoRequest = {
      discordMessageId: message.id,
      userId: userId,
      username: mentionedUser.tag,
      content: message.content,
      timestamp: new Date()
    };
    
    const savedRequest = await storage.createIsoRequest(isoRequest);
    
    // Send DM to user with category buttons
    try {
      const dmChannel = await mentionedUser.createDM();
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
      
      console.log(`Sent category selection to user ${mentionedUser.tag}`);
    } catch (dmError) {
      console.error(`Failed to DM user ${mentionedUser.tag}: ${dmError}`);
    }
  } catch (error) {
    console.error(`Error handling Batata ISO request: ${error}`);
  }
}

// Handle category selection from button interaction
async function handleCategorySelection(
  interaction: ButtonInteraction, 
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
        channel.name.toLowerCase() === channelName.toLowerCase()
    );
    
    if (targetChannel && targetChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('ISO Request')
        .setDescription(isoRequest.content)
        .addFields(
          { name: 'Category', value: category?.label || categoryId, inline: true },
          { name: 'Requested by', value: isoRequest.username, inline: true }
        )
        .setTimestamp();
        
      await (targetChannel as TextChannel).send({
        embeds: [embed],
        components: [] // No buttons in public channels
      });
      
      await interaction.followUp({
        content: `Your request has been posted to the #${channelName} channel!`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(`Error handling category selection: ${error}`);
  }
}

// Handle fulfill button interaction
async function handleFulfillRequest(interaction: ButtonInteraction): Promise<void> {
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
        channel.name.toLowerCase() === 'archive'
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
        console.log(`Deleted cross-posted message from category channel`);
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
            content: `Great news! Your ISO request for "${isoRequest.content}" has been fulfilled by ${interaction.user.tag}.`,
            embeds: [embed]
          });
        }
      } catch (dmError) {
        console.error(`Failed to notify requester: ${dmError}`);
      }
    }
    
    await interaction.followUp({
      content: "Thank you for marking this item as fulfilled! It has been removed from the category channel, archived, and the requester has been notified.",
      ephemeral: true
    });
    
  } catch (error) {
    console.error('Error handling fulfill request:', error);
  }
}
```

### 4. Storage Schema (schema.ts)

```typescript
export const isoRequests = pgTable("iso_requests", {
  id: serial("id").primaryKey(),
  discordMessageId: varchar("discord_message_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }),
  isFulfilled: boolean("is_fulfilled").default(false),
  archivedMessageId: varchar("archived_message_id", { length: 255 }),
  timestamp: timestamp("timestamp").defaultNow().notNull()
});

export type IsoRequest = typeof isoRequests.$inferSelect;
export type InsertIsoRequest = typeof isoRequests.$inferInsert;
```

## Integration Instructions for Batata

1. **Add the intents and partials** to your Discord client configuration
2. **Import the event handlers** and register them with your existing client
3. **Add the storage schema** for ISO requests to your database
4. **Implement the button interaction handlers** in your existing event system
5. **Configure channel mappings** for your server's category channels
6. **Set up the archive channel** (#archive) for fulfilled items

## Key Behavior Notes

- **Buttons only appear in DMs** - No buttons are shown in public channels
- **Category selection and fulfillment buttons are separate messages** - This prevents buttons from disappearing when one is clicked
- **Cross-posted messages have no buttons** - Only the archived fulfilled items are shown in public channels
- **Automatic deletion** - Fulfilled items are removed from category channels and only kept in archive
- **User notifications** - Original requesters are notified via DM when their item is fulfilled

This implementation provides a complete ISO request management system that can be integrated into Batata's existing codebase.