import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildForumTagData,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ForumChannel,
} from "discord.js";
import type { Command } from "../interface/command.js";
import prisma from "../utils/prisma.js";

export default {
  data: new SlashCommandBuilder()
    .setName("exchange")
    .setDescription("Manage the exchange/marketplace system")
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Setup the exchange system (Admin only)")
        .addChannelOption((option) =>
          option
            .setName("forum")
            .setDescription("Forum channel for exchange posts")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildForum),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable the exchange system (Admin only)"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup-tags")
        .setDescription("Setup or update forum tags (Admin only)")
        .addChannelOption((option) =>
          option
            .setName("forum")
            .setDescription("Forum channel to update tags for")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildForum),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("post")
        .setDescription("Create a new exchange post")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("Title of your exchange post")
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Detailed description of your item/request")
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(2000),
        )
        .addStringOption((option) =>
          option
            .setName("category")
            .setDescription("Category of the item")
            .setRequired(true)
            .addChoices(
              { name: "Electronics", value: "ELECTRONICS" },
              { name: "Clothing", value: "CLOTHING" },
              { name: "Accessories", value: "ACCESSORIES" },
              { name: "Home & Furniture", value: "HOME_FURNITURE" },
              { name: "Footwear", value: "FOOTWEAR" },
              { name: "Miscellaneous", value: "MISC" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Type of exchange")
            .setRequired(true)
            .addChoices(
              { name: "Give Away", value: "GIVE" },
              { name: "Request", value: "REQUEST" },
              { name: "Trade", value: "TRADE" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("location")
            .setDescription("Location (Google Maps link)")
            .setRequired(true),
        )
        .addAttachmentOption((option) =>
          option
            .setName("image")
            .setDescription("Image of the item (optional)")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("update-post")
        .setDescription("Update your exchange post")
        .addStringOption((option) =>
          option
            .setName("thread_id")
            .setDescription(
              "Thread ID of the post to update (optional if used in the post's thread)",
            )
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("New title (optional)")
            .setRequired(false)
            .setMinLength(3)
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("New description (optional)")
            .setRequired(false)
            .setMinLength(10)
            .setMaxLength(2000),
        )
        .addStringOption((option) =>
          option
            .setName("location")
            .setDescription("New location (optional)")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("mark-fulfilled")
        .setDescription("Mark your exchange post as completed")
        .addStringOption((option) =>
          option
            .setName("thread_id")
            .setDescription(
              "Thread ID of the post to mark as fulfilled (optional if used in the post's thread)",
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list-posts")
        .setDescription("List your active exchange posts"),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return await interaction.reply({
        content: "❌ This command can only be used in a server!",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "setup":
          await handleSetup(interaction);
          break;
        case "disable":
          await handleDisable(interaction);
          break;
        case "post":
          await handlePost(interaction);
          break;
        case "update-post":
          await handleUpdatePost(interaction);
          break;
        case "mark-fulfilled":
          await handleMarkFulfilled(interaction);
          break;
        case "list-posts":
          await handleListPosts(interaction);
          break;
        case "setup-tags":
          await handleSetupTags(interaction);
          break;
        default:
          await interaction.reply({
            content: "❌ Unknown subcommand!",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("Error in exchange command:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ An error occurred while processing your request!",
          ephemeral: true,
        });
      }
    }
  },
} as Command;

async function handleSetup(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return await interaction.reply({
      content:
        "❌ You need the **Manage Server** permission to setup the exchange system!",
      ephemeral: true,
    });
  }

  const forumChannel = interaction.options.getChannel("forum", true);

  if (forumChannel.type !== ChannelType.GuildForum) {
    return await interaction.reply({
      content: "❌ Please select a forum channel!",
      ephemeral: true,
    });
  }

  try {
    const forumChannelTyped = forumChannel as ForumChannel;
    await setupForumTags(forumChannelTyped);

    await prisma.guild.upsert({
      where: { id: interaction.guild.id },
      update: {
        exchangeForumChannelId: forumChannel.id,
        exchangeEnabled: true,
      } as any,
      create: {
        id: interaction.guild.id,
        name: interaction.guild.name,
        exchangeForumChannelId: forumChannel.id,
        exchangeEnabled: true,
      } as any,
    });

    const embed = new EmbedBuilder()
      .setTitle("🏪 Exchange System Setup Complete")
      .setDescription(
        `The exchange system has been successfully set up!\n\n` +
          `**Forum Channel:** ${forumChannel}\n` +
          `**Setup by:** ${interaction.user}\n\n` +
          `✅ **Forum tags created:**\n` +
          `📦 Categories: Electronics, Clothing, Accessories, Home & Furniture, Footwear, Miscellaneous\n` +
          `🔄 Types: Give, Request, Trade\n` +
          `🟢 Status: Available, Pending, Completed\n\n` +
          `Users can now use \`/exchange post\` to create exchange posts in the forum.`,
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error setting up exchange system:", error);
    await interaction.reply({
      content: "❌ Failed to setup exchange system!",
      ephemeral: true,
    });
  }
}

async function handleDisable(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return await interaction.reply({
      content:
        "❌ You need the **Manage Server** permission to disable the exchange system!",
      ephemeral: true,
    });
  }

  try {
    await prisma.guild.update({
      where: { id: interaction.guild.id },
      data: { exchangeEnabled: false } as any,
    });

    await interaction.reply({
      content: "✅ Exchange system has been disabled!",
    });
  } catch (error) {
    console.error("Error disabling exchange system:", error);
    await interaction.reply({
      content: "❌ Failed to disable exchange system!",
      ephemeral: true,
    });
  }
}

async function handleSetupTags(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return await interaction.reply({
      content:
        "❌ You need the **Manage Server** permission to setup forum tags!",
      ephemeral: true,
    });
  }

  const forumChannel = interaction.options.getChannel("forum", true);

  if (forumChannel.type !== ChannelType.GuildForum) {
    return await interaction.reply({
      content: "❌ Please select a forum channel!",
      ephemeral: true,
    });
  }

  try {
    const forumChannelTyped = forumChannel as ForumChannel;
    await setupForumTags(forumChannelTyped);

    await interaction.reply({
      content: "✅ Forum tags have been updated!",
    });
  } catch (error) {
    console.error("Error setting up forum tags:", error);
    await interaction.reply({
      content: "❌ Failed to setup forum tags!",
      ephemeral: true,
    });
  }
}

async function handlePost(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  try {
    const guildData = (await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
      select: {
        exchangeEnabled: true,
        exchangeForumChannelId: true,
      } as any,
    })) as any;

    if (!guildData?.exchangeEnabled || !guildData.exchangeForumChannelId) {
      return await interaction.reply({
        content: "❌ Exchange system is not enabled in this server!",
        ephemeral: true,
      });
    }

    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description", true);
    const category = interaction.options.getString("category", true) as
      | "ELECTRONICS"
      | "CLOTHING"
      | "ACCESSORIES"
      | "HOME_FURNITURE"
      | "FOOTWEAR"
      | "MISC";
    const type = interaction.options.getString("type", true) as
      | "GIVE"
      | "REQUEST"
      | "TRADE";
    let location = interaction.options.getString("location", true);
    const image = interaction.options.getAttachment("image");

    const validLocationPatterns = [
      /^https?:\/\/(?:www\.)?google\.com\/maps\/search\/.+/,
      /^https?:\/\/maps\.app\.goo\.gl\/.+/,
      /^https?:\/\/(?:www\.)?google\.com\/maps\/@.+/,
      /^https?:\/\/(?:www\.)?google\.com\/maps\/place\/.+/,
    ];

    const isValidLocation = validLocationPatterns.some((pattern) =>
      pattern.test(location),
    );

    if (!isValidLocation && !location.includes("maps.app.goo.gl")) {
      location = `https://google.com/maps/search/${encodeURIComponent(location)}`;
    } else if (!isValidLocation) {
      return await interaction.reply({
        content:
          "❌ Please provide a valid Google Maps link (e.g., google.com/maps/search/... or maps.app.goo.gl/...)",
        ephemeral: true,
      });
    }

    if (image && !image.contentType?.startsWith("image/")) {
      return await interaction.reply({
        content: "❌ Please upload a valid image file!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const forumChannel = (await interaction.guild.channels.fetch(
      guildData.exchangeForumChannelId,
    )) as ForumChannel;
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
      return await interaction.editReply({
        content: "❌ Exchange forum channel not found!",
      });
    }

    const botMember = interaction.guild.members.me;
    if (
      !botMember
        ?.permissionsIn(forumChannel)
        .has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessagesInThreads,
          PermissionFlagsBits.CreatePublicThreads,
        ])
    ) {
      return await interaction.editReply({
        content:
          "❌ I don't have permission to create posts in the forum channel!",
      });
    }

    const availableTags = forumChannel.availableTags;
    const tags: string[] = [];

    const categoryTag = availableTags.find(
      (tag) =>
        tag.id &&
        tag.name &&
        (tag.name.toLowerCase().includes(category.toLowerCase()) ||
          tag.name
            .toLowerCase()
            .includes(category.replace("_", " ").toLowerCase())),
    );
    if (categoryTag?.id) tags.push(categoryTag.id);

    const typeTag = availableTags.find(
      (tag) =>
        tag.id &&
        tag.name &&
        tag.name.toLowerCase().includes(type.toLowerCase()),
    );
    if (typeTag?.id) tags.push(typeTag.id);

    const availableTag = availableTags.find(
      (tag) =>
        tag.id && tag.name && tag.name.toLowerCase().includes("available"),
    );
    if (availableTag?.id) tags.push(availableTag.id);

    const typeEmojis = {
      GIVE: "🎁",
      REQUEST: "🙏",
      TRADE: "🔄",
    };

    const categoryNames = {
      ELECTRONICS: "Electronics",
      CLOTHING: "Clothing",
      ACCESSORIES: "Accessories",
      HOME_FURNITURE: "Home & Furniture",
      FOOTWEAR: "Footwear",
      MISC: "Miscellaneous",
    };

    const embed = new EmbedBuilder()
      .setTitle(`${typeEmojis[type]} ${title}`)
      .setDescription(description)
      .setColor(
        type === "GIVE" ? 0x00ff00 : type === "REQUEST" ? 0xff9900 : 0x0099ff,
      )
      .addFields([
        {
          name: "📦 Category",
          value: categoryNames[category],
          inline: true,
        },
        {
          name: "🔄 Type",
          value: type.charAt(0) + type.slice(1).toLowerCase(),
          inline: true,
        },
        {
          name: "🟢 Status",
          value: "Available",
          inline: true,
        },
        {
          name: "📍 Location",
          value: `[View on Maps](${location})`,
          inline: true,
        },
        {
          name: "👤 Posted by",
          value: `${interaction.user}`,
          inline: true,
        },
      ])
      .setTimestamp()
      .setFooter({ text: "Use the buttons below to interact with this post!" });

    if (image) {
      embed.setImage(image.url);
    }

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`exchange_contact_${interaction.user.id}`)
        .setLabel("Contact Poster")
        .setEmoji("📩")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`exchange_available_${interaction.user.id}`)
        .setLabel("Still Available?")
        .setEmoji("❓")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`exchange_close_${interaction.user.id}`)
        .setLabel("Close Post")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
    );

    const validTags = tags
      .filter((tagId) => tagId && typeof tagId === "string")
      .slice(0, 5);

    let thread;
    try {
      thread = await forumChannel.threads.create({
        name: title,
        message: {
          embeds: [embed],
          components: [actionRow],
        },
        appliedTags: validTags.length > 0 ? validTags : undefined,
      });

      const messages = await thread.messages.fetch({ limit: 1 });
      const postMessage = messages.first();
      if (postMessage) {
        await postMessage.pin();
      }
    } catch (error) {
      console.error("Error creating forum thread:", error);
      return await interaction.editReply({
        content:
          "❌ Failed to create forum thread. Please check forum channel permissions and settings!",
      });
    }

    await (prisma as any).exchangePosts.create({
      data: {
        threadId: thread.id,
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        title,
        description,
        exchangeCategory: category,
        exchangeType: type,
        location,
        imageUrl: image?.url || null,
      },
    });

    await interaction.editReply({
      content: `✅ Your exchange post has been created and pinned! Check it out: ${thread}`,
    });
  } catch (error) {
    console.error("Error creating exchange post:", error);
    await interaction.editReply({
      content: "❌ Failed to create exchange post!",
    });
  }
}

async function setupForumTags(forumChannel: ForumChannel) {
  const tags: GuildForumTagData[] = [
    {
      name: "📱 Electronics",
      moderated: false,
    },
    {
      name: "👕 Clothing",
      moderated: false,
    },
    {
      name: "💍 Accessories",
      moderated: false,
    },
    {
      name: "🏠 Home & Furniture",
      moderated: false,
    },
    {
      name: "👟 Footwear",
      moderated: false,
    },
    {
      name: "📦 Miscellaneous",
      moderated: false,
    },
    {
      name: "🎁 Give",
      moderated: false,
    },
    {
      name: "🙏 Request",
      moderated: false,
    },
    {
      name: "🔄 Trade",
      moderated: false,
    },
    {
      name: "🟢 Available",
      moderated: false,
    },
    {
      name: "🟡 Pending",
      moderated: false,
    },
    {
      name: "✅ Completed",
      moderated: false,
    },
  ];

  await forumChannel.setAvailableTags(tags);
}

async function handleUpdatePost(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  let threadId = interaction.options.getString("thread_id");

  if (!threadId) {
    if (
      interaction.channel?.type === ChannelType.PublicThread &&
      interaction.channel.parent?.type === ChannelType.GuildForum
    ) {
      threadId = interaction.channelId;
    } else {
      return await interaction.reply({
        content:
          "❌ Please provide a thread_id or use this command in the forum thread you want to update!",
        ephemeral: true,
      });
    }
  }

  const newTitle = interaction.options.getString("title");
  const newDescription = interaction.options.getString("description");
  let newLocation = interaction.options.getString("location");

  try {
    const exchangePost = await (prisma as any).exchangePosts.findUnique({
      where: { threadId },
    });

    if (!exchangePost) {
      return await interaction.reply({
        content: "❌ Exchange post not found!",
        ephemeral: true,
      });
    }

    if (exchangePost.userId !== interaction.user.id) {
      return await interaction.reply({
        content: "❌ You can only update your own exchange posts!",
        ephemeral: true,
      });
    }

    if (!exchangePost.isActive) {
      return await interaction.reply({
        content: "❌ Cannot update an inactive exchange post!",
        ephemeral: true,
      });
    }

    if (newLocation) {
      const validLocationPatterns = [
        /^https?:\/\/(?:www\.)?google\.com\/maps\/search\/.+/,
        /^https?:\/\/maps\.app\.goo\.gl\/.+/,
        /^https?:\/\/(?:www\.)?google\.com\/maps\/@.+/,
        /^https?:\/\/(?:www\.)?google\.com\/maps\/place\/.+/,
      ];

      const isValidLocation = validLocationPatterns.some((pattern) =>
        pattern.test(newLocation!),
      );

      if (!isValidLocation && !newLocation.includes("maps.app.goo.gl")) {
        newLocation = `https://google.com/maps/search/${encodeURIComponent(newLocation)}`;
      } else if (!isValidLocation) {
        return await interaction.reply({
          content:
            "❌ Please provide a valid Google Maps link (e.g., google.com/maps/search/... or maps.app.goo.gl/...)",
          ephemeral: true,
        });
      }
    }

    await interaction.deferReply({ ephemeral: true });

    const updateData: any = {};
    if (newTitle) updateData.title = newTitle;
    if (newDescription) updateData.description = newDescription;
    if (newLocation) updateData.location = newLocation;

    if (Object.keys(updateData).length === 0) {
      return await interaction.editReply({
        content: "❌ Please provide at least one field to update!",
      });
    }

    await (prisma as any).exchangePosts.update({
      where: { threadId },
      data: updateData,
    });

    try {
      const thread = await interaction.guild.channels.fetch(threadId);
      if (!thread || thread.type !== ChannelType.PublicThread) {
        return await interaction.editReply({
          content: "❌ Thread not found or invalid!",
        });
      }

      const messages = await thread.messages.fetch({ limit: 1 });
      const originalMessage = messages.first();

      if (!originalMessage || !originalMessage.embeds[0]) {
        return await interaction.editReply({
          content: "❌ Original post message not found!",
        });
      }

      const embed = EmbedBuilder.from(originalMessage.embeds[0]);

      if (newTitle) {
        const currentTitle = embed.data.title || "";
        const emoji = currentTitle.split(" ")[0];
        embed.setTitle(`${emoji} ${newTitle}`);
      }

      if (newDescription) {
        embed.setDescription(newDescription);
      }

      if (newLocation) {
        const fields = embed.data.fields || [];
        const locationFieldIndex = fields.findIndex(
          (field) => field.name === "📍 Location",
        );
        if (locationFieldIndex !== -1) {
          fields[locationFieldIndex] = {
            name: "📍 Location",
            value: `[View on Maps](${newLocation})`,
            inline: true,
          };
          embed.setFields(fields);
        }
      }

      if (newTitle) {
        await thread.setName(newTitle);
      }

      await originalMessage.edit({ embeds: [embed] });

      await interaction.editReply({
        content: "✅ Your exchange post has been updated successfully!",
      });
    } catch (error) {
      console.error("Error updating forum post:", error);
      await interaction.editReply({
        content:
          "✅ Database updated, but failed to update forum post display.",
      });
    }
  } catch (error) {
    console.error("Error updating exchange post:", error);
    await interaction.editReply({
      content: "❌ Failed to update exchange post!",
    });
  }
}

async function handleMarkFulfilled(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  let threadId = interaction.options.getString("thread_id");

  if (!threadId) {
    if (
      interaction.channel?.type === ChannelType.PublicThread &&
      interaction.channel.parent?.type === ChannelType.GuildForum
    ) {
      threadId = interaction.channelId;
    } else {
      return await interaction.reply({
        content:
          "❌ Please provide a thread_id or use this command in the forum thread you want to mark as fulfilled!",
        ephemeral: true,
      });
    }
  }

  try {
    const exchangePost = await (prisma as any).exchangePosts.findUnique({
      where: { threadId },
    });

    if (!exchangePost) {
      return await interaction.reply({
        content: "❌ Exchange post not found!",
        ephemeral: true,
      });
    }

    if (exchangePost.userId !== interaction.user.id) {
      return await interaction.reply({
        content: "❌ You can only mark your own exchange posts as fulfilled!",
        ephemeral: true,
      });
    }

    if (!exchangePost.isActive) {
      return await interaction.reply({
        content: "❌ This exchange post is already inactive!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    await (prisma as any).exchangePosts.update({
      where: { threadId },
      data: { isActive: false },
    });

    try {
      const thread = await interaction.guild.channels.fetch(threadId);
      if (!thread || thread.type !== ChannelType.PublicThread) {
        return await interaction.editReply({
          content: "❌ Thread not found or invalid!",
        });
      }

      const forumChannel = thread.parent as ForumChannel;
      if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
        const availableTags = forumChannel.availableTags;
        const completedTag = availableTags.find(
          (tag) => tag.name && tag.name.toLowerCase().includes("completed"),
        );

        if (completedTag?.id) {
          const currentTags = thread.appliedTags;
          const nonStatusTags = currentTags.filter((tagId) => {
            const tag = availableTags.find((t) => t.id === tagId);
            return (
              tag &&
              !tag.name?.toLowerCase().includes("available") &&
              !tag.name?.toLowerCase().includes("pending") &&
              !tag.name?.toLowerCase().includes("completed")
            );
          });

          await thread.setAppliedTags([...nonStatusTags, completedTag.id]);
        }
      }

      const messages = await thread.messages.fetch({ limit: 1 });
      const originalMessage = messages.first();

      if (originalMessage && originalMessage.embeds[0]) {
        const embed = EmbedBuilder.from(originalMessage.embeds[0]);

        const fields = embed.data.fields || [];
        const statusFieldIndex = fields.findIndex((field) =>
          field.name.includes("Status"),
        );

        if (statusFieldIndex !== -1) {
          fields[statusFieldIndex] = {
            name: "✅ Status",
            value: "Completed",
            inline: true,
          };
          embed.setFields(fields);
        }

        embed.setColor(0x808080);

        await originalMessage.edit({
          embeds: [embed],
          components: [],
        });
      }

      await interaction.editReply({
        content: "✅ Your exchange post has been marked as fulfilled!",
      });
    } catch (error) {
      console.error("Error updating forum post:", error);
      await interaction.editReply({
        content:
          "✅ Post marked as fulfilled, but failed to update forum display.",
      });
    }
  } catch (error) {
    console.error("Error marking post as fulfilled:", error);
    await interaction.editReply({
      content: "❌ Failed to mark post as fulfilled!",
    });
  }
}

async function handleListPosts(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  try {
    const userPosts = await (prisma as any).exchangePosts.findMany({
      where: {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (userPosts.length === 0) {
      return await interaction.reply({
        content: "❌ You don't have any active exchange posts in this server!",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Your Active Exchange Posts")
      .setDescription(
        `You have ${userPosts.length} active exchange post${userPosts.length === 1 ? "" : "s"}:`,
      )
      .setColor(0x0099ff)
      .setTimestamp();

    const postsToShow = userPosts.slice(0, 25);

    for (const post of postsToShow) {
      const typeEmojis = {
        GIVE: "🎁",
        REQUEST: "🙏",
        TRADE: "🔄",
      };

      const threadLink = `https://discord.com/channels/${interaction.guild.id}/${post.threadId}`;

      embed.addFields({
        name: `${typeEmojis[post.exchangeType as keyof typeof typeEmojis]} ${post.title}`,
        value: `**Type:** ${post.exchangeType}\n**Category:** ${post.exchangeCategory}\n**Thread:** [View Post](${threadLink})\n**Thread ID:** \`${post.threadId}\``,
        inline: true,
      });
    }

    if (userPosts.length > 25) {
      embed.setFooter({
        text: `Showing first 25 of ${userPosts.length} posts`,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error("Error listing user posts:", error);
    await interaction.reply({
      content: "❌ Failed to fetch your exchange posts!",
      ephemeral: true,
    });
  }
}
