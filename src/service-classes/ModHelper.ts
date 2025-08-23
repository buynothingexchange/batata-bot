import {
  type Client,
  type Guild,
  type GuildMember,
  type User,
  WebhookClient,
} from "discord.js";
import { EmbedBuilder as DiscordEmbedBuilder } from "discord.js";
import prisma from "../utils/prisma.js";

export enum ModActionType {
  WARN = "WARN",
  TIMEOUT = "TIMEOUT",
  KICK = "KICK",
  BAN = "BAN",
  HACKBAN = "HACKBAN",
  UNBAN = "UNBAN",
  UNTIMEOUT = "UNTIMEOUT",
}

export interface ModerationAction {
  type: ModActionType;
  target: User;
  moderator: User;
  reason?: string;
  duration?: number;
  guild: Guild;
}

export interface ModCaseData {
  caseNumber: number;
  targetUserID: string;
  moderatorUserID: string;
  action: ModActionType;
  reason: string;
  guildId: string;
}

interface PrismaGuild {
  id: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
  modLogChannelID: string | null;
  serverLogChannelID: string | null;
  modRoleId: string | null;
  modLogWebhookUrl: string | null;
  serverLogWebhookUrl: string | null;
  CurrentCounter: number | null;
  GoalCounter: number | null;
  CounterChannelId: string | null;
  welcomeChannelId: string | null;
  mainRoleId: string | null;
  exchangeForumChannelId: string | null;
  exchangeEnabled: boolean;
}

interface PrismaModCase {
  id: string;
  guildId: string;
  caseNumber: number;
  TargetUserID: string;
  ModeratorUserID: string;
  action: ModActionType;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ModerationService {
  private WebhookClientMap: Map<string, WebhookClient> = new Map();

  public static async getOrCreateGuild(guildId: string): Promise<PrismaGuild> {
    return (await prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId },
    })) as unknown as PrismaGuild;
  }

  public static async updateModerationSettings(
    guildId: string,
    updates: {
      modLogChannelID?: string | null;
      modRoleId?: string | null;
      modLogWebhookUrl?: string | null;
      serverLogChannelID?: string | null;
      serverLogWebhookUrl?: string | null;
    },
  ): Promise<PrismaGuild> {
    await ModerationService.getOrCreateGuild(guildId);

    return (await prisma.guild.update({
      where: { id: guildId },
      data: updates,
    })) as unknown as PrismaGuild;
  }

  public static async getOrCreateModerationSettings(
    guildId: string,
  ): Promise<PrismaGuild> {
    return await ModerationService.getOrCreateGuild(guildId);
  }

  public static async getGuild(guildId: string): Promise<PrismaGuild | null> {
    return (await prisma.guild.findUnique({
      where: { id: guildId },
    })) as unknown as PrismaGuild | null;
  }

  public static async createModCase(
    data: Omit<ModCaseData, "caseNumber">,
  ): Promise<PrismaModCase> {
    const lastCase = await prisma.modCases.findFirst({
      where: { guildId: data.guildId },
      orderBy: { caseNumber: "desc" },
    });

    const nextCaseNumber = (lastCase?.caseNumber || 0) + 1;

    return (await prisma.modCases.create({
      data: {
        caseNumber: nextCaseNumber,
        TargetUserID: data.targetUserID,
        ModeratorUserID: data.moderatorUserID,
        action: data.action,
        reason: data.reason,
        guildId: data.guildId,
      },
    })) as unknown as PrismaModCase;
  }

  public static async getModCases(
    guildId: string,
    limit = 10,
  ): Promise<PrismaModCase[]> {
    return (await prisma.modCases.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })) as unknown as PrismaModCase[];
  }

  public static async getUserModCases(
    guildId: string,
    userId: string,
  ): Promise<PrismaModCase[]> {
    return (await prisma.modCases.findMany({
      where: {
        guildId,
        TargetUserID: userId,
      },
      orderBy: { createdAt: "desc" },
    })) as unknown as PrismaModCase[];
  }

  public static async sendToModLog(
    guildId: string,
    payload: { embeds: DiscordEmbedBuilder[] },
  ): Promise<void> {
    try {
      const guild = await ModerationService.getGuild(guildId);

      if (!guild?.modLogWebhookUrl) {
        return;
      }

      const response = await fetch(guild.modLogWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          embeds: payload.embeds.map((embed) => embed.toJSON()),
        }),
      });

      if (!response.ok) {
        console.error(
          `Failed to send moderation log: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      console.error("Error sending to moderation log:", error);
    }
  }

  public async hasModPermissions(
    guildId: string,
    member: GuildMember,
  ): Promise<boolean> {
    const guild = await ModerationService.getGuild(guildId);

    if (member.permissions.has("Administrator")) {
      return true;
    }

    if (
      member.permissions.has(["BanMembers", "KickMembers", "ModerateMembers"])
    ) {
      return true;
    }

    if (guild?.modRoleId && member.roles.cache.has(guild.modRoleId)) {
      return true;
    }

    return false;
  }

  public async logModerationAction(
    client: Client,
    action: ModerationAction,
  ): Promise<PrismaModCase> {
    try {
      const modCase = await ModerationService.createModCase({
        targetUserID: action.target.id,
        moderatorUserID: action.moderator.id,
        action: action.type,
        reason: action.reason || "No reason provided",
        guildId: action.guild.id,
      });

      const guild = await ModerationService.getGuild(action.guild.id);
      if (!guild || !guild.modLogWebhookUrl) {
        return modCase;
      }

      const embed = modActionEmbedBuilderFunction(
        action,
        modCase.caseNumber,
        modCase.createdAt,
      );

      let WClient = this.WebhookClientMap.get(guild.id);

      if (!WClient && guild.modLogWebhookUrl) {
        WClient = new WebhookClient({ url: guild.modLogWebhookUrl });
        this.WebhookClientMap.set(guild.id, WClient);
      }

      if (WClient) {
        await WClient.send({
          username: `${client.user?.username} • Moderation Log`,
          avatarURL: client.user?.avatarURL() as string | undefined,
          embeds: [embed],
        });
      }

      return modCase;
    } catch (error) {
      console.error("Error logging moderation action:", error);
      throw error;
    }
  }

  public static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  public parseDuration(duration: string): number | null {
    const regex = /^(\d+)([smhd])$/;
    const match = duration.toLowerCase().match(regex);

    if (!match || !match[1] || !match[2]) return null;

    const value = Number.parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        return null;
    }
  }
}

export function modActionEmbedBuilderFunction(
  action: ModerationAction,
  caseNumber?: number,
  createdAt?: Date,
): DiscordEmbedBuilder {
  const timestamp = createdAt || new Date();

  const embed = new DiscordEmbedBuilder().setTimestamp(timestamp).setFooter({
    text: `${caseNumber ? `Case #${caseNumber} • ` : ""}Target ID: ${
      action.target.id
    } • Moderator ID: ${action.moderator.id}`,
  });

  const baseFields = [
    {
      name: "🎯 Target User",
      value: `${action.target.tag}\n<@${action.target.id}>`,
      inline: true,
    },
    {
      name: "👮 Moderator",
      value: `${action.moderator.tag}\n<@${action.moderator.id}>`,
      inline: true,
    },
  ];

  if (caseNumber) {
    baseFields.unshift({
      name: "📋 Case Number",
      value: `#${caseNumber}`,
      inline: true,
    });
  }

  switch (action.type) {
    case "BAN":
      embed
        .setTitle("🔨 Member Banned")
        .setColor(0xff0000)
        .addFields(...baseFields, {
          name: "📝 Reason",
          value: action.reason || "No reason provided",
          inline: false,
        });
      break;

    case "KICK":
      embed
        .setTitle("👢 Member Kicked")
        .setColor(0xff8c00)
        .addFields(...baseFields, {
          name: "📝 Reason",
          value: action.reason || "No reason provided",
          inline: false,
        });
      break;

    case "TIMEOUT": {
      const duration = action.duration
        ? ModerationService.formatDuration(action.duration)
        : "Unknown duration";
      embed
        .setTitle("⏰ Member Timed Out")
        .setColor(0xffa500)
        .addFields(
          ...baseFields,
          {
            name: "⏱️ Duration",
            value: duration,
            inline: true,
          },
          {
            name: "📝 Reason",
            value: action.reason || "No reason provided",
            inline: false,
          },
        );
      break;
    }

    case "UNTIMEOUT":
      embed
        .setTitle("✅ Timeout Removed")
        .setColor(0x00ff00)
        .addFields(...baseFields, {
          name: "📝 Reason",
          value: action.reason || "No reason provided",
          inline: false,
        });
      break;

    case "WARN":
      embed
        .setTitle("⚠️ Member Warned")
        .setColor(0xffff00)
        .addFields(...baseFields, {
          name: "📝 Reason",
          value: action.reason || "No reason provided",
          inline: false,
        });
      break;

    case "HACKBAN":
      embed
        .setTitle("🔨 User Hackbanned")
        .setColor(0x8b0000)
        .addFields(...baseFields, {
          name: "📝 Reason",
          value: action.reason || "No reason provided",
          inline: false,
        });
      break;

    case "UNBAN":
      embed
        .setTitle("🔓 User Unbanned")
        .setColor(0x00ff00)
        .addFields(...baseFields, {
          name: "📝 Reason",
          value: action.reason || "No reason provided",
          inline: false,
        });
      break;

    default:
      embed
        .setTitle("⚖️ Moderation Action")
        .setColor(0x808080)
        .addFields(
          {
            name: "⚡ Action Type",
            value: action.type,
            inline: true,
          },
          ...baseFields,
          {
            name: "📝 Reason",
            value: action.reason || "No reason provided",
            inline: false,
          },
        );
      break;
  }

  return embed;
}
