import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  type Client,
  type Collection,
  EmbedBuilder,
  Events,
  ForumChannel,
  type Interaction,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { Command } from "../interface";
import prisma from "../utils/prisma.js";

export default {
  name: Events.InteractionCreate,
  once: false,

  async execute(
    interaction: Interaction,
    commands: Collection<string, Command>,
    client: Client,
  ) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          console.log("Command not found");
          await interaction.reply({
            content: "Command not found",
            ephemeral: true,
          });
          return;
        }

        try {
          await command.execute(interaction);
        } catch (err) {
          console.error(err);
          if (!interaction.replied) {
            await interaction.reply({
              content: "There was an error while executing this command!",
              ephemeral: true,
            });
          }
        }
      } else if (interaction.isAutocomplete()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          console.log("Command not found");
          return;
        }
        try {
          if (!command.autocomplete) {
            console.error("Autocomplete not implemented for this command");
            return;
          }
          await command.autocomplete(interaction);
        } catch (err) {
          console.error(err);
        }
      } else if (
        interaction.isButton() &&
        interaction.customId.startsWith("exchange_")
      ) {
        await handleExchangeButton(interaction);
      } else if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("exchange_")
      ) {
        await handleExchangeModal(interaction);
      }
    } catch (error) {
      console.error("Error in interaction handler:", error);
    }
  },
};

async function handleExchangeButton(interaction: ButtonInteraction) {
  const [action, subAction, originalPosterId] = interaction.customId.split("_");

  if (!originalPosterId) {
    return await interaction.reply({
      content: "❌ Invalid interaction!",
      ephemeral: true,
    });
  }

  try {
    const threadId = interaction.channelId;
    if (!threadId) {
      return await interaction.reply({
        content: "❌ This interaction must be used in a forum thread!",
        ephemeral: true,
      });
    }

    const exchangePost = await (prisma as any).exchangePosts.findUnique({
      where: { threadId },
    });

    if (!exchangePost) {
      return await interaction.reply({
        content: "❌ Exchange post not found in database!",
        ephemeral: true,
      });
    }

    if (!exchangePost.isActive) {
      return await interaction.reply({
        content: "❌ This exchange post is no longer active!",
        ephemeral: true,
      });
    }

    switch (subAction) {
      case "contact":
        await handleContactButton(interaction, exchangePost, originalPosterId);
        break;
      case "available":
        await handleAvailableButton(
          interaction,
          exchangePost,
          originalPosterId,
        );
        break;
      case "close":
        await handleCloseButton(interaction, exchangePost, originalPosterId);
        break;
      default:
        await interaction.reply({
          content: "❌ Unknown action!",
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error("Error handling exchange button:", error);
    await interaction.reply({
      content: "❌ An error occurred while processing your request!",
      ephemeral: true,
    });
  }
}

async function handleCloseButton(
  interaction: ButtonInteraction,
  exchangePost: any,
  originalPosterId: string,
) {
  if (interaction.user.id !== originalPosterId) {
    return await interaction.reply({
      content: "❌ You can only close your own posts!",
      ephemeral: true,
    });
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    await (prisma as any).exchangePosts.update({
      where: { threadId: interaction.channelId },
      data: { isActive: false },
    });

    const thread = await interaction.guild?.channels.fetch(
      interaction.channelId!,
    );
    if (thread && thread.type === ChannelType.PublicThread) {
      const forumChannel = thread.parent as ForumChannel;
      if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
        const availableTags = forumChannel.availableTags;
        const completedTag = availableTags.find(
          (tag) => tag.name && tag.name.toLowerCase().includes("completed"),
        );

        if (completedTag?.id) {
          const currentTags = thread.appliedTags;
          const nonStatusTags = currentTags.filter((tagId) => {
            const tag = availableTags.find((t) => t.id === tagId);
            return (
              tag &&
              !tag.name?.toLowerCase().includes("available") &&
              !tag.name?.toLowerCase().includes("pending") &&
              !tag.name?.toLowerCase().includes("completed")
            );
          });

          await thread.setAppliedTags([...nonStatusTags, completedTag.id]);
        }
      }

      // Update post status to Completed using the updatePostStatus function
      await updatePostStatus(interaction, exchangePost, "Completed");

      // Remove buttons from the original message
      const messages = await thread.messages.fetch({ limit: 10 });
      const originalMessage = messages.find(
        (msg) =>
          msg.embeds.length > 0 &&
          msg.embeds[0]?.fields?.some((field) =>
            field.name.includes("Status"),
          ) &&
          !msg.system,
      );
      if (originalMessage) {
        await originalMessage.edit({
          embeds: originalMessage.embeds,
          components: [],
        });
      }

      await interaction.editReply({
        content:
          "✅ Your exchange post has been closed and marked as completed!",
      });

      try {
        const botMember = interaction.guild?.members.me;
        if (
          botMember
            ?.permissionsIn(thread)
            .has(PermissionFlagsBits.ManageThreads)
        ) {
          // Lock first, then archive (order matters!)
          await thread.setLocked(true);
          await thread.setArchived(true);
        } else {
          // Just archive if can't lock
          await thread.setArchived(true);
        }
      } catch (error) {
        console.error("Could not archive/lock thread:", error);
      }
    } else {
      await interaction.editReply({
        content:
          "✅ Your exchange post has been closed and marked as completed!",
      });
    }
  } catch (error) {
    console.error("Error closing post:", error);
    await interaction.editReply({
      content: "❌ Failed to close post!",
    });
  }
}

async function handleContactButton(
  interaction: ButtonInteraction,
  exchangePost: any,
  originalPosterId: string,
) {
  if (interaction.user.id === originalPosterId) {
    return await interaction.reply({
      content: "❌ You cannot contact yourself!",
      ephemeral: true,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(
      `exchange_contact_modal_${originalPosterId}_${interaction.user.id}`,
    )
    .setTitle("Contact Exchange Poster");

  const contactInfoInput = new TextInputBuilder()
    .setCustomId("contact_info")
    .setLabel("Your Contact Information")
    .setPlaceholder(
      "How should the poster contact you? (Discord DM, phone, email, etc.)",
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const messageInput = new TextInputBuilder()
    .setCustomId("contact_message")
    .setLabel("Message to Poster")
    .setPlaceholder("Your message to the poster...")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    contactInfoInput,
  );
  const secondActionRow =
    new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);

  modal.addComponents(firstActionRow, secondActionRow);

  await interaction.showModal(modal);
}

async function handleAvailableButton(
  interaction: ButtonInteraction,
  exchangePost: any,
  originalPosterId: string,
) {
  if (interaction.user.id === originalPosterId) {
    return await interaction.reply({
      content: "❌ You know if your own post is available!",
      ephemeral: true,
    });
  }

  try {
    const originalPoster =
      await interaction.client.users.fetch(originalPosterId);

    const availabilityEmbed = new EmbedBuilder()
      .setTitle("📋 Availability Inquiry")
      .setDescription(
        `Someone is asking if your exchange post is still available!`,
      )
      .addFields([
        {
          name: "📝 Post Title",
          value: exchangePost.title,
          inline: false,
        },
        {
          name: "👤 Asked by",
          value: `${interaction.user} (${interaction.user.tag})`,
          inline: true,
        },
        {
          name: "📍 In Server",
          value: interaction.guild?.name || "Unknown",
          inline: true,
        },
        {
          name: "🔗 View Post",
          value: `[Click here](https://discord.com/channels/${interaction.guild?.id}/${interaction.channelId})`,
          inline: false,
        },
      ])
      .setColor(0xffa500)
      .setTimestamp();

    await originalPoster.send({ embeds: [availabilityEmbed] });

    await interaction.reply({
      content: "✅ The poster has been notified of your inquiry!",
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error sending availability inquiry:", error);
    await interaction.reply({
      content: "❌ Failed to notify the poster. They may have DMs disabled.",
      ephemeral: true,
    });
  }
}

async function handleExchangeModal(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.split("_");

  if (parts.length < 5) {
    console.error("Invalid modal customId format:", interaction.customId);
    return await interaction.reply({
      content: "❌ Invalid modal interaction!",
      ephemeral: true,
    });
  }

  const action = parts[0];
  const subAction = parts[1];
  const modalType = parts[2];
  const originalPosterId = parts[3];
  const claimerId = parts[4];

  if (!originalPosterId || !claimerId) {
    return await interaction.reply({
      content: "❌ Invalid modal interaction!",
      ephemeral: true,
    });
  }

  try {
    const threadId = interaction.channelId;
    if (!threadId) {
      return await interaction.reply({
        content: "❌ This interaction must be used in a forum thread!",
        ephemeral: true,
      });
    }

    const exchangePost = await (prisma as any).exchangePosts.findUnique({
      where: { threadId },
    });

    if (!exchangePost) {
      return await interaction.reply({
        content: "❌ Exchange post not found!",
        ephemeral: true,
      });
    }

    if (modalType === "modal") {
      if (subAction === "contact") {
        await handleContactModalSubmission(
          interaction,
          exchangePost,
          originalPosterId,
          claimerId,
        );
      } else {
        await interaction.reply({
          content: "❌ Unknown modal action!",
          ephemeral: true,
        });
      }
    } else {
      await interaction.reply({
        content: "❌ Unknown modal type!",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("Error handling exchange modal:", error);
    console.error("CustomId:", interaction.customId);
    console.error("Parts:", parts);
    console.error("Action:", action);
    console.error("SubAction:", subAction);
    console.error("ModalType:", modalType);
    console.error("OriginalPosterId:", originalPosterId);
    console.error("ClaimerId:", claimerId);
    console.error("Error details:", error);

    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ An error occurred while processing your request!",
        ephemeral: true,
      });
    }
  }
}

async function handleContactModalSubmission(
  interaction: ModalSubmitInteraction,
  exchangePost: any,
  originalPosterId: string,
  contacterId: string,
) {
  try {
    const contactInfo = interaction.fields.getTextInputValue("contact_info");
    const contactMessage =
      interaction.fields.getTextInputValue("contact_message");

    if (!contactInfo || contactInfo.trim().length === 0) {
      return await interaction.reply({
        content: "❌ Contact information is required!",
        ephemeral: true,
      });
    }

    if (!contactMessage || contactMessage.trim().length === 0) {
      return await interaction.reply({
        content: "❌ Message is required!",
        ephemeral: true,
      });
    }

    const originalPoster =
      await interaction.client.users.fetch(originalPosterId);
    const contacter = await interaction.client.users.fetch(contacterId);

    const contactEmbed = new EmbedBuilder()
      .setTitle("📩 Contact Request")
      .setDescription(`Someone wants to contact you about your exchange post!`)
      .addFields([
        {
          name: "📝 Post Title",
          value: exchangePost.title,
          inline: false,
        },
        {
          name: "👤 Contact from",
          value: `${contacter} (${contacter.tag})`,
          inline: true,
        },
        {
          name: "📱 Contact Info",
          value: contactInfo,
          inline: false,
        },
        {
          name: "💬 Message",
          value: contactMessage,
          inline: false,
        },
        {
          name: "🔗 View Post",
          value: `[Click here](https://discord.com/channels/${interaction.guild?.id}/${interaction.channelId})`,
          inline: false,
        },
      ])
      .setColor(0x0099ff)
      .setTimestamp();

    await originalPoster.send({ embeds: [contactEmbed] });

    await interaction.reply({
      content: "✅ Your contact information has been sent to the poster!",
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error sending contact:", error);
    console.error("OriginalPosterId:", originalPosterId);
    console.error("ContacterId:", contacterId);
    console.error("ExchangePost:", exchangePost);

    if (!interaction.replied) {
      await interaction.reply({
        content:
          "❌ Failed to send contact to the poster. They may have DMs disabled.",
        ephemeral: true,
      });
    }
  }
}

async function updatePostStatus(
  interaction: ModalSubmitInteraction | ButtonInteraction,
  exchangePost: any,
  newStatus: string,
) {
  try {
    const thread = await interaction.guild?.channels.fetch(
      interaction.channelId!,
    );
    if (!thread || thread.type !== ChannelType.PublicThread) return;

    // Fetch more messages to find the actual exchange post (not the system starter message)
    const messages = await thread.messages.fetch({ limit: 10 });
    const originalMessage = messages.find(
      (msg) =>
        msg.embeds.length > 0 &&
        msg.embeds[0]?.fields?.some((field) => field.name.includes("Status")) &&
        !msg.system,
    );

    if (!originalMessage || !originalMessage.embeds[0]) return;

    const embed = EmbedBuilder.from(originalMessage.embeds[0]);

    const fields = embed.data.fields || [];
    const statusFieldIndex = fields.findIndex((field) =>
      field.name.includes("Status"),
    );

    if (statusFieldIndex !== -1) {
      fields[statusFieldIndex] = {
        name:
          newStatus === "Available"
            ? "🟢 Status"
            : newStatus === "Claimed"
              ? "🟡 Status"
              : "✅ Status",
        value: newStatus,
        inline: true,
      };
    }

    embed.setFields(fields);

    const statusColors = {
      Available: 0x00ff00,
      Claimed: 0xffa500,
      Completed: 0x808080,
    };
    embed.setColor(
      statusColors[newStatus as keyof typeof statusColors] || 0x00ff00,
    );

    await originalMessage.edit({ embeds: [embed] });

    const forumChannel = thread.parent as ForumChannel;
    if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
      const availableTags = forumChannel.availableTags;
      const statusTag = availableTags.find(
        (tag) =>
          tag.name && tag.name.toLowerCase().includes(newStatus.toLowerCase()),
      );

      if (statusTag?.id) {
        const currentTags = thread.appliedTags;
        const nonStatusTags = currentTags.filter((tagId) => {
          const tag = availableTags.find((t) => t.id === tagId);
          return (
            tag &&
            !tag.name?.toLowerCase().includes("available") &&
            !tag.name?.toLowerCase().includes("pending") &&
            !tag.name?.toLowerCase().includes("completed")
          );
        });

        await thread.setAppliedTags([...nonStatusTags, statusTag.id]);
      }
    }
  } catch (error) {
    console.error("Error updating post status:", error);
  }
}
