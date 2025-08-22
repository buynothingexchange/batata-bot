import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../interface/command.js";
import {
  ModActionType,
  type ModerationAction,
  ModerationService,
} from "../service-classes/ModHelper.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The user to ban")
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the ban")
        .setRequired(false)
        .setMaxLength(512),
    )
    .addIntegerOption(option =>
      option
        .setName("delete-days")
        .setDescription("Number of days of messages to delete (0-7)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7),
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

    const targetUser = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason") || "No reason provided";
    const deleteDays = interaction.options.getInteger("delete-days") || 0;

    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (targetMember) {
      if (!targetMember.bannable) {
        return await interaction.reply({
          content:
            "❌ I cannot ban this member! They may have higher permissions than me.",
          ephemeral: true,
        });
      }

      if (targetMember.id === moderator.id) {
        return await interaction.reply({
          content: "❌ You cannot ban yourself!",
          ephemeral: true,
        });
      }

      if (
        moderator.roles.highest.position <=
          targetMember.roles.highest.position &&
        interaction.guild.ownerId !== moderator.id
      ) {
        return await interaction.reply({
          content:
            "❌ You cannot ban this member! They have equal or higher permissions than you.",
          ephemeral: true,
        });
      }

      if (targetMember.id === interaction.guild.ownerId) {
        return await interaction.reply({
          content: "❌ You cannot ban the server owner!",
          ephemeral: true,
        });
      }
    }

    try {
      const existingBan = await interaction.guild.bans.fetch(targetUser.id);
      if (existingBan) {
        return await interaction.reply({
          content: "❌ This user is already banned!",
          ephemeral: true,
        });
      }
    } catch (error) {}

    try {
      await interaction.guild.bans.create(targetUser.id, {
        reason,
        deleteMessageDays: deleteDays,
      });

      const moderationAction: ModerationAction = {
        type: ModActionType.BAN,
        target: targetUser,
        moderator: interaction.user,
        reason,
        guild: interaction.guild,
      };

      const modCase = await moderationService.logModerationAction(
        interaction.client,
        moderationAction,
      );

      const responseEmbed = new EmbedBuilder()
        .setTitle("🔨 Ban Executed Successfully")
        .setColor(0x00ff00)
        .addFields(
          {
            name: "📋 Case Number",
            value: `#${modCase.caseNumber}`,
            inline: true,
          },
          {
            name: "🎯 Banned User",
            value: `${targetUser.tag}\n<@${targetUser.id}>`,
            inline: true,
          },
          {
            name: "👮 Moderator",
            value: `${interaction.user.tag}\n<@${interaction.user.id}>`,
            inline: true,
          },
          {
            name: "📝 Reason",
            value: reason,
            inline: false,
          },
        )
        .setTimestamp()
        .setFooter({
          text: `Target ID: ${targetUser.id} • Moderator ID: ${interaction.user.id}`,
        });

      if (deleteDays > 0) {
        responseEmbed.addFields({
          name: "🗑️ Messages Deleted",
          value: `${deleteDays} day${deleteDays === 1 ? "" : "s"}`,
          inline: true,
        });
      }

      await interaction.reply({
        embeds: [responseEmbed],
      });
    } catch (error) {
      console.error("Error banning member:", error);
      await interaction.reply({
        content: "❌ An error occurred while trying to ban the member!",
        ephemeral: true,
      });
    }
  },
} as Command;
