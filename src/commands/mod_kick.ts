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
    .setName("kick")
    .setDescription("Kick a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("The user to kick")
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the kick")
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

    const targetUser = interaction.options.getUser("user", true);
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!targetMember) {
      return await interaction.reply({
        content: "❌ User not found in this server!",
        ephemeral: true,
      });
    }

    if (!targetMember.kickable) {
      return await interaction.reply({
        content:
          "❌ I cannot kick this member! They may have higher permissions than me.",
        ephemeral: true,
      });
    }

    if (targetMember.id === moderator.id) {
      return await interaction.reply({
        content: "❌ You cannot kick yourself!",
        ephemeral: true,
      });
    }

    if (
      moderator.roles.highest.position <= targetMember.roles.highest.position &&
      interaction.guild.ownerId !== moderator.id
    ) {
      return await interaction.reply({
        content:
          "❌ You cannot kick this member! They have equal or higher permissions than you.",
        ephemeral: true,
      });
    }

    if (targetMember.id === interaction.guild.ownerId) {
      return await interaction.reply({
        content: "❌ You cannot kick the server owner!",
        ephemeral: true,
      });
    }

    try {
      await targetMember.kick(reason);

      const moderationAction: ModerationAction = {
        type: ModActionType.KICK,
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
        .setTitle("👢 Kick Executed Successfully")
        .setColor(0x00ff00)
        .addFields(
          {
            name: "📋 Case Number",
            value: `#${modCase.caseNumber}`,
            inline: true,
          },
          {
            name: "🎯 Kicked User",
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
      console.error("Error kicking member:", error);
      await interaction.reply({
        content: "❌ An error occurred while trying to kick the member!",
        ephemeral: true,
      });
    }
  },
} as Command;
