const { Client, GatewayIntentBits, Partials, ActivityType } = require('discord.js');
const openrouter = require('./openrouter');

class DiscordService {
  constructor() {
    this.client = null;
    this.status = {
      online: false,
      tag: null,
      id: null,
      guilds: 0,
      lastError: null,
      startedAt: null
    };
    this.currentConfig = null;
  }

  /**
   * Start or restart Discord bot
   */
  async startBot(config) {
    this.currentConfig = config;
    await this.stopBot();

    const token = config.discord?.botToken;
    const isEnabled = config.discord?.enabled;

    if (!isEnabled || !token || !token.trim()) {
      this.status = {
        online: false,
        tag: null,
        id: null,
        guilds: 0,
        lastError: !isEnabled ? 'Discord bot dinonaktifkan dalam pengaturan' : 'Token bot Discord belum diisi',
        startedAt: null
      };
      return;
    }

    try {
      console.log('[Discord] Menghubungkan bot ke Discord Gateway...');
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages
        ],
        partials: [Partials.Channel, Partials.Message]
      });

      this.client.once('ready', () => {
        this.status = {
          online: true,
          tag: this.client.user.tag,
          id: this.client.user.id,
          guilds: this.client.guilds.cache.size,
          lastError: null,
          startedAt: new Date().toISOString()
        };

        this.client.user.setActivity({
          name: 'Hermes AI | Mention me or !hermes',
          type: ActivityType.Custom
        });

        console.log(`✅ [Discord] Hermes AI aktif sebagai ${this.client.user.tag}`);
      });

      this.client.on('error', (err) => {
        console.error('[Discord Error]', err.message);
        this.status.lastError = err.message;
      });

      this.client.on('messageCreate', async (message) => {
        // Ignore messages sent by bots
        if (message.author.bot) return;

        const botId = this.client.user.id;
        const isMentioned = message.mentions.has(this.client.user);
        const prefix = (config.discord?.prefix || '!hermes').toLowerCase();
        const contentLower = message.content.trim().toLowerCase();
        const isPrefixed = contentLower.startsWith(prefix);
        const isDM = !message.guild;

        if (!isMentioned && !isPrefixed && !isDM) {
          return;
        }

        // Clean user prompt
        let prompt = message.content;
        if (isMentioned) {
          prompt = prompt.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
        } else if (isPrefixed) {
          prompt = prompt.slice(prefix.length).trim();
        }

        // Subcommands
        if (prompt.toLowerCase() === 'reset') {
          const sessionKey = `dc_${message.channel.id}`;
          openrouter.resetSession(sessionKey);
          await message.reply('🧹 Memori obrolan channel ini telah di-reset! Kita bisa mulai topik baru.');
          return;
        }

        if (prompt.toLowerCase() === 'status') {
          const or = config.openrouter || {};
          const stats = openrouter.getUsageStats();
          await message.reply(
            `⚡ **Hermes AI Discord Status:**\n` +
            `• Model: \`${or.model || 'Hermes 3'}\`\n` +
            `• Max Tokens: \`${or.maxTokens || 1000}\` tokens\n` +
            `• Temperature: \`${or.temperature || 0.7}\`\n` +
            `• Total Token Terpakai Sesi Ini: \`${stats.totalTokens.toLocaleString()}\` tokens`
          );
          return;
        }

        if (!prompt) {
          await message.reply(
            `Halo <@${message.author.id}>! Saya adalah **Hermes AI**.\n` +
            `Ketik pertanyaan Anda setelah mention atau gunakan format: \`!hermes <pertanyaan>\`.\n` +
            `Ketik \`!hermes reset\` untuk menghapus memori obrolan.`
          );
          return;
        }

        const sessionKey = `dc_${message.channel.id}`;
        const orConfig = this.currentConfig.openrouter || {};

        // Send typing indicator
        message.channel.sendTyping().catch(() => {});
        const typingInterval = setInterval(() => {
          message.channel.sendTyping().catch(() => {});
        }, 7000);

        let workingMsg = null;
        try {
          workingMsg = await message.reply('⏳ **Hermes sedang bekerja di VPS...** *(Memproses instruksi & mengecek sistem)*');
        } catch {}

        try {
          const result = await openrouter.chat({
            apiKey: orConfig.apiKey,
            model: orConfig.model,
            systemPrompt: orConfig.systemPrompt,
            maxTokens: orConfig.maxTokens,
            temperature: orConfig.temperature,
            sessionKey,
            userMessage: prompt,
            baseUrl: orConfig.baseUrl,
            onProgress: (toolName) => {
              message.channel.sendTyping().catch(() => {});
              if (workingMsg) {
                const desc = toolName === 'take_screenshot' ? '📸 Mengambil screenshot web...'
                  : toolName === 'run_shell_command' ? '⚙️ Mengeksekusi perintah terminal...'
                  : toolName === 'write_file' ? '📝 Menulis/membuat file di VPS...'
                  : toolName === 'read_file' ? '📖 Membaca file di VPS...'
                  : `⚡ Menjalankan ${toolName}...`;
                workingMsg.edit(`⏳ **Hermes sedang bekerja:** ${desc}`).catch(() => {});
              }
            }
          });

          clearInterval(typingInterval);
          if (workingMsg) {
            await workingMsg.delete().catch(() => {});
          }

          if (!result.success) {
            await message.reply(`⚠️ **Hermes AI Error:** ${result.error}`);
            return;
          }

          const rawReply = result.reply || (result.attachments?.length ? '*(Aksi selesai)*' : '*(Tidak ada respons)*');
          const chunks = this.splitMessage(rawReply, 1900);
          const hasFiles = result.attachments && result.attachments.length > 0;

          for (let i = 0; i < chunks.length; i++) {
            const isLastChunk = (i === chunks.length - 1);
            const msgPayload = { content: chunks[i] };
            if (isLastChunk && hasFiles) {
              msgPayload.files = result.attachments;
            }

            if (i === 0) {
              await message.reply(msgPayload);
            } else {
              await message.channel.send(msgPayload);
            }
          }
        } catch (err) {
          clearInterval(typingInterval);
          if (workingMsg) {
            await workingMsg.delete().catch(() => {});
          }
          console.error('[Discord Message Handler Error]', err);
          await message.reply(`Maaf, terjadi kesalahan: ${err.message}`).catch(() => {});
        }
      });

      await this.client.login(token.trim());
    } catch (err) {
      console.error('❌ [Discord] Gagal login ke Discord:', err.message);
      this.status = {
        online: false,
        tag: null,
        id: null,
        guilds: 0,
        lastError: err.message,
        startedAt: null
      };
      this.client = null;
    }
  }

  /**
   * Stop Discord bot
   */
  async stopBot() {
    if (this.client) {
      try {
        console.log('[Discord] Menghentikan bot Discord...');
        this.client.destroy();
      } catch (e) {
        // ignore
      }
      this.client = null;
    }
    this.status.online = false;
  }

  getStatus() {
    return this.status;
  }

  splitMessage(text, maxLength = 1900) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    let cur = 0;
    while (cur < text.length) {
      let next = cur + maxLength;
      if (next < text.length) {
        const lastNewline = text.lastIndexOf('\n', next);
        if (lastNewline > cur + 500) {
          next = lastNewline;
        }
      }
      chunks.push(text.substring(cur, next));
      cur = next;
    }
    return chunks;
  }
}

module.exports = new DiscordService();
