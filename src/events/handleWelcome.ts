import {
  ChannelType,
  EmbedBuilder,
  Events,
  type GuildMember,
} from "discord.js";
import { ModerationService } from "../service-classes/ModHelper.js";

export default {
  name: Events.GuildMemberAdd,
  once: false,

  execute: async (member: GuildMember) => {
    try {
      const guildSettings = await ModerationService.getGuild(member.guild.id);

      if (!guildSettings?.welcomeChannelId) {
        return;
      }

      const welcomeChannel = member.guild.channels.cache.get(
        guildSettings.welcomeChannelId,
      );

      if (!welcomeChannel || welcomeChannel.type !== ChannelType.GuildText) {
        return;
      }

      const botMember = member.guild.members.me;

      if (
        !botMember ||
        !botMember.permissionsIn(welcomeChannel).has("SendMessages")
      ) {
        console.warn(
          `Bot does not have permission to send messages in ${welcomeChannel.name}`,
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("👋 Welcome to the Server!")
        .setDescription(`You are member #${member.guild.memberCount}`)
        .addFields([
          {
            name: "🎉 Account Joining",
            value: member.joinedTimestamp
              ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
              : "Unknown",
            inline: true,
          },
          {
            name: "📅 Account Created",
            value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: "📋 Getting Started",
            value: "Make sure to read the rules and enjoy your stay!",
            inline: false,
          },
        ])
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({
          text: `User ID: ${member.id}`,
        });

      await welcomeChannel.send({
        content: `Welcome to **${member.guild.name}**, <@${member.id}>!`,
        embeds: [embed],
      });
    } catch (error) {
      console.error("Error sending welcome message:", error);
    }
  },
};
