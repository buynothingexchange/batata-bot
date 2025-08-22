import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Events,
  type Interaction,
  type Message,
} from "discord.js";

export default {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction: Interaction) {
    if (!interaction.guild) return;
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith("echo-")) return;
    const [action, channelId, mention] = interaction.customId.split("-");
    if (!action || !channelId) return;
    let message: Message;
    const channel = interaction.guild.channels.cache.get(channelId);

    if (!channel) {
      return;
    }

    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      await interaction.reply({
        content: "Invalid Channel Provided. Please Provide a text channel",
      });
      return;
    }
    const createComponent = (
      messageId: string,
    ): ActionRowBuilder<ButtonBuilder> => {
      const delete_message = new ButtonBuilder()
        .setCustomId(`delete--${channelId}-${messageId}`)
        .setLabel("Delete")
        .setStyle(ButtonStyle.Danger);
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        delete_message,
      );
    };

    const title = interaction.fields.getTextInputValue("title");
    const description = interaction.fields.getTextInputValue("description");
    if (mention !== "none") {
      message = await channel.send({
        content: `📢 Announcement ${mention}\n# ${title}\n${description}`,
      });
      await interaction.reply({
        content: `Message sent to <#${channel.id}>`,
        components: [createComponent(message.id)],
        ephemeral: true,
      });
      return;
    }

    message = await channel.send({ content: `# ${title}\n${description}` });
    await interaction.reply({
      content: `Message sent to <#${channel.id}>`,
      components: [createComponent(message.id)],
      ephemeral: true,
    });
  },
};
