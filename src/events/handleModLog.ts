import { type Client, Events, type GuildMember } from "discord.js";

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember: GuildMember, newMember: GuildMember) {
    if (
      oldMember.communicationDisabledUntilTimestamp !==
      newMember.communicationDisabledUntilTimestamp
    ) {
      console.log(
        `Member ${newMember.user.tag} ${
          newMember.communicationDisabledUntilTimestamp
            ? `was timed out for ${newMember.communicationDisabledUntilTimestamp}`
            : `was un-timed out. Before: ${oldMember.communicationDisabledUntilTimestamp}`
        } in guild ${newMember.guild.name}`,
      );
    }
  },
};
