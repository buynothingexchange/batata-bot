import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  VoiceChannel,
} from "discord.js";

export interface MusicCommand {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;

  requiresVoiceChannel?: boolean;
  requiresQueue?: boolean;
  requiresSameVoiceChannel?: boolean;
  requiresPlaying?: boolean;

  autocomplete?(interaction: AutocompleteInteraction): void;
  execute(interaction: ChatInputCommandInteraction): void;
}

export function checkMusicPermissions(
  interaction: ChatInputCommandInteraction,
  command: MusicCommand,
): { success: boolean; error?: string } {
  const member = interaction.member as GuildMember;

  if (command.requiresVoiceChannel && !member.voice.channel) {
    return {
      success: false,
      error: "❌ You need to be in a voice channel to use this command!",
    };
  }

  if (command.requiresSameVoiceChannel) {
    const botVoiceChannel = interaction.guild?.members.me?.voice.channel;
    if (botVoiceChannel && member.voice.channel?.id !== botVoiceChannel.id) {
      return {
        success: false,
        error: "❌ You need to be in the same voice channel as the bot!",
      };
    }
  }

  return { success: true };
}

export function getVoiceChannel(
  interaction: ChatInputCommandInteraction,
): VoiceChannel | null {
  const member = interaction.member as GuildMember;
  return (member.voice.channel as VoiceChannel) || null;
}
