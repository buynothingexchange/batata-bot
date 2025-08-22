import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../interface/command.js";
import { ModerationService } from "../service-classes/ModHelper.js";
import prisma from "../utils/prisma.js";

interface ModCase {
  id: string;
  guildId: string;
  caseNumber: number;
  TargetUserID: string;
  ModeratorUserID: string;
  action: string;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

export default {
  data: new SlashCommandBuilder()
    .setName("cases")
    .setDescription("View moderation cases")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(subcommand =>
      subcommand
        .setName("info")
        .setDescription("Get detailed information about a specific case")
        .addIntegerOption(option =>
          option
            .setName("case-number")
            .setDescription("The case number to look up")
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("user")
        .setDescription("View cases for a specific user")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("The user to view cases for")
            .setRequired(true),
        )
        .addIntegerOption(option =>
          option
            .setName("page")
            .setDescription("Page number (each page shows 10 cases)")
            .setRequired(false)
            .setMinValue(1),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("recent")
        .setDescription("View recent moderation cases")
        .addIntegerOption(option =>
          option
            .setName("page")
            .setDescription("Page number (each page shows 10 cases)")
            .setRequired(false)
            .setMinValue(1),
        ),
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

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "info") {
        const caseNumber = interaction.options.getInteger("case-number", true);

        const modCase = await prisma.modCases.findFirst({
          where: {
            guildId: interaction.guild.id,
            caseNumber: caseNumber,
          },
        });

        if (!modCase) {
          return await interaction.reply({
            content: `❌ No case found with number #${caseNumber}`,
            ephemeral: true,
          });
        }

        const targetUser = await interaction.client.users
          .fetch(modCase.TargetUserID)
          .catch(() => null);
        const moderatorUser = await interaction.client.users
          .fetch(modCase.ModeratorUserID)
          .catch(() => null);

        const embed = new EmbedBuilder()
          .setTitle(`📋 Case #${modCase.caseNumber} Details`)
          .setColor(getActionColor(modCase.action))
          .addFields(
            {
              name: "⚡ Action",
              value: modCase.action,
              inline: true,
            },
            {
              name: "🎯 Target User",
              value: targetUser
                ? `${targetUser.tag}\n<@${targetUser.id}>`
                : `Unknown User\nID: ${modCase.TargetUserID}`,
              inline: true,
            },
            {
              name: "👮 Moderator",
              value: moderatorUser
                ? `${moderatorUser.tag}\n<@${moderatorUser.id}>`
                : `Unknown Moderator\nID: ${modCase.ModeratorUserID}`,
              inline: true,
            },
            {
              name: "📝 Reason",
              value: modCase.reason,
              inline: false,
            },
            {
              name: "📅 Date",
              value: `<t:${Math.floor(modCase.createdAt.getTime() / 1000)}:F>`,
              inline: true,
            },
          )
          .setTimestamp(modCase.createdAt)
          .setFooter({
            text: `Case ID: ${modCase.id}`,
          });

        await interaction.reply({
          embeds: [embed],
        });
      } else if (subcommand === "user") {
        const targetUser = interaction.options.getUser("user", true);
        const page = interaction.options.getInteger("page") || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const userCases = await prisma.modCases.findMany({
          where: {
            guildId: interaction.guild.id,
            TargetUserID: targetUser.id,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        });

        const totalCases = await prisma.modCases.count({
          where: {
            guildId: interaction.guild.id,
            TargetUserID: targetUser.id,
          },
        });

        if (userCases.length === 0) {
          return await interaction.reply({
            content: `❌ No cases found for ${targetUser.tag}`,
            ephemeral: true,
          });
        }

        const totalPages = Math.ceil(totalCases / limit);

        const embed = new EmbedBuilder()
          .setTitle(`📋 Cases for ${targetUser.tag}`)
          .setColor(0x3498db)
          .setDescription(
            userCases
              .map(
                (c: ModCase) =>
                  `**#${c.caseNumber}** • ${c.action} • <t:${Math.floor(
                    c.createdAt.getTime() / 1000,
                  )}:R>\n${c.reason.substring(0, 50)}${
                    c.reason.length > 50 ? "..." : ""
                  }`,
              )
              .join("\n\n"),
          )
          .setFooter({
            text: `Page ${page}/${totalPages} • Total cases: ${totalCases}`,
          })
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
        });
      } else if (subcommand === "recent") {
        const page = interaction.options.getInteger("page") || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const recentCases = await prisma.modCases.findMany({
          where: {
            guildId: interaction.guild.id,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        });

        const totalCases = await prisma.modCases.count({
          where: {
            guildId: interaction.guild.id,
          },
        });

        if (recentCases.length === 0) {
          return await interaction.reply({
            content: "❌ No moderation cases found for this server",
            ephemeral: true,
          });
        }

        const totalPages = Math.ceil(totalCases / limit);

        const casesText = await Promise.all(
          recentCases.map(async (c: ModCase) => {
            const targetUser = await interaction.client.users
              .fetch(c.TargetUserID)
              .catch(() => null);
            const userDisplay = targetUser
              ? targetUser.tag
              : `Unknown (${c.TargetUserID})`;

            return `**#${c.caseNumber}** • ${
              c.action
            } • ${userDisplay}\n<t:${Math.floor(
              c.createdAt.getTime() / 1000,
            )}:R> • ${c.reason.substring(0, 40)}${
              c.reason.length > 40 ? "..." : ""
            }`;
          }),
        );

        const embed = new EmbedBuilder()
          .setTitle("📋 Recent Moderation Cases")
          .setColor(0x3498db)
          .setDescription(casesText.join("\n\n"))
          .setFooter({
            text: `Page ${page}/${totalPages} • Total cases: ${totalCases}`,
          })
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
        });
      }
    } catch (error) {
      console.error("Error fetching moderation cases:", error);
      await interaction.reply({
        content: "❌ An error occurred while fetching moderation cases!",
        ephemeral: true,
      });
    }
  },
} as Command;

function getActionColor(action: string): number {
  switch (action) {
    case "BAN":
    case "HACKBAN":
      return 0xff0000;
    case "KICK":
      return 0xff8c00;
    case "TIMEOUT":
      return 0xffa500;
    case "WARN":
      return 0xffff00;
    case "UNBAN":
    case "UNTIMEOUT":
      return 0x00ff00;
    default:
      return 0x808080;
  }
}
