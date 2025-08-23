import type { Guild as pGuild } from "@prisma/client";
import type { JsonValue } from "@prisma/client/runtime/client";
import type { InputJsonValue } from "@prisma/client/runtime/client";
import type { JsonArray } from "@prisma/client/runtime/library";
import {
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  PermissionFlagsBits,
  type Role,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
import type { Command } from "../interface/command.js";
import { ModerationService } from "../service-classes/ModHelper.js";
import prisma from "../utils/prisma.js";

export default {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock down channels to prevent messaging")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set the main role for lockdown system")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The main role that should have send permissions")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lock-channel")
        .setDescription("Lock down a specific channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to lock down (defaults to current)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lock-server")
        .setDescription("Lock down the entire server using the main role"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lock-server-forced")
        .setDescription("Force lock down every single channel"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unlock")
        .setDescription("Unlock a channel or the entire server")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              "The channel to unlock (leave empty to unlock server)",
            )
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      return await interaction.reply({
        content: "❌ This command can only be used in a server!",
        ephemeral: true,
      });
    }

    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
    ) {
      return await interaction.reply({
        content:
          "❌ You need the **Manage Channels** permission to use this command!",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case "setup":
          await handleSetup(interaction);
          break;
        case "lock-channel":
          await handleChannelLockdown(interaction);
          break;
        case "lock-server":
          await handleServerLockdown(interaction);
          break;
        case "lock-server-forced":
          await handleForcedServerLockdown(interaction);
          break;
        case "unlock":
          await handleUnlock(interaction);
          break;
        default:
          await interaction.reply({
            content: "❌ Unknown subcommand!",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("Error in lockdown command:", error);
      await interaction.reply({
        content: "❌ An error occurred while managing lockdown!",
        ephemeral: true,
      });
    }
  },
} as Command;

async function handleSetup(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const mainRole = interaction.options.getRole("role", true) as Role;

  await interaction.deferReply();

  try {
    await ModerationService.getOrCreateGuild(interaction.guild.id);
    await prisma.guild.update({
      where: { id: interaction.guild.id },
      data: { mainRoleId: mainRole.id },
    });

    let modifiedRoles = 0;
    let modifiedChannels = 0;

    for (const [_, role] of interaction.guild.roles.cache) {
      const currentPermissions = role.permissions;

      if (role.id === mainRole.id) {
        await role.setPermissions(
          currentPermissions.add([
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ViewChannel,
          ]),
        );
        continue;
      }

      try {
        if (
          currentPermissions.has(PermissionFlagsBits.SendMessages) ||
          currentPermissions.has(PermissionFlagsBits.ViewChannel) ||
          currentPermissions.has(PermissionFlagsBits.SendMessagesInThreads)
        ) {
          try {
            await role.setPermissions(
              currentPermissions.remove([
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ViewChannel,
              ]),
              `Lockdown setup by ${interaction.user.tag}`,
            );
            modifiedRoles++;
          } catch {
            // Do nothing for now
          }
        }
      } catch (error) {
        console.log(`Failed to modify role ${role.name}:`, error);
      }
    }

    for (const [_, channel] of interaction.guild.channels.cache) {
      if (
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildCategory
      ) {
        try {
          for (const [_, role] of interaction.guild.roles.cache) {
            const currentPermissions = channel.permissionOverwrites.cache.get(
              role.id,
            );
            const hasExplicitSendMessages = currentPermissions?.allow.has(
              PermissionFlagsBits.SendMessages,
            );
            const hasExplicitViewChannel = currentPermissions?.allow.has(
              PermissionFlagsBits.ViewChannel,
            );

            if (hasExplicitSendMessages || hasExplicitViewChannel) {
              const updates: Record<string, boolean | null> = {};
              if (hasExplicitSendMessages) updates.SendMessages = null;
              if (hasExplicitViewChannel) updates.ViewChannel = null;

              try {
                await channel.permissionOverwrites.edit(role, updates);
                modifiedChannels++;
              } catch {
                // Do nothing for now
              }
            }
          }
        } catch (error) {
          console.log(`Failed to modify channel ${channel.name}:`, error);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🔧 Lockdown Setup Complete")
      .addFields([
        {
          name: "🎭 Main Role Set",
          value: `${mainRole}`,
          inline: true,
        },
        {
          name: "🔧 Roles Modified",
          value: `${modifiedRoles}`,
          inline: true,
        },
        {
          name: "📂 Channels Modified",
          value: `${modifiedChannels}`,
          inline: true,
        },
        {
          name: "📋 What Happened",
          value:
            "• Set main role for lockdown operations\n• Removed Send/View permissions from other roles\n• Cleared explicit channel permissions (set to null)",
          inline: false,
        },
        {
          name: "📋 Next Steps",
          value:
            "You can now use:\n• `/lockdown server` - Lock using main role\n• `/lockdown forced-server` - Force lock all channels",
          inline: false,
        },
      ])
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error in lockdown setup:", error);
    await interaction.editReply({
      content:
        "❌ Failed to complete lockdown setup. Please check my permissions!",
    });
  }
}

async function handleChannelLockdown(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const targetChannel =
    (interaction.options.getChannel("channel") as TextChannel) ||
    (interaction.channel as TextChannel);

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    return await interaction.reply({
      content: "❌ Invalid channel! Please select a text channel.",
      ephemeral: true,
    });
  }

  const botMember = interaction.guild.members.me;

  if (
    !botMember ||
    !botMember.permissions.has(PermissionFlagsBits.ManageChannels)
  ) {
    return await interaction.reply({
      content: "❌ I don't have permission to manage channels!",
      ephemeral: true,
    });
  }

  try {
    await interaction.deferReply();

    const everyoneRole = interaction.guild.roles.everyone;

    const currentPermissions = targetChannel.permissionOverwrites.cache.get(
      everyoneRole.id,
    );
    const currentSendMessages = currentPermissions?.allow.has(
      PermissionFlagsBits.SendMessages,
    );

    await targetChannel.permissionOverwrites.edit(everyoneRole, {
      SendMessages: false,
      SendMessagesInThreads: false,
    });

    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("🔒 Channel Locked")
      .addFields([
        {
          name: "📂 Channel",
          value: `${targetChannel}`,
          inline: true,
        },
        {
          name: "👮 Moderator",
          value: `${interaction.user}`,
          inline: true,
        },
      ])
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error locking channel:", error);
    await interaction.editReply({
      content: "❌ Failed to lock channel. Please check my permissions!",
    });
  }
}

async function handleServerLockdown(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const guildSettings = await ModerationService.getGuild(interaction.guild.id);
  if (!guildSettings?.mainRoleId) {
    return await interaction.reply({
      content:
        "❌ No main role set! Use `/lockdown setup` first to configure the main role.",
      ephemeral: true,
    });
  }

  const mainRole = interaction.guild.roles.cache.get(guildSettings.mainRoleId);
  if (!mainRole) {
    return await interaction.reply({
      content:
        "❌ The configured main role no longer exists! Use `/lockdown setup` to reconfigure.",
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  try {
    let lockedChannels = 0;

    await mainRole.setPermissions(
      mainRole.permissions.remove([
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
      ]),
      `Server lockdown by ${interaction.user.tag}`,
    );

    for (const [_, channel] of interaction.guild.channels.cache) {
      if (
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildCategory
      ) {
        try {
          const currentPermissions = channel.permissionOverwrites.cache.get(
            mainRole.id,
          );

          const currentSendMessages = currentPermissions?.allow.has(
            PermissionFlagsBits.SendMessages,
          );
          const currentViewChannel = currentPermissions?.allow.has(
            PermissionFlagsBits.ViewChannel,
          );

          const CuurentSendMessagesThreads = currentPermissions?.allow.has(
            PermissionFlagsBits.SendMessagesInThreads,
          );

          const updates: Record<string, boolean | null> = {};
          if (currentSendMessages === true) updates.SendMessages = null;
          if (CuurentSendMessagesThreads === true)
            updates.SendMessagesInThreads = null;
          if (currentViewChannel === true) updates.ViewChannel = null;

          if (Object.keys(updates).length > 0) {
            lockedChannels++;
          }
        } catch (error) {
          console.log(`Failed to lock channel ${channel.name}:`, error);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("🔒 Server Locked Down")
      .addFields([
        {
          name: "🎭 Main Role",
          value: `${mainRole}`,
          inline: true,
        },
        {
          name: "📂 Channels Affected",
          value: `${lockedChannels}`,
          inline: true,
        },
        {
          name: "👮 Moderator",
          value: `${interaction.user}`,
          inline: true,
        },
        {
          name: "📋 What Happened",
          value:
            "• Removed Send Messages permission from main role\n• Cleared explicit channel permissions for main role",
          inline: false,
        },
      ])
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error in server lockdown:", error);
    await interaction.editReply({
      content:
        "❌ Failed to complete server lockdown. Please check my permissions!",
    });
  }
}

async function handleForcedServerLockdown(
  interaction: ChatInputCommandInteraction,
) {
  if (!interaction.guild) return;

  await interaction.deferReply();

  try {
    let lockedChannels = 0;
    const everyoneRole = interaction.guild.roles.everyone;
    const channelPerms: JsonArray = [];

    for (const [_, channel] of interaction.guild.channels.cache) {
      const ChannelId = channel.id;
      if (channel.type === ChannelType.GuildText) {
        try {
          const currentPermissions = channel.permissionOverwrites.cache.get(
            everyoneRole.id,
          );
          channelPerms.push({
            channelId: ChannelId,
            SendMessages: currentPermissions?.allow.has(
              PermissionFlagsBits.SendMessages,
            ),
            SendMessagesInThreads: currentPermissions?.allow.has(
              PermissionFlagsBits.SendMessagesInThreads,
            ),
          });

          await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: false,
            SendMessagesInThreads: false,
          });
          lockedChannels++;
        } catch (error) {
          console.log(`Failed to force lock channel ${channel.name}:`, error);
        }
      }
    }

    await prisma.guild.update({
      where: { id: interaction.guild.id },
      data: {
        IsForceLockdown: true,
        ForcedLockdownArray: channelPerms as InputJsonValue[],
      },
    });

    const embed = new EmbedBuilder()
      .setColor(0x8b0000)
      .setTitle("🔒 Server Force Locked")
      .addFields([
        {
          name: "📂 Channels Locked",
          value: `${lockedChannels}`,
          inline: true,
        },
        {
          name: "👮 Moderator",
          value: `${interaction.user}`,
          inline: true,
        },
        {
          name: "⚠️ Notice",
          value:
            "All text channels have been force locked with explicit deny permissions.",
          inline: false,
        },
      ])
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error in forced server lockdown:", error);
    await interaction.editReply({
      content:
        "❌ Failed to complete forced server lockdown. Please check my permissions!",
    });
  }
}

async function handleUnlock(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const targetChannel = interaction.options.getChannel(
    "channel",
  ) as TextChannel;
  await interaction.deferReply();

  try {
    if (targetChannel) {
      await handleSingleChannelUnlock(interaction, targetChannel);
    } else {
      await handleServerUnlock(interaction);
    }
  } catch (error) {
    console.error("Error unlocking:", error);
    await interaction.editReply({
      content: "❌ Failed to unlock. Please check my permissions!",
    });
  }
}

async function handleSingleChannelUnlock(
  interaction: ChatInputCommandInteraction,
  targetChannel: TextChannel,
) {
  if (!interaction.guild) return;

  if (targetChannel.type !== ChannelType.GuildText) {
    return await interaction.editReply({
      content: "❌ Invalid channel! Please select a text channel.",
    });
  }

  const everyoneRole = interaction.guild.roles.everyone;
  await targetChannel.permissionOverwrites.edit(everyoneRole, {
    SendMessages: null,
  });

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🔓 Channel Unlocked")
    .addFields([
      {
        name: "📂 Channel",
        value: `${targetChannel}`,
        inline: true,
      },
      {
        name: "👮 Moderator",
        value: `${interaction.user}`,
        inline: true,
      },
    ])
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleServerUnlock(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const everyoneRole = interaction.guild.roles.everyone;

  const TGuild = await prisma.guild.findUnique({
    where: { id: interaction.guild.id },
  });

  if (!TGuild?.mainRoleId) return;
  await restoreMainRolePermissions(interaction, TGuild);

  if (!TGuild.ForcedLockdownArray) return;

  const guildChannelPerms = Array.isArray(TGuild.ForcedLockdownArray)
    ? TGuild.ForcedLockdownArray
    : [];

  const unlockedChannels = await unlockAllChannels(
    interaction.guild,
    everyoneRole,
    guildChannelPerms,
  );

  if (unlockedChannels === 0) {
    await interaction.editReply({
      content: "❌ No channels were unlocked.",
    });
    return;
  }

  if (Array.isArray(guildChannelPerms) && guildChannelPerms.length) {
    await prisma.guild.update({
      where: { id: interaction.guild.id },
      data: {
        IsForceLockdown: false,
        ForcedLockdownArray: [],
      },
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🔓 Server Unlocked")
    .addFields([
      {
        name: "📂 Channels Unlocked",
        value: `${unlockedChannels}`,
        inline: true,
      },
      {
        name: "👮 Moderator",
        value: `${interaction.user}`,
        inline: true,
      },
    ])
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function restoreMainRolePermissions(
  interaction: ChatInputCommandInteraction,
  tGuild: pGuild,
) {
  if (!interaction.guild || !tGuild?.mainRoleId) return;

  const mainRole = interaction.guild.roles.cache.get(tGuild.mainRoleId);
  if (mainRole) {
    await mainRole.setPermissions(
      mainRole.permissions.add([
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ViewChannel,
      ]),
      `Server unlock by ${interaction.user.tag}`,
    );
  }
}

async function unlockAllChannels(
  guild: Guild,
  everyoneRole: Role,
  guildChannelPerms: JsonValue[],
): Promise<number> {
  let unlockedChannels = 0;
  const PermChannelArray = guildChannelPerms as {
    channelId: string;
    SendMessages: boolean | null;
    SendMessagesInThreads: boolean | null;
  }[];
  const hasForcedLockdownData = guildChannelPerms.length > 0;

  for (const [_, channel] of guild.channels.cache) {
    if (channel.type !== ChannelType.GuildText) continue;

    try {
      if (hasForcedLockdownData) {
        const savedPerms = PermChannelArray.find((item) => {
          return item.channelId === channel.id;
        });
        if (savedPerms) {
          await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: savedPerms.SendMessages,
            SendMessagesInThreads: savedPerms.SendMessagesInThreads,
          });
          unlockedChannels++;
        }
      } else {
        await channel.permissionOverwrites.edit(everyoneRole, {
          SendMessages: null,
          SendMessagesInThreads: null,
        });
        unlockedChannels++;
      }
    } catch (error) {
      console.log(`Failed to unlock channel ${channel.name}:`, error);
    }
  }

  return unlockedChannels;
}
