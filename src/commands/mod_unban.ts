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
    .setName("unban")
    .setDescription("Unban a user from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option
        .setName("user-id")
        .setDescription("The ID of the user to unban")
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the unban")
        .setRequired(false)
        .setMaxLength(512),
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

    const userId = interaction.options.getString("user-id", true);
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    if (!/^\d{17,19}$/.test(userId)) {
      return await interaction.reply({
        content: "❌ Invalid user ID format!",
        ephemeral: true,
      });
    }

    try {
      const banInfo = await interaction.guild.bans.fetch(userId);
      if (!banInfo) {
        return await interaction.reply({
          content: "❌ This user is not banned!",
          ephemeral: true,
        });
      }

      const targetUser = banInfo.user;

      await interaction.guild.bans.remove(userId, reason);

      const moderationAction: ModerationAction = {
        type: ModActionType.UNBAN,
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
        .setTitle("🔓 Unban Executed Successfully")
        .setColor(0x00ff00)
        .addFields(
          {
            name: "📋 Case Number",
            value: `#${modCase.caseNumber}`,
            inline: true,
          },
          {
            name: "🎯 Unbanned User",
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

      await interaction.reply({
        embeds: [responseEmbed],
      });
    } catch (error) {
      console.error("Error unbanning user:", error);

      if (error instanceof Error && error.message.includes("10026")) {
        return await interaction.reply({
          content: "❌ This user is not banned!",
          ephemeral: true,
        });
      }

      await interaction.reply({
        content: "❌ An error occurred while trying to unban the user!",
        ephemeral: true,
      });
    }
  },
} as Command;
