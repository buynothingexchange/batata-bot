import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { invalidateVerificationCache } from "../events/handleVerification.js";
import type { Command } from "../interface/command.js";
import prisma from "../utils/prisma.js";

export default {
  data: new SlashCommandBuilder()
    .setName("verification")
    .setDescription("Manage verification system for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName("setup")
        .setDescription("Setup the verification system")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel where verification embed will be sent")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("Role to give users after verification")
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName("mode")
            .setDescription("Verification mode")
            .setRequired(true)
            .addChoices(
              { name: "Instant (Click button to verify)", value: "INSTANT" },
              { name: "Captcha (Solve captcha to verify)", value: "CAPTCHA" },
            ),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("disable")
        .setDescription("Disable the verification system"),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("status")
        .setDescription("View current verification settings"),
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
        case "setup":
          await handleSetup(interaction);
          break;
        case "disable":
          await handleDisable(interaction);
          break;
        case "status":
          await handleStatus(interaction);
          break;
        default:
          await interaction.reply({
            content: "❌ Unknown subcommand!",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("Error in verification command:", error);
      if (!interaction.replied) {
        await interaction.reply({
          content: "❌ An error occurred while processing your request!",
          ephemeral: true,
        });
      }
    }
  },
} as Command;

async function handleSetup(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel("channel", true);
  const role = interaction.options.getRole("role", true);
  const mode = interaction.options.getString("mode", true) as
    | "INSTANT"
    | "CAPTCHA";

  if (!interaction.guild) return;

  try {
    await prisma.guild.upsert({
      where: { id: interaction.guild.id },
      update: {
        verificationChannelId: channel.id,
        verificationRoleId: role.id,
        verificationMode: mode,
        verificationEnabled: true,
      },
      create: {
        id: interaction.guild.id,
        name: interaction.guild.name,
        verificationChannelId: channel.id,
        verificationRoleId: role.id,
        verificationMode: mode,
        verificationEnabled: true,
      },
    });

    invalidateVerificationCache(interaction.guild.id);

    const embed = new EmbedBuilder()
      .setTitle("🔐 Server Verification")
      .setDescription(
        mode === "INSTANT"
          ? "Click the button below to get verified and gain access to the server!"
          : "Click the button below to start the verification process. You'll need to solve a captcha to get verified!",
      )
      .setColor(0x00ff00)
      .setFooter({ text: "Verification System" })
      .setTimestamp();

    const button = new ButtonBuilder()
      .setCustomId("verify-button")
      .setLabel("✅ Verify")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    const targetChannel = await interaction.guild.channels.fetch(channel.id);
    if (targetChannel?.isTextBased()) {
      await targetChannel.send({
        embeds: [embed],
        components: [row],
      });
    }

    const guildData = await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
      select: { serverLogChannelID: true },
    });

    if (guildData?.serverLogChannelID) {
      const logChannel = await interaction.guild.channels.fetch(
        guildData.serverLogChannelID,
      );
      if (logChannel?.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setTitle("🔐 Verification System Setup")
          .setDescription(
            `**Channel:** ${channel}\n` +
              `**Role:** ${role}\n` +
              `**Mode:** ${mode}\n` +
              `**Setup by:** ${interaction.user}`,
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    }

    await interaction.reply({
      content: `✅ Verification system has been set up!

**Channel:** ${channel}
**Role:** ${role}
**Mode:** ${mode}

The verification embed has been sent to ${channel}.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error setting up verification:", error);
    await interaction.reply({
      content: "❌ Failed to set up verification system!",
      ephemeral: true,
    });
  }
}

async function handleDisable(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  try {
    await prisma.guild.update({
      where: { id: interaction.guild.id },
      data: {
        verificationEnabled: false,
        verificationChannelId: null,
        verificationRoleId: null,
      },
    });

    invalidateVerificationCache(interaction.guild.id);

    const guildData = await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
      select: { serverLogChannelID: true },
    });

    if (guildData?.serverLogChannelID) {
      const logChannel = await interaction.guild.channels.fetch(
        guildData.serverLogChannelID,
      );
      if (logChannel?.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setTitle("🔐 Verification System Disabled")
          .setDescription(`**Disabled by:** ${interaction.user}`)
          .setColor(0xff0000)
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    }

    await interaction.reply({
      content: "✅ Verification system has been disabled!",
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error disabling verification:", error);
    await interaction.reply({
      content: "❌ Failed to disable verification system!",
      ephemeral: true,
    });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  try {
    const guildData = await prisma.guild.findUnique({
      where: { id: interaction.guild.id },
      select: {
        verificationEnabled: true,
        verificationChannelId: true,
        verificationRoleId: true,
        verificationMode: true,
      },
    });

    if (!guildData || !guildData.verificationEnabled) {
      return await interaction.reply({
        content: "❌ Verification system is not enabled!",
        ephemeral: true,
      });
    }

    const channel = guildData.verificationChannelId
      ? await interaction.guild.channels.fetch(guildData.verificationChannelId)
      : null;
    const role = guildData.verificationRoleId
      ? await interaction.guild.roles.fetch(guildData.verificationRoleId)
      : null;

    const embed = new EmbedBuilder()
      .setTitle("🔐 Verification System Status")
      .setDescription(
        `**Status:** ${
          guildData.verificationEnabled ? "✅ Enabled" : "❌ Disabled"
        }\n` +
          `**Channel:** ${channel ? channel : "Not set"}\n` +
          `**Role:** ${role ? role : "Not set"}\n` +
          `**Mode:** ${guildData.verificationMode || "Not set"}`,
      )
      .setColor(guildData.verificationEnabled ? 0x00ff00 : 0xff0000)
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error getting verification status:", error);
    await interaction.reply({
      content: "❌ Failed to get verification status!",
      ephemeral: true,
    });
  }
}
