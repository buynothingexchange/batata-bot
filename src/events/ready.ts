import { ActivityType, type Client, Events } from "discord.js";

export default {
  name: Events.ClientReady,
  once: true,

  execute: async (client: Client) => {
    console.log(`Logged in as ${client.user?.tag}`);

    // initializeMusicManager(client);

    client.user?.setActivity({
      name: "HarshPatel5940 creating bots",
      type: ActivityType.Watching,
    });
  },
};
