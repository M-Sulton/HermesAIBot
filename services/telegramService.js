const { Telegraf } = require('telegraf');
const openrouter = require('./openrouter');

class TelegramService {
  constructor() {
    this.bot = null;
    this.status = {
      online: false,
      username: null,
      firstName: null,
      lastError: null,
      startedAt: null
    };
    this.currentConfig = null;
  }

  /**
   * Start or restart Telegram bot with given configuration
   */
  async startBot(config) {
    this.currentConfig = config;
    await this.stopBot();

    const token = config.telegram?.botToken;
    const isEnabled = config.telegram?.enabled;

    if (!isEnabled || !token || !token.trim()) {
      this.status = {
        online: false,
        username: null,
        firstName: null,
        lastError: !isEnabled ? 'Telegram bot dinonaktifkan dalam pengaturan' : 'Token bot Telegram belum diisi',
        startedAt: null
      };
      return;
    }

    try {
      console.log('[Telegram] Menghubungkan bot ke Telegram API...');
      this.bot = new Telegraf(token.trim());

      // Start command
      this.bot.command('start', async (ctx) => {
        const name = ctx.from?.first_name || 'Teman';
        await ctx.reply(
          `👋 Halo **${name}**! Saya adalah **Hermes AI**, asisten cerdas yang terhubung langsung dengan VPS dan didukung oleh model OpenRouter (*${config.openrouter?.model || 'Hermes 3'}*).\n\n` +
          `✨ **Perintah yang tersedia:**\n` +
          `• Kirim pesan apa saja untuk mengobrol dengan saya.\n` +
          `• /reset - Menghapus riwayat memori obrolan kita.\n` +
          `• /status - Melihat model AI aktif dan batas token.\n` +
          `• /help - Menampilkan pesan panduan ini.`,
          { parse_mode: 'Markdown' }
        ).catch(() => ctx.reply(`Halo ${name}! Saya Hermes AI. Kirim pesan apa saja untuk mulai mengobrol.`));
      });

      // Help command
      this.bot.command('help', async (ctx) => {
        await ctx.reply(
          `🤖 **Hermes AI Bot Command:**\n` +
          `• Kirim teks biasa: Tanya jawab, minta coding, ringkasan, atau analisis.\n` +
          `• /reset: Reset memori percakapan jika ingin topik baru.\n` +
          `• /status: Cek model AI yang sedang digunakan dan limit token.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      });

      // Reset memory command
      this.bot.command('reset', async (ctx) => {
        const sessionKey = `tg_${ctx.chat.id}`;
        openrouter.resetSession(sessionKey);
        await ctx.reply('🧹 Memori obrolan Anda telah di-reset! Kita bisa mulai percakapan baru yang segar.');
      });

      // Status command
      this.bot.command('status', async (ctx) => {
        const or = config.openrouter || {};
        const stats = openrouter.getUsageStats();
        await ctx.reply(
          `⚡ **Status Hermes AI:**\n` +
          `• Model: \`${or.model || 'Hermes 3'}\`\n` +
          `• Max Tokens: \`${or.maxTokens || 1000}\` tokens\n` +
          `• Temperature: \`${or.temperature || 0.7}\`\n` +
          `• Total Token Terpakai Sesi Ini: \`${stats.totalTokens.toLocaleString()}\` tokens`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      });

      // Handle all text messages
      this.bot.on('text', async (ctx) => {
        const userText = ctx.message.text;
        if (userText.startsWith('/')) return; // Ignore unhandled commands

        const sessionKey = `tg_${ctx.chat.id}`;
        const orConfig = this.currentConfig.openrouter || {};

        // Send typing action
        ctx.sendChatAction('typing').catch(() => {});
        const typingInterval = setInterval(() => {
          ctx.sendChatAction('typing').catch(() => {});
        }, 4000);

        let statusMsg = null;
        try {
          statusMsg = await ctx.reply('⏳ *Hermes sedang bekerja di VPS...*');
        } catch {}

        try {
          const result = await openrouter.chat({
            apiKey: orConfig.apiKey,
            model: orConfig.model,
            systemPrompt: orConfig.systemPrompt,
            maxTokens: orConfig.maxTokens,
            temperature: orConfig.temperature,
            sessionKey,
            userMessage: userText,
            baseUrl: orConfig.baseUrl,
            onProgress: (toolName) => {
              ctx.sendChatAction('typing').catch(() => {});
              if (statusMsg) {
                const desc = toolName === 'take_screenshot' ? '📸 Mengambil screenshot web...'
                  : toolName === 'run_shell_command' ? '⚙️ Mengeksekusi perintah terminal VPS...'
                  : toolName === 'write_file' ? '📝 Menulis file di VPS...'
                  : toolName === 'read_file' ? '📖 Membaca file di VPS...'
                  : `⚡ Menjalankan ${toolName}...`;
                ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `⏳ *Hermes:* ${desc}`).catch(() => {});
              }
            }
          });

          clearInterval(typingInterval);
          if (statusMsg) {
            ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
          }

          if (!result.success) {
            await ctx.reply(`⚠️ *Hermes AI Error:*\n${result.error}`, { parse_mode: 'Markdown' }).catch(() => {
              ctx.reply(`Error: ${result.error}`);
            });
            return;
          }

          // Split message if exceeds Telegram limit (4096 chars)
          const reply = result.reply || (result.attachments?.length ? '*(Aksi selesai)*' : '*(Tidak ada respons)*');
          const chunks = this.splitMessage(reply, 4000);
          for (const chunk of chunks) {
            try {
              await ctx.reply(chunk, { parse_mode: 'Markdown' });
            } catch (mdErr) {
              // Fallback to plain text if markdown formatting triggers parser error
              await ctx.reply(chunk);
            }
          }

          // Send attachments (e.g. screenshots, generated images, files)
          if (result.attachments && result.attachments.length > 0) {
            for (const item of result.attachments) {
              try {
                const isBuffer = item && (Buffer.isBuffer(item) || Buffer.isBuffer(item.attachment));
                const buf = Buffer.isBuffer(item) ? item : (item && item.attachment);
                const filename = (item && item.name) || (typeof item === 'string' ? item : 'screenshot.png');

                if (isBuffer && buf) {
                  if (filename.match(/\.(png|jpg|jpeg|webp)$/i)) {
                    await ctx.replyWithPhoto({ source: buf }, { caption: `📸 Screenshot (${filename})` });
                  } else {
                    await ctx.replyWithDocument({ source: buf, filename: filename });
                  }
                } else if (typeof item === 'string') {
                  if (item.match(/\.(png|jpg|jpeg|webp)$/i)) {
                    await ctx.replyWithPhoto({ source: item });
                  } else {
                    await ctx.replyWithDocument({ source: item });
                  }
                }
              } catch (fileErr) {
                console.error('[Telegram Send Attachment Error]', fileErr);
              }
            }
          }
        } catch (err) {
          clearInterval(typingInterval);
          if (statusMsg) {
            ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
          }
          console.error('[Telegram Message Handler Error]', err);
          await ctx.reply(`Maaf, terjadi kesalahan saat memproses pesan: ${err.message}`).catch(() => {});
        }
      });

      // Verify credentials first
      const me = await this.bot.telegram.getMe();

      this.status = {
        online: true,
        username: me.username,
        firstName: me.first_name,
        lastError: null,
        startedAt: new Date().toISOString()
      };

      console.log(`✅ [Telegram] Bot aktif sebagai @${me.username} (${me.first_name})`);

      // Launch bot in background (do not await blocking polling promise)
      this.bot.launch().catch((pollErr) => {
        console.error('❌ [Telegram Polling Error]', pollErr.message);
        this.status.online = false;
        this.status.lastError = pollErr.message;
      });
    } catch (err) {
      console.error('❌ [Telegram] Gagal menjalankan bot:', err.message);
      this.status = {
        online: false,
        username: null,
        firstName: null,
        lastError: err.message,
        startedAt: null
      };
      this.bot = null;
    }
  }

  /**
   * Stop bot gracefully
   */
  async stopBot() {
    if (this.bot) {
      try {
        console.log('[Telegram] Menghentikan bot Telegram...');
        this.bot.stop('RESTART');
      } catch (e) {
        // ignore
      }
      this.bot = null;
    }
    this.status.online = false;
  }

  getStatus() {
    return this.status;
  }

  splitMessage(text, maxLength = 4000) {
    if (text.length <= maxLength) return [text];
    const chunks = [];
    let cur = 0;
    while (cur < text.length) {
      let next = cur + maxLength;
      if (next < text.length) {
        // Try to break at a newline
        const lastNewline = text.lastIndexOf('\n', next);
        if (lastNewline > cur + 1000) {
          next = lastNewline;
        }
      }
      chunks.push(text.substring(cur, next));
      cur = next;
    }
    return chunks;
  }
}

module.exports = new TelegramService();
