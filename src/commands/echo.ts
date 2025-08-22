import {
  ActionRowBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type SlashCommandChannelOption,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { Command } from "../interface";

export default {
  data: new SlashCommandBuilder()
    .setName("echo")
    .setDescription("Announce a message to a channel")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((option: SlashCommandChannelOption) => {
      return option
        .setName("channel")
        .setDescription("Channel to announce to")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
    })
    .addRoleOption(option =>
      option
        .setName("mention")
        .setDescription("Who to mention")
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const channelId = (interaction.options.getChannel("channel")?.id ||
      interaction.channelId) as string;
    const mention = interaction.options.getRole("mention") || "none";
    const Title = new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Provide us with the Title")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(50);
    const Description = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Provide us with some Description")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1900);

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(Title);
    const secondActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(Description);
    const modal = new ModalBuilder()
      .setCustomId(`echo-${channelId}-${mention}`)
      .setTitle("Echo Modal");
    modal.addComponents(firstActionRow, secondActionRow);
    await interaction.showModal(modal);
  },
} as Command;
