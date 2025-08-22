import { Events, type Message, type TextChannel } from "discord.js";
import prisma from "../utils/prisma.js";

export const counterCache = new Map<
  string,
  { current: number; goal: number; channelId: string | null }
>();

async function getCounterData(guildId: string) {
  let cached = counterCache.get(guildId);
  if (!cached) {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
    });

    if (!guild) return null;
    cached = {
      current: guild.CurrentCounter ?? 0,
      goal: guild.GoalCounter ?? 100,
      channelId: guild.CounterChannelId,
    };
    counterCache.set(guildId, cached);
  }
  return cached;
}

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message: Message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const channelId = message.channelId;

    try {
      const counterData = await getCounterData(guildId);
      if (!counterData || counterData.channelId !== channelId) return;

      const messageContent = message.content.trim();
      const inputNumber = Number.parseInt(messageContent, 10);

      if (Number.isNaN(inputNumber) || inputNumber <= 0) return;

      const expectedNumber = counterData.current + 1;

      if (inputNumber === expectedNumber) {
        await message.react("✅");

        counterData.current = inputNumber;
        counterCache.set(guildId, counterData);

        await prisma.guild.update({
          where: { id: guildId },
          data: { CurrentCounter: inputNumber },
        });

        if (inputNumber >= counterData.goal) {
          const channel = message.channel as TextChannel;
          await channel.send({
            content: `🎉 **Congratulations!** The server has reached the goal of **${
              counterData.goal
            }**! 🎉  New Goal Set to ${counterData.goal + 500}`,
          });

          counterCache.set(guildId, {
            current: counterData.current,
            goal: counterData.goal + 500,
            channelId: counterData.channelId,
          });

          await prisma.guild.update({
            where: { id: guildId },
            data: {
              CurrentCounter: counterData.current,
              GoalCounter: counterData.goal + 500,
            },
          });
        }
      } else {
        await message.react("❌");
      }
    } catch (error) {
      console.error("Error in counter game handler:", error);
    }
  },
};
