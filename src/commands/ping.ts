import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../interface";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!")
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction) {
    const message = await interaction.reply({
      content: "Pong!",
      withResponse: true,
    });
    await interaction.editReply(
      `Pong! Latency is ${Math.abs(
        Date.now() - message.interaction.createdTimestamp,
      )}ms.`,
    );
  },
} as Command;
