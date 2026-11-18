const { Telegraf } = require('telegraf');
const openrouter = require('./openrouter');

class TelegramService {
  constructor() {
    this.bot = null;
    this.isExpectedRunning = false;
    this.chatQueues = new Map(); // chatId -> Promise chain
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
    this.chatQueues.clear();

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
      
      // Set handlerTimeout to 2 hours so long tasks don't crash Telegraf polling
      this.bot = new Telegraf(token.trim(), {
        handlerTimeout: 7200000
      });

      // Global catch handler so unhandled middleware errors NEVER kill the polling loop
      this.bot.catch((err, ctx) => {
        console.error(`❌ [Telegram Global Catch] Error on update ${ctx?.update?.update_id}:`, err.message);
      });

      // Start command
      this.bot.command('start', async (ctx) => {
        const name = ctx.from?.first_name || 'Teman';
        await ctx.reply(
          `👋 Halo *${name}*! Saya adalah *Hermes AI*, asisten cerdas otonom yang terhubung langsung dengan VPS.\n\n` +
          `🧠 *Mode Model AI:*\n` +
          `• Default: \`Gemini (5h) [ag/gemini-3-flash]\` (Rolling 5 Akun + Auto-Cascade Fallback)\n` +
          `• On-Demand Claude: Cukup tulis kata *"pakai claude"* atau *"claude opus"* di dalam pesan/prompt Anda jika ingin menggunakan Claude 4.6!\n\n` +
          `✨ *Perintah yang tersedia:*\n` +
          `• Kirim pesan apa saja untuk memberi instruksi atau bertanya.\n` +
          `• /reset - Menghapus riwayat memori & membuka kunci antrean.\n` +
          `• /status - Melihat model AI aktif, kasta fallback, dan penggunaan token.\n` +
          `• /help - Menampilkan panduan bantuan ini.`,
          { parse_mode: 'Markdown' }
        ).catch(() => ctx.reply(`Halo ${name}! Saya Hermes AI. Default menggunakan Gemini (5h). Sebutkan "pakai claude" di prompt jika ingin memakai Claude.`));
      });

      // Help command
      this.bot.command('help', async (ctx) => {
        await ctx.reply(
          `🤖 *Hermes AI Bot Commands:*\n` +
          `• Kirim teks biasa: Otomatis memakai *Gemini (5h)* dengan rolling 5 akun.\n` +
          `• Tulis *"pakai claude"* di pesan Anda: Otomatis memakai *Claude Sonnet 4.6 / Opus 4.6*.\n` +
          `• /reset: Reset memori percakapan & antrean chat.\n` +
          `• /status: Cek model AI yang sedang digunakan dan statistik token.`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      });

      // Reset memory command
      this.bot.command('reset', async (ctx) => {
        const sessionKey = `tg_${ctx.chat.id}`;
        openrouter.resetSession(sessionKey);
        this.chatQueues.delete(ctx.chat.id);
        await ctx.reply('🧹 Memori obrolan dan antrean pesan Anda telah di-reset! Kita bisa mulai percakapan baru yang segar.');
      });

      // Status command
      this.bot.command('status', async (ctx) => {
        const or = this.currentConfig.openrouter || {};
        const stats = openrouter.getUsageStats();
        await ctx.reply(
          `⚡ *Status Hermes AI:*\n` +
          `• Default Model: \`Gemini (5h) [${or.model || 'ag/gemini-3-flash'}]\`\n` +
          `• Claude Prompt Mode: \`Aktif (ag/claude-sonnet-4-6 & opus-4-6)\`\n` +
          `• Strategi Akun: \`Round-Robin 5 Akun + Multi-Tier Cascade\`\n` +
          `• Max Tokens: \`${or.maxTokens || 4096}\` tokens\n` +
          `• Total Token Terpakai: \`${stats.totalTokens.toLocaleString()}\` tokens\n` +
          `• Status Polling: \`Active (Watchdog Protected)\``,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      });

      // Handler document
      this.bot.on('document', async (ctx) => {
        const doc = ctx.message.document;
        if (!doc) return;
        let fileUrl = '';
        try {
          const link = await ctx.telegram.getFileLink(doc.file_id);
          fileUrl = link.href || link.toString();
        } catch (e) {
          console.error('[Telegram] Failed to get doc link:', e.message);
        }

        const caption = ctx.message.caption || '';
        const fileName = doc.file_name || 'file';
        const userText = fileUrl
          ? `[User mengirim dokumen/file ${fileName}: ${fileUrl}] ${caption}`.trim()
          : (caption || `[User mengirim dokumen ${fileName}]`);

        await this.enqueueChatTask(ctx.chat.id, () => this.handleUserMessage(ctx, userText));
      });

      // Handler photo
      this.bot.on('photo', async (ctx) => {
        const photos = ctx.message.photo;
        if (!photos || photos.length === 0) return;
        const highestRes = photos[photos.length - 1];
        let fileUrl = '';
        try {
          const link = await ctx.telegram.getFileLink(highestRes.file_id);
          fileUrl = link.href || link.toString();
        } catch (e) {
          console.error('[Telegram] Failed to get file link:', e.message);
        }

        const caption = ctx.message.caption || '';
        const userText = fileUrl
          ? `[User mengirim gambar/foto: ${fileUrl}] ${caption}`.trim()
          : (caption || '[User mengirim foto]');

        await this.enqueueChatTask(ctx.chat.id, () => this.handleUserMessage(ctx, userText));
      });

      // Handler text
      this.bot.on('text', async (ctx) => {
        const userText = ctx.message.text;
        if (userText.startsWith('/')) return; // handled by commands

        await this.enqueueChatTask(ctx.chat.id, () => this.handleUserMessage(ctx, userText));
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

      // Fix 4: Auto-reconnect Polling Watchdog
      this.isExpectedRunning = true;
      this.startPollingWithWatchdog();

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

      // Auto-retry in 5 seconds if network/DNS hiccup (not 401 invalid token)
      if (!String(err.message).includes('401')) {
        console.log('🔄 [Telegram Auto-Retry] Gangguan jaringan sesaat ke Telegram API. Mencoba kembali dalam 5 detik...');
        setTimeout(() => {
          if (!this.status.online && this.currentConfig?.telegram?.enabled) {
            this.startBot(this.currentConfig);
          }
        }, 5000);
      }
    }
  }

  /**
   * Enqueue a chat task with a 4-minute hard timeout so no stuck request ever freezes future messages
   */
  async enqueueChatTask(chatId, taskFn) {
    if (!this.chatQueues.has(chatId)) {
      this.chatQueues.set(chatId, Promise.resolve());
    }

    const prevTask = this.chatQueues.get(chatId);

    const nextTask = prevTask
      .catch(() => {}) // never block on previous failure
      .then(() => {
        return Promise.race([
          taskFn(),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Batas waktu eksekusi pesan (4 menit) terlampaui. Antrean dibuka otomatis.')), 240000);
          })
        ]).catch((err) => {
          console.error(`[Telegram Queue Error Chat ${chatId}]:`, err.message);
        });
      });

    this.chatQueues.set(chatId, nextTask);
    return nextTask;
  }

  /**
   * Robust long-polling loop with auto-reconnect on network drop or timeout
   */
  startPollingWithWatchdog() {
    if (!this.bot || !this.isExpectedRunning) return;

    this.bot.launch({
      dropPendingUpdates: false
    }).catch((pollErr) => {
      console.error('⚠️ [Telegram Polling Hiccup]', pollErr.message);
      this.status.online = false;
      this.status.lastError = pollErr.message;

      if (this.isExpectedRunning) {
        console.log('🔄 [Telegram Watchdog] Polling terputus. Mencoba reconnect otomatis dalam 4 detik...');
        setTimeout(() => {
          if (this.isExpectedRunning && this.bot) {
            console.log('🚀 [Telegram Watchdog] Menghubungkan ulang polling Telegraf...');
            this.status.online = true;
            this.startPollingWithWatchdog();
          }
        }, 4000);
      }
    });
  }

  /**
   * Process a single incoming user message with progress status and safe cleanup
   */
  async handleUserMessage(ctx, userText) {
    const sessionKey = `tg_${ctx.chat.id}`;
    const orConfig = this.currentConfig.openrouter || {};

    // Initial typing
    ctx.sendChatAction('typing').catch(() => {});
    const typingInterval = setInterval(() => {
      ctx.sendChatAction('typing').catch(() => {});
    }, 4500);

    let statusMsg = null;
    try {
      statusMsg = await ctx.reply('⏳ *Hermes sedang bekerja di VPS...*');
    } catch {}

    let lastProgressEditTime = 0;

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
        onProgress: (toolName, toolArgs, step) => {
          ctx.sendChatAction('typing').catch(() => {});
          const now = Date.now();
          // Rate-limit progress status edits to prevent Telegram 429
          if (statusMsg && (now - lastProgressEditTime > 2500)) {
            lastProgressEditTime = now;
            const stepLabel = step ? `[Langkah #${step}] ` : '';
            const desc = toolName === 'take_screenshot' ? '📸 Mengambil screenshot web...'
              : toolName === 'run_shell_command' ? '⚙️ Mengeksekusi perintah terminal VPS...'
              : toolName === 'write_file' ? '📝 Menulis/mengedit file di VPS...'
              : toolName === 'read_file' ? '📖 Membaca file di VPS...'
              : `⚡ Menjalankan ${toolName}...`;
            ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `⏳ *Hermes ${stepLabel}:* ${desc}`).catch(() => {});
          }
        }
      });

      if (!result.success) {
        await ctx.reply(`⚠️ *Hermes AI Error:*\n${result.error}`, { parse_mode: 'Markdown' }).catch(() => {
          ctx.reply(`Error: ${result.error}`);
        });
        return;
      }

      // Deliver text response in chunks
      const reply = (result.reply && result.reply.trim())
        ? result.reply
        : (result.attachments?.length ? '*(Aksi selesai)*' : '*(Operasi di VPS telah selesai dijalankan)*');
      const chunks = this.splitMessage(reply, 4000);
      for (const chunk of chunks) {
        try {
          await ctx.reply(chunk, { parse_mode: 'Markdown' });
        } catch (mdErr) {
          await ctx.reply(chunk);
        }
      }

      // Deliver attachments (screenshots, files)
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
      console.error('[Telegram Message Handler Error]', err);
      await ctx.reply(`Maaf, terjadi kesalahan saat memproses pesan: ${err.message}`).catch(() => {});
    } finally {
      // Guaranteed cleanup: stop typing and delete temporary progress status
      clearInterval(typingInterval);
      if (statusMsg) {
        ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      }
    }
  }

  /**
   * Stop bot gracefully
   */
  async stopBot() {
    this.isExpectedRunning = false;
    this.chatQueues.clear();
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
