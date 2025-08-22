import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../interface";
import {
  ModActionType,
  type ModerationAction,
  ModerationService,
} from "../service-classes/ModHelper";

export default {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout or remove timeout from a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Timeout a user")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("The user to timeout")
            .setRequired(true),
        )
        .addIntegerOption(option =>
          option
            .setName("duration")
            .setDescription("Duration in minutes (1-40320, max 28 days)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320),
        )
        .addStringOption(option =>
          option
            .setName("reason")
            .setDescription("Reason for the timeout")
            .setRequired(false),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove timeout from a user")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("The user to remove timeout from")
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName("reason")
            .setDescription("Reason for removing the timeout")
            .setRequired(false),
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

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      await handleTimeoutAdd(interaction);
    } else if (subcommand === "remove") {
      await handleTimeoutRemove(interaction);
    }
  },
} as Command;

async function handleTimeoutAdd(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const user = interaction.options.getUser("user", true);
  const duration = interaction.options.getInteger("duration", true);
  const reason =
    interaction.options.getString("reason") || "No reason provided";

  let member: GuildMember;
  try {
    member = await interaction.guild.members.fetch(user.id);
  } catch {
    return await interaction.reply({
      content: "❌ User is not in this server!",
      ephemeral: true,
    });
  }

  const executor = interaction.member as GuildMember;
  if (member.id === interaction.user.id) {
    return await interaction.reply({
      content: "❌ You cannot timeout yourself!",
      ephemeral: true,
    });
  }

  if (member.id === interaction.guild.ownerId) {
    return await interaction.reply({
      content: "❌ You cannot timeout the server owner!",
      ephemeral: true,
    });
  }

  if (
    member.roles.highest.position >= executor.roles.highest.position &&
    interaction.user.id !== interaction.guild.ownerId
  ) {
    return await interaction.reply({
      content: "❌ You cannot timeout someone with a higher or equal role!",
      ephemeral: true,
    });
  }

  if (!member.moderatable) {
    return await interaction.reply({
      content:
        "❌ I cannot timeout this user! They may have higher permissions than me.",
      ephemeral: true,
    });
  }

  try {
    const timeoutUntil = new Date(Date.now() + duration * 60 * 1000);

    await member.timeout(
      duration * 60 * 1000,
      `${reason} | Timed out by ${interaction.user.tag}`,
    );

    const moderationService = new ModerationService();
    const moderationAction = {
      type: ModActionType.TIMEOUT,
      target: user,
      moderator: interaction.user,
      reason,
      guild: interaction.guild,
      duration: duration * 60 * 1000,
    };

    const modCase = await moderationService.logModerationAction(
      interaction.client,
      moderationAction,
    );

    const responseEmbed = new EmbedBuilder()
      .setTitle("⏰ Timeout Applied Successfully")
      .setColor(0x00ff00)
      .addFields(
        {
          name: "📋 Case Number",
          value: `#${modCase.caseNumber}`,
          inline: true,
        },
        {
          name: "🎯 Timed Out User",
          value: `${user.tag}\n<@${user.id}>`,
          inline: true,
        },
        {
          name: "👮 Moderator",
          value: `${interaction.user.tag}\n<@${interaction.user.id}>`,
          inline: true,
        },
        {
          name: "⏱️ Duration",
          value: `${duration} minute${duration === 1 ? "" : "s"}`,
          inline: true,
        },
        {
          name: "⏰ Expires At",
          value: `<t:${Math.floor(timeoutUntil.getTime() / 1000)}:F>`,
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
        text: `Target ID: ${user.id} • Moderator ID: ${interaction.user.id}`,
      });

    await interaction.reply({
      embeds: [responseEmbed],
    });
  } catch (error) {
    console.error("Error timing out user:", error);
    await interaction.reply({
      content:
        "❌ Failed to timeout the user. Please check my permissions and try again.",
      ephemeral: true,
    });
  }
}

async function handleTimeoutRemove(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const user = interaction.options.getUser("user", true);
  const reason =
    interaction.options.getString("reason") || "No reason provided";

  let member: GuildMember;
  try {
    member = await interaction.guild.members.fetch(user.id);
  } catch {
    return await interaction.reply({
      content: "❌ User is not in this server!",
      ephemeral: true,
    });
  }

  if (
    !member.communicationDisabledUntil ||
    member.communicationDisabledUntil < new Date()
  ) {
    return await interaction.reply({
      content: "❌ This user is not currently timed out!",
      ephemeral: true,
    });
  }

  const executor = interaction.member as GuildMember;
  if (
    member.roles.highest.position >= executor.roles.highest.position &&
    interaction.user.id !== interaction.guild.ownerId
  ) {
    return await interaction.reply({
      content:
        "❌ You cannot remove timeout from someone with a higher or equal role!",
      ephemeral: true,
    });
  }

  if (!member.moderatable) {
    return await interaction.reply({
      content:
        "❌ I cannot remove timeout from this user! They may have higher permissions than me.",
      ephemeral: true,
    });
  }

  try {
    await member.timeout(
      null,
      `${reason} | Timeout removed by ${interaction.user.tag}`,
    );

    const moderationService = new ModerationService();
    const moderationAction = {
      type: ModActionType.UNTIMEOUT,
      target: user,
      moderator: interaction.user,
      reason,
      guild: interaction.guild,
    };

    const modCase = await moderationService.logModerationAction(
      interaction.client,
      moderationAction,
    );

    const responseEmbed = new EmbedBuilder()
      .setTitle("✅ Timeout Removed Successfully")
      .setColor(0x00ff00)
      .addFields(
        {
          name: "📋 Case Number",
          value: `#${modCase.caseNumber}`,
          inline: true,
        },
        {
          name: "🎯 User",
          value: `${user.tag}\n<@${user.id}>`,
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
        text: `Target ID: ${user.id} • Moderator ID: ${interaction.user.id}`,
      });

    await interaction.reply({
      embeds: [responseEmbed],
    });
  } catch (error) {
    console.error("Error removing timeout:", error);
    await interaction.reply({
      content:
        "❌ Failed to remove timeout. Please check my permissions and try again.",
      ephemeral: true,
    });
  }
}
