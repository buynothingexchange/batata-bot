const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Learn about Buy Nothing Exchange and our community values'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71) // Soft green
      .setTitle('🌱 Welcome to Buy Nothing Exchange')
      .setDescription(
        `*Buy Nothing Exchange* is a **passion project** rooted in the principles of a gift economy — a space to **give freely**, **receive gratefully**, and **connect meaningfully**.

Whether you're ✨ offering something you no longer need, 🧩 searching for a useful item, or 🌍 simply looking to connect — our goal is to build a community centered on **generosity, sustainability, and humanism**.`
      )
      .addFields(
        {
          name: '🎁 Why Gifts Matter',
          value: `Here, the **value of a gift** lies in the *intention behind it*.  
By sharing instead of discarding, we reduce waste and promote mindful consumption.`,
          inline: false
        },
        {
          name: '🌟 Beyond Things',
          value: `We also welcome the giving of **time, skills, and ideas** —  
anything that brings people together in a spirit of *mutual aid*, *care*, and *abundance*.`,
          inline: false
        },
        {
          name: '🤝 Our Vision',
          value: `By giving and receiving without obligation,  
we make space for **deeper relationships**, **kindness**, and a more **connected way of living**.`,
          inline: false
        }
      )
      .setThumbnail('https://i.imgur.com/HU5k5NB.png')
      .setImage('https://i.imgur.com/tGbaZCY.png')
      .setFooter({ 
        text: '💚 Join us in co-creating a space where giving is joyful and community is everything.', 
        iconURL: 'https://i.imgur.com/HU5k5NB.png'
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
};