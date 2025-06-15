const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aboutus')
    .setDescription('Learn what this community is all about'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#2ECC71') // Green color
      .setTitle('💚 About Buy Nothing Exchange')
      .setDescription(
        "Buy Nothing Exchange is a passion project that aims to create a space rooted in the principles of a gift economy, where we have the ability to not only trade items and services, but also give freely without expecting anything in return. Whether you're offering something you no longer need, searching for a useful item, or simply looking to connect, our goal is to create a community built on generosity, sustainability, and humanism. We hope to connect you with people who share these similar values.\n\n" +
        "Here, the value of a gift lies in the intention behind it. By sharing instead of discarding, we reduce waste and promote mindful consumption. But beyond physical goods, we also encourage the sharing of time, skills, and ideas; whatever brings people together in a spirit of mutual aid, care and abundance.\n\n" +
        "We believe that by giving and receiving without obligation, we make room for deeper relationships, kindness, and a more connected way of living.\n\n" +
        "Join us in co-creating a space where giving is joyful and community is everything."
      );

    await interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
