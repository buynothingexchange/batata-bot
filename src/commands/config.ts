import {
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type ForumChannel,
  type GuildForumTagData,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { counterCache } from "../events/handleCounterGame.js";
import type { Command } from "../interface/command.js";
import { ModerationService } from "../service-classes/ModHelper.js";
import prisma from "../utils/prisma.js";

// Forum tags setup function (shared from exchange command)
async function setupForumTags(forumChannel: ForumChannel) {
  const tags: GuildForumTagData[] = [
    // Category tags
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
    // Type tags
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
    // Status tags
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

export default {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Manage moderation settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View current moderation settings"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-mod-log")
        .setDescription("Set the moderation log channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              "Channel for moderation logs (leave empty to remove)",
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-server-log")
        .setDescription("Set the server log channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for server logs (leave empty to remove)")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-counter-channel")
        .setDescription("Set the counter game channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              "Channel for the counter game (leave empty to remove)",
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-counter-goal")
        .setDescription("Set the counter game goal")
        .addIntegerOption((option) =>
          option
            .setName("goal")
            .setDescription("The target number for the counter game")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10000),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset-counter")
        .setDescription("Reset the current counter to 0"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-mod-role")
        .setDescription("Set a role required for moderation commands")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription(
              "Role required for moderation (leave empty to remove)",
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-welcome-channel")
        .setDescription("Set the welcome channel for new member messages")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              "Channel for welcome messages (leave empty to remove)",
            )
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-main-role")
        .setDescription("Set the main role for lockdown operations")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription(
              "Main role for lockdown system (leave empty to remove)",
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set-exchange-forum")
        .setDescription("Set the forum channel for exchange posts")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              "Forum channel for exchange posts (leave empty to remove)",
            )
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildForum),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle-exchange")
        .setDescription("Enable or disable the exchange system"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("force-claim")
        .setDescription("(Moderator) Force mark an exchange post as claimed")
        .addStringOption((option) =>
          option
            .setName("thread_id")
            .setDescription(
              "Thread ID of the post to mark as claimed (optional if used in the post's thread)",
            )
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("force-available")
        .setDescription("(Moderator) Force mark an exchange post as available")
        .addStringOption((option) =>
          option
            .setName("thread_id")
            .setDescription(
              "Thread ID of the post to mark as available (optional if used in the post's thread)",
            )
            .setRequired(false),
        ),
    ),

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
        case "view":
          await handleView(interaction);
          break;
        case "set-mod-log":
          await handleLogChannel(interaction);
          break;
        case "set-server-log":
          await handleServerLogChannel(interaction);
          break;
        case "set-counter-channel":
          await handleCounterChannel(interaction);
          break;
        case "set-counter-goal":
          await handleCounterGoal(interaction);
          break;
        case "reset-counter":
          await handleResetCounter(interaction);
          break;
        case "set-mod-role":
          await handleModRole(interaction);
          break;
        case "set-welcome-channel":
          await handleWelcomeChannel(interaction);
          break;
        case "set-main-role":
          await handleMainRole(interaction);
          break;
        case "set-exchange-forum":
          await handleExchangeForum(interaction);
          break;
        case "toggle-exchange":
          await handleToggleExchange(interaction);
          break;
        case "force-claim":
          await handleForceClaim(interaction);
          break;
        case "force-available":
          await handleForceAvailable(interaction);
          break;
        default:
          await interaction.reply({
            content: "❌ Unknown subcommand!",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("Error in config command:", error);
      await interaction.reply({
        content: "❌ An error occurred while updating moderation settings!",
        ephemeral: true,
      });
    }
  },
} as Command;

async function handleView(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  const guildData = (await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  })) as any;

  if (!guildData) {
    return await interaction.reply({
      content: "❌ Failed to retrieve server settings!",
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Server Configuration")
    .setColor(0x0099ff)
    .setThumbnail(interaction.guild.iconURL())
    .setTimestamp();

  // Moderation Settings
  embed.addFields({
    name: "🛡️ Moderation Settings",
    value: [
      `**Mod Log:** ${
        guildData.modLogChannelId
          ? `<#${guildData.modLogChannelId}>`
          : "Not set"
      }`,
      `**Server Log:** ${
        guildData.serverLogChannelId
          ? `<#${guildData.serverLogChannelId}>`
          : "Not set"
      }`,
      `**Mod Role:** ${
        guildData.modRoleId ? `<@&${guildData.modRoleId}>` : "Not set"
      }`,
      `**Welcome Channel:** ${
        guildData.welcomeChannelId
          ? `<#${guildData.welcomeChannelId}>`
          : "Not set"
      }`,
      `**Main Role:** ${
        guildData.mainRoleId ? `<@&${guildData.mainRoleId}>` : "Not set"
      }`,
    ].join("\n"),
    inline: false,
  });

  // Counter Game
  embed.addFields({
    name: "🔢 Counter Game",
    value: [
      `**Channel:** ${
        guildData.counterChannelId
          ? `<#${guildData.counterChannelId}>`
          : "Not set"
      }`,
      `**Goal:** ${guildData.counterGoal || 100}`,
      `**Current Count:** ${guildData.currentCount || 0}`,
    ].join("\n"),
    inline: true,
  });

  // Exchange System
  embed.addFields({
    name: "🏪 Exchange System",
    value: [
      `**Status:** ${guildData.exchangeEnabled ? "✅ Enabled" : "❌ Disabled"}`,
      `**Forum Channel:** ${
        guildData.exchangeForumChannelId
          ? `<#${guildData.exchangeForumChannelId}>`
          : "Not set"
      }`,
    ].join("\n"),
    inline: true,
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLogChannel(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const channel = interaction.options.getChannel("channel");

  if (channel && channel.type !== ChannelType.GuildText) {
    return await interaction.reply({
      content: "❌ Invalid channel! Please select a text channel.",
      ephemeral: true,
    });
  }

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { modLogChannelId: channel?.id || null } as any,
  });

  if (channel) {
    await interaction.reply({
      content: `✅ Moderation log channel set to ${channel}!`,
    });
  } else {
    await interaction.reply({
      content: "✅ Moderation log channel removed!",
    });
  }
}

async function handleServerLogChannel(
  interaction: ChatInputCommandInteraction,
) {
  if (!interaction.guild) return;

  const channel = interaction.options.getChannel("channel");

  if (channel && channel.type !== ChannelType.GuildText) {
    return await interaction.reply({
      content: "❌ Invalid channel! Please select a text channel.",
      ephemeral: true,
    });
  }

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { serverLogChannelId: channel?.id || null } as any,
  });

  if (channel) {
    await interaction.reply({
      content: `✅ Server log channel set to ${channel}!`,
    });
  } else {
    await interaction.reply({
      content: "✅ Server log channel removed!",
    });
  }
}

async function handleCounterChannel(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const channel = interaction.options.getChannel("channel");

  if (channel && channel.type !== ChannelType.GuildText) {
    return await interaction.reply({
      content: "❌ Invalid channel! Please select a text channel.",
      ephemeral: true,
    });
  }

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { counterChannelId: channel?.id || null } as any,
  });

  if (channel) {
    const guildData = (await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
      select: { counterGoal: true, counterChannelId: true } as any,
    })) as any;
    counterCache.set(interaction.guild.id, {
      current: 0,
      goal: guildData?.counterGoal || 100,
      channelId: channel.id,
    });
    await interaction.reply({
      content: `✅ Counter game channel set to ${channel}! The counter starts at 0.`,
    });
  } else {
    counterCache.delete(interaction.guild.id);
    await interaction.reply({
      content: "✅ Counter game channel removed!",
    });
  }
}

async function handleCounterGoal(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const goal = interaction.options.getInteger("goal", true);

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { counterGoal: goal } as any,
  });

  await interaction.reply({
    content: `✅ Counter game goal set to ${goal}!`,
  });
}

async function handleResetCounter(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { currentCount: 0 } as any,
  });

  const guildData = (await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
    select: { counterGoal: true, counterChannelId: true } as any,
  })) as any;
  counterCache.set(interaction.guild.id, {
    current: 0,
    goal: guildData?.counterGoal || 100,
    channelId: guildData?.counterChannelId || null,
  });
  await interaction.reply({
    content: "✅ Counter has been reset to 0!",
  });
}

async function handleModRole(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const role = interaction.options.getRole("role");

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { modRoleId: role?.id || null } as any,
  });

  if (role) {
    await interaction.reply({
      content: `✅ Moderation role set to ${role}!`,
    });
  } else {
    await interaction.reply({
      content: "✅ Moderation role removed!",
    });
  }
}

async function handleWelcomeChannel(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const channel = interaction.options.getChannel("channel");

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { welcomeChannelId: channel?.id || null } as any,
  });

  if (channel) {
    await interaction.reply({
      content: `✅ Welcome channel set to ${channel}!`,
    });
  } else {
    await interaction.reply({
      content: "✅ Welcome channel removed!",
    });
  }
}

async function handleMainRole(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const role = interaction.options.getRole("role");

  await ModerationService.getOrCreateGuild(interaction.guild.id);
  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { mainRoleId: role?.id || null } as any,
  });

  if (role) {
    await interaction.reply({
      content: `✅ Main role set to ${role}!`,
    });
  } else {
    await interaction.reply({
      content: "✅ Main role removed!",
    });
  }
}

async function handleExchangeForum(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const channel = interaction.options.getChannel("channel");

  if (channel && channel.type !== ChannelType.GuildForum) {
    return await interaction.reply({
      content: "❌ Invalid channel! Please select a forum channel.",
      ephemeral: true,
    });
  }

  await ModerationService.getOrCreateGuild(interaction.guild.id);

  if (channel) {
    try {
      // Auto-initialize forum with tags when setting the channel
      const forumChannelTyped = channel as ForumChannel;
      await setupForumTags(forumChannelTyped);

      await prisma.guild.update({
        where: { id: interaction.guild.id },
        data: {
          exchangeForumChannelId: channel.id,
          exchangeEnabled: true,
        } as any,
      });

      const embed = new EmbedBuilder()
        .setTitle("🏪 Exchange Forum Setup Complete")
        .setDescription(
          `The exchange forum has been successfully configured!\n\n` +
            `**Forum Channel:** ${channel}\n` +
            `**Setup by:** ${interaction.user}\n\n` +
            `✅ **Forum tags created:**\n` +
            `📦 Categories: Electronics, Clothing, Accessories, Home & Furniture, Footwear, Miscellaneous\n` +
            `🔄 Types: Give, Request, Trade\n` +
            `🟢 Status: Available, Pending, Completed\n\n` +
            `✅ Exchange system is now **enabled**!\n` +
            `Users can now use \`/exchange post\` to create exchange posts.`,
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Error setting up exchange forum:", error);
      await interaction.reply({
        content:
          "❌ Failed to setup exchange forum! Please check my permissions.",
        ephemeral: true,
      });
    }
  } else {
    // Remove forum channel
    await prisma.guild.update({
      where: { id: interaction.guild.id },
      data: {
        exchangeForumChannelId: null,
        exchangeEnabled: false,
      } as any,
    });

    await interaction.reply({
      content:
        "✅ Exchange forum channel removed! Exchange system is now disabled.",
    });
  }
}

async function handleToggleExchange(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  await ModerationService.getOrCreateGuild(interaction.guild.id);

  const currentSettings = (await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
    select: { exchangeEnabled: true, exchangeForumChannelId: true } as any,
  })) as any;

  if (!currentSettings?.exchangeForumChannelId) {
    return await interaction.reply({
      content:
        "❌ Please set an exchange forum channel first using `/config set-exchange-forum`!",
      ephemeral: true,
    });
  }

  const newStatus = !currentSettings.exchangeEnabled;

  await prisma.guild.update({
    where: { id: interaction.guild.id },
    data: { exchangeEnabled: newStatus } as any,
  });

  await interaction.reply({
    content: `✅ Exchange system ${newStatus ? "enabled" : "disabled"}!`,
  });
}

async function handleForceClaim(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  // Check admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return await interaction.reply({
      content:
        "❌ You need the **Manage Server** permission to use this command!",
      ephemeral: true,
    });
  }

  let threadId = interaction.options.getString("thread_id");

  // If no thread_id provided, use current channel if it's a forum thread
  if (!threadId) {
    if (
      interaction.channel?.type === ChannelType.PublicThread &&
      interaction.channel.parent?.type === ChannelType.GuildForum
    ) {
      threadId = interaction.channelId;
    } else {
      return await interaction.reply({
        content:
          "❌ Please provide a thread_id or use this command in the forum thread you want to force claim!",
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

    if (!exchangePost.isActive) {
      return await interaction.reply({
        content: "❌ This exchange post is already inactive!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Update the forum post status
    const thread = await interaction.guild.channels.fetch(threadId);
    if (thread && thread.type === ChannelType.PublicThread) {
      // Update thread tags
      const forumChannel = thread.parent as ForumChannel;
      if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
        const availableTags = forumChannel.availableTags;
        const pendingTag = availableTags.find(
          (tag) => tag.name && tag.name.toLowerCase().includes("pending"),
        );

        if (pendingTag?.id) {
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

          await thread.setAppliedTags([...nonStatusTags, pendingTag.id]);
        }
      }

      // Update the original message
      const messages = await thread.messages.fetch({ limit: 1 });
      const originalMessage = messages.first();

      if (originalMessage && originalMessage.embeds[0]) {
        const embed = EmbedBuilder.from(originalMessage.embeds[0]);

        // Update status field
        const fields = embed.data.fields || [];
        const statusFieldIndex = fields.findIndex((field) =>
          field.name.includes("Status"),
        );

        if (statusFieldIndex !== -1) {
          fields[statusFieldIndex] = {
            name: "🟡 Status",
            value: "Claimed",
            inline: true,
          };
          embed.setFields(fields);
        }

        embed.setColor(0xffa500);
        await originalMessage.edit({ embeds: [embed] });
      }
    }

    await interaction.editReply({
      content:
        "✅ Exchange post has been marked as claimed by moderator action!",
    });
  } catch (error) {
    console.error("Error force claiming post:", error);
    await interaction.editReply({
      content: "❌ Failed to update post status!",
    });
  }
}

async function handleForceAvailable(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  // Check admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return await interaction.reply({
      content:
        "❌ You need the **Manage Server** permission to use this command!",
      ephemeral: true,
    });
  }

  let threadId = interaction.options.getString("thread_id");

  // If no thread_id provided, use current channel if it's a forum thread
  if (!threadId) {
    if (
      interaction.channel?.type === ChannelType.PublicThread &&
      interaction.channel.parent?.type === ChannelType.GuildForum
    ) {
      threadId = interaction.channelId;
    } else {
      return await interaction.reply({
        content:
          "❌ Please provide a thread_id or use this command in the forum thread you want to force make available!",
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

    if (!exchangePost.isActive) {
      return await interaction.reply({
        content: "❌ This exchange post is inactive!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Update the forum post status
    const thread = await interaction.guild.channels.fetch(threadId);
    if (thread && thread.type === ChannelType.PublicThread) {
      // Update thread tags
      const forumChannel = thread.parent as ForumChannel;
      if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
        const availableTags = forumChannel.availableTags;
        const availableTag = availableTags.find(
          (tag) => tag.name && tag.name.toLowerCase().includes("available"),
        );

        if (availableTag?.id) {
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

          await thread.setAppliedTags([...nonStatusTags, availableTag.id]);
        }
      }

      // Update the original message
      const messages = await thread.messages.fetch({ limit: 1 });
      const originalMessage = messages.first();

      if (originalMessage && originalMessage.embeds[0]) {
        const embed = EmbedBuilder.from(originalMessage.embeds[0]);

        // Update status field
        const fields = embed.data.fields || [];
        const statusFieldIndex = fields.findIndex((field) =>
          field.name.includes("Status"),
        );

        if (statusFieldIndex !== -1) {
          fields[statusFieldIndex] = {
            name: "🟢 Status",
            value: "Available",
            inline: true,
          };
          embed.setFields(fields);
        }

        embed.setColor(0x00ff00);
        await originalMessage.edit({ embeds: [embed] });
      }
    }

    await interaction.editReply({
      content:
        "✅ Exchange post has been marked as available by moderator action!",
    });
  } catch (error) {
    console.error("Error force making available:", error);
    await interaction.editReply({
      content: "❌ Failed to update post status!",
    });
  }
}
