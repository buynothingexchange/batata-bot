import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Events,
  type Interaction,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  WebhookClient,
} from "discord.js";
import prisma from "../utils/prisma.js";

interface VerificationSettings {
  verificationEnabled: boolean;
  verificationRoleId: string | null;
  verificationMode: string;
  serverLogChannelID: string | null;
  serverLogWebhookUrl: string | null;
  lastUpdated: number;
}

const verificationCache = new Map<string, VerificationSettings>();
const CACHE_TTL = 1 * 60 * 1000;

async function getVerificationSettings(
  guildId: string,
): Promise<VerificationSettings | null> {
  const cached = verificationCache.get(guildId);
  if (cached && Date.now() - cached.lastUpdated < CACHE_TTL) {
    return cached;
  }

  try {
    const guildData = await prisma.guild.findUnique({
      where: { id: guildId },
      select: {
        verificationEnabled: true,
        verificationRoleId: true,
        verificationMode: true,
        serverLogChannelID: true,
        serverLogWebhookUrl: true,
      },
    });

    if (!guildData) return null;

    const settings: VerificationSettings = {
      verificationEnabled: guildData.verificationEnabled,
      verificationRoleId: guildData.verificationRoleId,
      verificationMode: guildData.verificationMode,
      serverLogChannelID: guildData.serverLogChannelID,
      serverLogWebhookUrl: guildData.serverLogWebhookUrl,
      lastUpdated: Date.now(),
    };

    verificationCache.set(guildId, settings);
    return settings;
  } catch (error) {
    console.error("Error fetching verification settings:", error);
    return null;
  }
}

export function invalidateVerificationCache(guildId: string): void {
  verificationCache.delete(guildId);
}

async function sendVerificationLog(
  webhookUrl: string,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    const webhook = new WebhookClient({ url: webhookUrl });
    await webhook.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error sending verification log:", error);
  }
}

export default {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction: Interaction) {
    if (!interaction.guild) return;

    if (interaction.isButton()) {
      const { customId } = interaction;

      if (customId === "verify-button") {
        await handleVerifyButton(interaction);
      }
    } else if (interaction.isModalSubmit()) {
      const { customId } = interaction;

      if (customId.startsWith("verify-captcha-")) {
        await handleCaptchaSubmit(interaction);
      }
    }
  },
};

async function handleVerifyButton(interaction: ButtonInteraction) {
  try {
    if (!interaction.guild) return;

    const guildData = await getVerificationSettings(interaction.guild.id);

    if (
      !guildData ||
      !guildData.verificationEnabled ||
      !guildData.verificationRoleId
    ) {
      return await interaction.reply({
        content: "❌ Verification system is not properly configured!",
        ephemeral: true,
      });
    }

    const member = interaction.member;
    if (
      member &&
      "roles" in member &&
      "cache" in member.roles &&
      member.roles.cache.has(guildData.verificationRoleId)
    ) {
      return await interaction.reply({
        content: "✅ You are already verified!",
        ephemeral: true,
      });
    }

    if (guildData.verificationMode === "INSTANT") {
      await handleInstantVerification(interaction, guildData);
    } else if (guildData.verificationMode === "CAPTCHA") {
      await handleCaptchaVerification(interaction, guildData);
    }
  } catch (error) {
    console.error("Error in verification button handler:", error);
    await interaction.reply({
      content: "❌ An error occurred during verification!",
      ephemeral: true,
    });
  }
}

async function handleInstantVerification(
  interaction: ButtonInteraction,
  guildData: VerificationSettings,
) {
  try {
    if (!interaction.guild || !guildData.verificationRoleId) return;

    const role = await interaction.guild.roles.fetch(
      guildData.verificationRoleId,
    );
    if (!role) {
      return await interaction.reply({
        content: "❌ Verification role not found!",
        ephemeral: true,
      });
    }

    const member = interaction.member;
    if (member && "roles" in member && "add" in member.roles) {
      await member.roles.add(role);
    }

    if (guildData.serverLogWebhookUrl) {
      const logEmbed = new EmbedBuilder()
        .setTitle("✅ User Verified")
        .setDescription(
          `**User:** ${interaction.user} (${interaction.user.tag})
**Method:** Instant
**Role:** ${role}`,
        )
        .setColor(0x00ff00)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      await sendVerificationLog(guildData.serverLogWebhookUrl, logEmbed);
    } else if (guildData.serverLogChannelID) {
      const logChannel = await interaction.guild.channels.fetch(
        guildData.serverLogChannelID,
      );
      if (logChannel?.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setTitle("✅ User Verified")
          .setDescription(
            `**User:** ${interaction.user} (${interaction.user.tag})
**Method:** Instant
**Role:** ${role}`,
          )
          .setColor(0x00ff00)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    }

    await interaction.reply({
      content: `✅ Welcome to the server! You have been verified and given the ${role} role.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error in instant verification:", error);
    await interaction.reply({
      content: "❌ Failed to verify you. Please contact an administrator.",
      ephemeral: true,
    });
  }
}

async function handleCaptchaVerification(
  interaction: ButtonInteraction,
  guildData: VerificationSettings,
) {
  try {
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    const operation = Math.random() > 0.5 ? "+" : "-";

    let firstNum = num1;
    let secondNum = num2;
    if (operation === "-" && num1 < num2) {
      firstNum = num2;
      secondNum = num1;
    }

    const answer =
      operation === "+" ? firstNum + secondNum : firstNum - secondNum;

    const captchaId = `${interaction.user.id}-${Date.now()}`;

    const modal = new ModalBuilder()
      .setCustomId(`verify-captcha-${captchaId}-${answer}`)
      .setTitle("Verification Captcha");

    const captchaInput = new TextInputBuilder()
      .setCustomId("captcha-answer")
      .setLabel(`What is ${firstNum} ${operation} ${secondNum}?`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(3)
      .setPlaceholder("Enter the answer");

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
      captchaInput,
    );
    modal.addComponents(row);

    await interaction.showModal(modal);
  } catch (error) {
    console.error("Error in captcha verification:", error);
    await interaction.reply({
      content: "❌ Failed to generate captcha. Please try again.",
      ephemeral: true,
    });
  }
}

async function handleCaptchaSubmit(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  try {
    const customId = interaction.customId;
    const parts = customId.split("-");
    const lastPart = parts[parts.length - 1];
    if (!lastPart) {
      throw new Error("Invalid captcha ID format");
    }
    const correctAnswer = Number.parseInt(lastPart, 10);

    const userAnswer = Number.parseInt(
      interaction.fields.getTextInputValue("captcha-answer"),
      10,
    );

    const guildData = await getVerificationSettings(interaction.guild.id);

    if (!guildData?.verificationRoleId) {
      return await interaction.reply({
        content: "❌ Verification system is not properly configured!",
        ephemeral: true,
      });
    }

    if (userAnswer !== correctAnswer) {
      if (guildData.serverLogWebhookUrl) {
        const logEmbed = new EmbedBuilder()
          .setTitle("❌ Failed Captcha Attempt")
          .setDescription(
            `**User:** ${interaction.user} (${interaction.user.tag})
**Expected:** ${correctAnswer}
**Given:** ${userAnswer}
**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
          )
          .setColor(0xff0000)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        await sendVerificationLog(guildData.serverLogWebhookUrl, logEmbed);
      } else if (guildData.serverLogChannelID) {
        const logChannel = await interaction.guild.channels.fetch(
          guildData.serverLogChannelID,
        );
        if (logChannel?.isTextBased()) {
          const logEmbed = new EmbedBuilder()
            .setTitle("❌ Failed Captcha Attempt")
            .setDescription(
              `**User:** ${interaction.user} (${interaction.user.tag})
**Expected:** ${correctAnswer}
**Given:** ${userAnswer}
**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`,
            )
            .setColor(0xff0000)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed] });
        }
      }

      return await interaction.reply({
        content: "❌ Incorrect answer! Please try again.",
        ephemeral: true,
      });
    }

    const role = await interaction.guild.roles.fetch(
      guildData.verificationRoleId,
    );
    if (!role) {
      return await interaction.reply({
        content: "❌ Verification role not found!",
        ephemeral: true,
      });
    }

    const member = interaction.member;
    if (member && "roles" in member && "add" in member.roles) {
      await member.roles.add(role);
    }

    if (guildData.serverLogWebhookUrl) {
      const logEmbed = new EmbedBuilder()
        .setTitle("✅ User Verified")
        .setDescription(
          `**User:** ${interaction.user} (${interaction.user.tag})
**Method:** Captcha
**Role:** ${role}`,
        )
        .setColor(0x00ff00)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      await sendVerificationLog(guildData.serverLogWebhookUrl, logEmbed);
    } else if (guildData.serverLogChannelID) {
      const logChannel = await interaction.guild.channels.fetch(
        guildData.serverLogChannelID,
      );
      if (logChannel?.isTextBased()) {
        const logEmbed = new EmbedBuilder()
          .setTitle("✅ User Verified")
          .setDescription(
            `**User:** ${interaction.user} (${interaction.user.tag})
**Method:** Captcha
**Role:** ${role}`,
          )
          .setColor(0x00ff00)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    }

    await interaction.reply({
      content: `✅ Correct! Welcome to the server! You have been verified and given the ${role} role.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error in captcha submit handler:", error);
    await interaction.reply({
      content: "❌ An error occurred during verification!",
      ephemeral: true,
    });
  }
}
