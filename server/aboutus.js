const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aboutus')
    .setDescription('Learn what this community is all about'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#2ECC71') // Soft green
      .setTitle('💚 About Buy Nothing Exchange')
      .setDescription(
        "**Buy Nothing Exchange** is a passion project rooted in the principles of a gift economy.\n\n" +
        "Whether you're offering something you no longer need, searching for a useful item, or simply looking to connect, our goal is to build a community based on generosity, sustainability, and humanism.\n\n" +
        "🌱 Share instead of discard — reduce waste and promote mindful consumption.\n" +
        "🤝 Exchange time, skills, ideas, or items in a spirit of mutual aid and abundance.\n\n" +
        "**By giving and receiving without obligation, we create room for connection, kindness, and a more meaningful way to live.**\n\n" +
        "✨ *Join us in co-creating a space where giving is joyful and community is everything.*"
      );

    await interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
