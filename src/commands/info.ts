import {
  ActivityType,
  EmbedBuilder,
  PermissionFlagsBits,
  type PresenceStatus,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../interface/command.js";
import prisma from "../utils/prisma.js";

const statusEmoji: Record<PresenceStatus, string> = {
  invisible: "⚪",
  online: "🟢",
  idle: "🟡",
  dnd: "🔴",
  offline: "⚫",
};

export default {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Get information about users, server, or lavalink")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("Get information about a user")
        .addUserOption((option) =>
          option
            .setName("target")
            .setDescription("The user to get information about")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("guild")
        .setDescription("Get information about this server"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lavalink")
        .setDescription("Get lavalink node information"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),

  execute: async (interaction) => {
    if (!interaction.guild) {
      await interaction.reply({
        content: "Guild not found.",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "user") {
      const targetUser =
        interaction.options.getUser("target") || interaction.user;
      const member = await interaction.guild?.members.fetch(targetUser.id);

      if (!member) {
        await interaction.reply({
          content: "User not found in this server.",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(member.displayHexColor || "#0099ff")
        .setTitle("👤 User Information")
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          {
            name: "👤 Basic Info",
            value: `**Username:** ${targetUser.username}\n**Display Name:** ${member.displayName}\n**ID:** ${targetUser.id}`,
            inline: true,
          },
          {
            name: "📅 Dates",
            value: `**Account Created:** <t:${Math.floor(
              targetUser.createdTimestamp / 1000,
            )}:R>\n**Joined Server:** <t:${Math.floor(
              (member.joinedTimestamp || 0) / 1000,
            )}:R>`,
            inline: true,
          },
        );

      const roles = member.roles.cache
        .filter((role) => role.id !== interaction.guild?.id)
        .map((role) => role.toString())
        .slice(0, 10);

      if (roles.length > 0) {
        const rolesText =
          roles.length > 10
            ? `${roles.slice(0, 10).join(", ")} and ${
                roles.length - 10
              } more...`
            : roles.join(", ");
        embed.addFields({
          name: `🎭 Roles (${member.roles.cache.size - 1})`,
          value: rolesText,
          inline: false,
        });
      }

      if (member.roles.highest.id !== interaction.guild?.id) {
        embed.addFields({
          name: "👑 Highest Role",
          value: member.roles.highest.toString(),
          inline: true,
        });
      }

      if (member.presence) {
        const status = member.presence.status as PresenceStatus;
        const statusDisplay = statusEmoji[status] || statusEmoji.offline;

        embed.addFields({
          name: "📱 Status",
          value: `${statusDisplay} ${
            status.charAt(0).toUpperCase() + status.slice(1)
          }`,
          inline: true,
        });

        const activity = member.presence.activities?.[0];
        if (activity) {
          let activityText = activity.name;

          if (
            activity.type === ActivityType.Listening &&
            activity.name === "Spotify"
          ) {
            activityText = `🎵 Listening to **${activity.details}** by **${activity.state}**`;
          } else if (activity.type === ActivityType.Playing) {
            activityText = `🎮 Playing **${activity.name}**`;
          } else if (activity.type === ActivityType.Watching) {
            activityText = `📺 Watching **${activity.name}**`;
          }

          embed.addFields({
            name: "🎯 Activity",
            value: activityText,
            inline: false,
          });
        }
      }

      const cases = await prisma.modCases.findMany({
        where: {
          guildId: interaction.guild.id,
          TargetUserID: targetUser.id,
        },
        orderBy: { createdAt: "desc" },
      });

      if (cases.length > 0) {
        embed.addFields({
          name: "⚖️ Moderation Cases",
          value: `**Total Cases:** ${cases.length}\n**Recent:** ${cases
            .slice(0, 3)
            .map(
              (c) =>
                `${c.action} - ${c.reason} - (${new Date(
                  c.createdAt,
                ).toLocaleDateString()})`,
            )
            .join(", ")}`,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === "guild") {
      const guild = interaction.guild;
      if (!guild) return;

      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("🏰 Guild Information")
        .setThumbnail(guild.iconURL())
        .addFields(
          {
            name: "📊 Server Stats",
            value: `**Name:** ${guild.name}\n**ID:** ${guild.id}\n**Owner:** <@${guild.ownerId}>`,
            inline: true,
          },
          {
            name: "👥 Members",
            value: `**Total:** ${guild.memberCount}\n**Humans:** ${
              guild.members.cache.filter((m) => !m.user.bot).size
            }\n**Bots:** ${guild.members.cache.filter((m) => m.user.bot).size}`,
            inline: true,
          },
          {
            name: "📅 Created",
            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "📝 Channels",
            value: `**Text:** ${
              guild.channels.cache.filter((c) => c.type === 0).size
            }\n**Voice:** ${
              guild.channels.cache.filter((c) => c.type === 2).size
            }\n**Categories:** ${
              guild.channels.cache.filter((c) => c.type === 4).size
            }`,
            inline: true,
          },
          {
            name: "🎭 Roles",
            value: `${guild.roles.cache.size}`,
            inline: true,
          },
          {
            name: "😀 Emojis",
            value: `${guild.emojis.cache.size}`,
            inline: true,
          },
        );

      if (guild.premiumTier > 0) {
        embed.addFields({
          name: "💎 Nitro Boost",
          value: `**Level:** ${guild.premiumTier}\n**Boosts:** ${guild.premiumSubscriptionCount}`,
          inline: true,
        });
      }

      await interaction.reply({ embeds: [embed] });
    }
  },
} as Command;
