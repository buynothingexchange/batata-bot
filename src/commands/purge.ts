import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
import type { Command } from "../interface/command.js";
import { ModerationService } from "../service-classes/ModHelper.js";

export default {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete multiple messages from the channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addStringOption(option =>
      option
        .setName("type")
        .setDescription("Type of messages to delete")
        .setRequired(false)
        .addChoices(
          { name: "All messages", value: "all" },
          { name: "Bot messages only", value: "bot" },
          { name: "User messages only", value: "user" },
        ),
    )
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Delete messages from a specific user only")
        .setRequired(false),
    )
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return await interaction.reply({
        content: "❌ This command can only be used in a server!",
        ephemeral: true,
      });
    }

    const moderationService = new ModerationService();
    const moderator = interaction.member as GuildMember;

    const hasModPerms = await moderationService.hasModPermissions(
      interaction.guild.id,
      moderator,
    );

    if (!hasModPerms) {
      return await interaction.reply({
        content: "❌ You don't have permission to use moderation commands!",
        ephemeral: true,
      });
    }

    const amount = interaction.options.getInteger("amount", true);
    const type = interaction.options.getString("type") || "all";
    const targetUser = interaction.options.getUser("user");

    const channel = interaction.channel as TextChannel;

    if (!channel.isTextBased()) {
      return await interaction.reply({
        content: "❌ This command can only be used in text channels!",
        ephemeral: true,
      });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return await interaction.reply({
        content:
          "❌ I don't have permission to manage messages in this channel!",
        ephemeral: true,
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true });

      const messages = await channel.messages.fetch({ limit: amount });
      let messagesToDelete = Array.from(messages.values());

      if (type === "bot") {
        messagesToDelete = messagesToDelete.filter(msg => msg.author.bot);
      } else if (type === "user") {
        messagesToDelete = messagesToDelete.filter(msg => !msg.author.bot);
      }

      if (targetUser) {
        messagesToDelete = messagesToDelete.filter(
          msg => msg.author.id === targetUser.id,
        );
      }

      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const validMessages = messagesToDelete.filter(
        msg => msg.createdTimestamp > twoWeeksAgo,
      );
      const oldMessages = messagesToDelete.filter(
        msg => msg.createdTimestamp <= twoWeeksAgo,
      );

      if (validMessages.length === 0) {
        return await interaction.editReply({
          content:
            "❌ No messages found to delete with the specified criteria!",
        });
      }

      let deletedCount = 0;

      if (validMessages.length > 1) {
        const deleted = await channel.bulkDelete(validMessages, true);
        deletedCount += deleted.size;
      } else if (validMessages.length === 1 && validMessages[0]) {
        await validMessages[0].delete();
        deletedCount += 1;
      }

      for (const oldMessage of oldMessages.slice(0, 10)) {
        try {
          await oldMessage.delete();
          deletedCount += 1;

          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.log("Could not delete old message:", error);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle("🧹 Messages Purged Successfully")
        .setColor(0x00ff00)
        .addFields(
          {
            name: "📊 Messages Deleted",
            value: `${deletedCount}`,
            inline: true,
          },
          {
            name: "📋 Filter Type",
            value:
              type === "all"
                ? "All messages"
                : type === "bot"
                  ? "Bot messages only"
                  : "User messages only",
            inline: true,
          },
          {
            name: "👮 Moderator",
            value: `${interaction.user.tag}\n<@${interaction.user.id}>`,
            inline: true,
          },
        )
        .setTimestamp()
        .setFooter({
          text: `Channel: #${channel.name} • Moderator ID: ${interaction.user.id}`,
        });

      if (targetUser) {
        embed.addFields({
          name: "🎯 Target User",
          value: `${targetUser.tag}\n<@${targetUser.id}>`,
          inline: true,
        });
      }

      if (oldMessages.length > 10) {
        embed.addFields({
          name: "⚠️ Note",
          value: `${
            oldMessages.length - 10
          } old messages (>14 days) were skipped due to Discord limitations.`,
          inline: false,
        });
      }

      await interaction.editReply({
        embeds: [embed],
      });

      const tempMessage = await channel.send({
        content: `🧹 **${deletedCount}** messages were deleted by ${interaction.user.tag}`,
      });

      setTimeout(async () => {
        try {
          await tempMessage.delete();
        } catch (error) {
          console.log("Could not delete temp message:", error);
        }
      }, 5000);
    } catch (error) {
      console.error("Error purging messages:", error);

      const errorMessage =
        error instanceof Error && error.message.includes("50034")
          ? "❌ You can only bulk delete messages that are under 14 days old!"
          : "❌ An error occurred while trying to delete messages!";

      await interaction.editReply({
        content: errorMessage,
      });
    }
  },
} as Command;
