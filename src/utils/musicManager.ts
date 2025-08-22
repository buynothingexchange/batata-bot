import type { Client } from "discord.js";
import config from "../config";
import {
  type LavalinkNode,
  MusicManager,
} from "../service-classes/MusicManager";

let musicManager: MusicManager | null = null;

const defaultNodes: LavalinkNode[] = [
  {
    name: "local",
    host: config.LAVALINK.HOST,
    port: config.LAVALINK.PORT,
    password: config.LAVALINK.PASSWORD,
    secure: config.LAVALINK.SECURE,
  },
];

export function initializeMusicManager(
  client: Client,
  nodes?: LavalinkNode[],
): MusicManager {
  if (musicManager) {
    return musicManager;
  }

  const lavalinkNodes = nodes || defaultNodes;
  console.log(
    "🔧 Initializing music manager with nodes:",
    JSON.stringify(lavalinkNodes, null, 2),
  );
  musicManager = new MusicManager(client, lavalinkNodes);

  musicManager.on("nodeReady", node => {
    console.log(`🎵 Music node ${node.name} is ready!`);
  });

  musicManager.on("nodeDisconnect", node => {
    console.warn(`🎵 Music node ${node.name} disconnected!`);
  });

  musicManager.on("nodeError", error => {
    console.error("🎵 Music node error:", error);
  });

  return musicManager;
}

export function getMusicManager(): MusicManager {
  if (!musicManager) {
    throw new Error(
      "Music manager not initialized! Call initializeMusicManager first.",
    );
  }
  return musicManager;
}

export async function destroyMusicManager(): Promise<void> {
  if (musicManager) {
    await musicManager.destroyAll();
    musicManager = null;
  }
}
