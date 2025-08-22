import {
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
import type { Command } from "../interface/command.js";

export default {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Manage slowmode for text channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(subcommand =>
      subcommand
        .setName("set")
        .setDescription("Set slowmode for a channel")
        .addIntegerOption(option =>
          option
            .setName("minutes")
            .setDescription("Slowmode duration in minutes (0 to remove)")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(360),
        )
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription(
              "The channel to set slowmode for (defaults to current)",
            )
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove slowmode from a channel")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription(
              "The channel to remove slowmode from (defaults to current)",
            )
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return await interaction.reply({
        content: "❌ This command can only be used in a server!",
        ephemeral: true,
      });
    }

    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
    ) {
      return await interaction.reply({
        content:
          "❌ You need the **Manage Channels** permission to use this command!",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "set":
          await handleSetSlowmode(interaction);
          break;
        case "remove":
          await handleRemoveSlowmode(interaction);
          break;
        default:
          await interaction.reply({
            content: "❌ Unknown subcommand!",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("Error in slowmode command:", error);
      await interaction.reply({
        content: "❌ An error occurred while managing slowmode!",
        ephemeral: true,
      });
    }
  },
} as Command;

async function handleSetSlowmode(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const minutes = interaction.options.getInteger("minutes", true);
  const targetChannel =
    (interaction.options.getChannel("channel") as TextChannel) ||
    (interaction.channel as TextChannel);

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    return await interaction.reply({
      content: "❌ Invalid channel! Please select a text channel.",
      ephemeral: true,
    });
  }
  const botMember = interaction.guild.members.me;

  if (
    !botMember ||
    !botMember.permissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    return await interaction.reply({
      content: "❌ I don't have permission to manage channels!",
      ephemeral: true,
    });
  }

  const seconds = minutes * 60;

  try {
    await targetChannel.setRateLimitPerUser(seconds);

    const embed = new EmbedBuilder()
      .setColor(minutes === 0 ? 0x00ff00 : 0xffa500)
      .setTitle(minutes === 0 ? "🚀 Slowmode Removed" : "🐌 Slowmode Set")
      .addFields([
        {
          name: "📂 Channel",
          value: `${targetChannel}`,
          inline: true,
        },
        {
          name: "⏱️ Duration",
          value:
            minutes === 0
              ? "Removed"
              : `${minutes} minute${minutes !== 1 ? "s" : ""}`,
          inline: true,
        },
        {
          name: "👮 Moderator",
          value: `${interaction.user}`,
          inline: true,
        },
      ])
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error setting slowmode:", error);
    await interaction.reply({
      content: "❌ Failed to set slowmode. Please check my permissions!",
      ephemeral: true,
    });
  }
}

async function handleRemoveSlowmode(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const targetChannel =
    (interaction.options.getChannel("channel") as TextChannel) ||
    (interaction.channel as TextChannel);

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    return await interaction.reply({
      content: "❌ Invalid channel! Please select a text channel.",
      ephemeral: true,
    });
  }

  const botMember = interaction.guild.members.me;

  if (
    !botMember ||
    !botMember.permissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    return await interaction.reply({
      content: "❌ I don't have permission to manage channels!",
      ephemeral: true,
    });
  }

  try {
    await targetChannel.setRateLimitPerUser(0);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🚀 Slowmode Removed")
      .addFields([
        {
          name: "📂 Channel",
          value: `${targetChannel}`,
          inline: true,
        },
        {
          name: "👮 Moderator",
          value: `${interaction.user}`,
          inline: true,
        },
      ])
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error removing slowmode:", error);
    await interaction.reply({
      content: "❌ Failed to remove slowmode. Please check my permissions!",
      ephemeral: true,
    });
  }
}
