import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../interface";
import { getCommands } from "../utils";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Get help with using the bot"),
  async execute(interaction: ChatInputCommandInteraction) {
    const commands = getCommands();
    const embed = new EmbedBuilder()
      .setTitle("Help")
      .setDescription("Here are the commands available to you")
      .setColor("Green")
      .setTimestamp();

    commands.map(command => {
      embed.addFields({
        name: `/${command.data.name}`,
        value: command.data.description,
        inline: true,
      });
    });

    await interaction.reply({ embeds: [embed] });
  },
} as Command;
