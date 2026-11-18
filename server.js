const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const openrouter = require('./services/openrouter');
const telegramService = require('./services/telegramService');
const discordService = require('./services/discordService');

const app = express();
const CONFIG_PATH = path.join(__dirname, 'config.json');

app.use(cors());
app.use(express.json());

// Load Config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[Config] Gagal membaca config.json, menggunakan konfigurasi default:', e.message);
  }
  return {
    port: 3001,
    openrouter: {
      apiKey: '',
      model: 'nousresearch/hermes-3-llama-3.1-70b',
      maxTokens: 1000,
      temperature: 0.7,
      systemPrompt: 'You are Hermes, a brilliant AI companion...'
    },
    telegram: { enabled: false, botToken: '', allowedUsers: [] },
    discord: { enabled: false, botToken: '', prefix: '!hermes', listenMentions: true }
  };
}

function saveConfig(newConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Config] Gagal menyimpan config.json:', e.message);
    return false;
  }
}

let currentConfig = loadConfig();
const PORT = parseInt(process.env.PORT || currentConfig.port || 3001, 10);

// Initialize Bots
async function initBots() {
  console.log('🤖 Menginisialisasi konektor bot Hermes AI...');
  if (currentConfig.telegram?.enabled && currentConfig.telegram?.botToken) {
    await telegramService.startBot(currentConfig);
  }
  if (currentConfig.discord?.enabled && currentConfig.discord?.botToken) {
    await discordService.startBot(currentConfig);
  }
}

// ---------------- REST API ENDPOINTS ---------------- //

/**
 * Get comprehensive Hermes AI Status
 */
app.get('/api/status', (req, res) => {
  const usageStats = openrouter.getUsageStats();
  const or = currentConfig.openrouter || {};

  res.json({
    success: true,
    service: 'HermesAIBot',
    uptimeSeconds: Math.floor(process.uptime()),
    openrouter: {
      configured: Boolean(or.apiKey && or.apiKey.trim()),
      model: or.model || 'nousresearch/hermes-3-llama-3.1-70b',
      maxTokens: or.maxTokens || 1000,
      temperature: or.temperature || 0.7,
      usage: usageStats
    },
    telegram: telegramService.getStatus(),
    discord: discordService.getStatus(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Get detailed token usage metrics, OpenRouter account remaining credits, and history
 */
app.get('/api/tokens', async (req, res) => {
  try {
    const or = currentConfig.openrouter || {};
    const tokenMetrics = await openrouter.getDetailedTokenMetrics(or.apiKey, or.baseUrl);
    res.json({
      ...tokenMetrics,
      configured: Boolean(or.apiKey && or.apiKey.trim()),
      model: or.model || 'ag/gemini-3.8-flash',
      maxTokensSetting: or.maxTokens || 2048
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get configuration with masked tokens
 */
app.get('/api/config', (req, res) => {
  const cfg = { ...currentConfig };
  
  // Mask sensitive keys
  const mask = (str) => {
    if (!str || str.length < 8) return '';
    return str.substring(0, 4) + '...' + str.substring(str.length - 4);
  };

  res.json({
    success: true,
    config: {
      port: cfg.port || 3001,
      openrouter: {
        apiKeyMasked: mask(cfg.openrouter?.apiKey),
        hasKey: Boolean(cfg.openrouter?.apiKey && cfg.openrouter.apiKey.trim()),
        model: cfg.openrouter?.model || 'nousresearch/hermes-3-llama-3.1-70b',
        maxTokens: cfg.openrouter?.maxTokens || 1000,
        temperature: cfg.openrouter?.temperature || 0.7,
        systemPrompt: cfg.openrouter?.systemPrompt || ''
      },
      telegram: {
        enabled: Boolean(cfg.telegram?.enabled),
        botTokenMasked: mask(cfg.telegram?.botToken),
        hasToken: Boolean(cfg.telegram?.botToken && cfg.telegram.botToken.trim())
      },
      discord: {
        enabled: Boolean(cfg.discord?.enabled),
        botTokenMasked: mask(cfg.discord?.botToken),
        hasToken: Boolean(cfg.discord?.botToken && cfg.discord.botToken.trim()),
        prefix: cfg.discord?.prefix || '!hermes'
      }
    }
  });
});

/**
 * Update configuration and restart connectors dynamically
 */
app.post('/api/config', async (req, res) => {
  const { openrouter: orInput, telegram: tgInput, discord: dcInput } = req.body;

  let changedTelegram = false;
  let changedDiscord = false;

  // Update OpenRouter
  if (orInput) {
    currentConfig.openrouter = currentConfig.openrouter || {};
    if (orInput.baseUrl !== undefined) currentConfig.openrouter.baseUrl = orInput.baseUrl.trim();
    if (orInput.apiKey !== undefined && orInput.apiKey !== 'KEEP') {
      currentConfig.openrouter.apiKey = orInput.apiKey.trim();
    }
    if (orInput.model !== undefined) currentConfig.openrouter.model = orInput.model.trim();
    if (orInput.maxTokens !== undefined) currentConfig.openrouter.maxTokens = parseInt(orInput.maxTokens, 10) || 1000;
    if (orInput.temperature !== undefined) currentConfig.openrouter.temperature = parseFloat(orInput.temperature) || 0.7;
    if (orInput.systemPrompt !== undefined) currentConfig.openrouter.systemPrompt = orInput.systemPrompt;
  }

  // Update Telegram
  if (tgInput) {
    currentConfig.telegram = currentConfig.telegram || {};
    if (tgInput.enabled !== undefined) {
      if (currentConfig.telegram.enabled !== tgInput.enabled) changedTelegram = true;
      currentConfig.telegram.enabled = Boolean(tgInput.enabled);
    }
    if (tgInput.botToken !== undefined && tgInput.botToken !== 'KEEP') {
      currentConfig.telegram.botToken = tgInput.botToken.trim();
      changedTelegram = true;
    }
  }

  // Update Discord
  if (dcInput) {
    currentConfig.discord = currentConfig.discord || {};
    if (dcInput.enabled !== undefined) {
      if (currentConfig.discord.enabled !== dcInput.enabled) changedDiscord = true;
      currentConfig.discord.enabled = Boolean(dcInput.enabled);
    }
    if (dcInput.botToken !== undefined && dcInput.botToken !== 'KEEP') {
      currentConfig.discord.botToken = dcInput.botToken.trim();
      changedDiscord = true;
    }
    if (dcInput.prefix !== undefined) currentConfig.discord.prefix = dcInput.prefix.trim();
  }

  saveConfig(currentConfig);

  // Apply changes to connectors
  if (changedTelegram) {
    console.log('[Server] Memperbarui status Telegram bot...');
    if (currentConfig.telegram?.enabled && currentConfig.telegram?.botToken) {
      await telegramService.startBot(currentConfig);
    } else {
      await telegramService.stopBot();
    }
  }

  if (changedDiscord) {
    console.log('[Server] Memperbarui status Discord bot...');
    if (currentConfig.discord?.enabled && currentConfig.discord?.botToken) {
      await discordService.startBot(currentConfig);
    } else {
      await discordService.stopBot();
    }
  }

  res.json({
    success: true,
    message: 'Konfigurasi Hermes AI berhasil disimpan & konektor diperbarui!',
    telegram: telegramService.getStatus(),
    discord: discordService.getStatus()
  });
});

/**
 * Direct Web Chat Test endpoint
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionKey } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong.' });
    }

    const trimmedMsg = message.trim();

    // Auto-detect if user pasted their OpenRouter API key directly in the chat box
    if (trimmedMsg.startsWith('sk-or-v1-') && trimmedMsg.length > 25) {
      currentConfig.openrouter = currentConfig.openrouter || {};
      currentConfig.openrouter.apiKey = trimmedMsg;
      saveConfig(currentConfig);
      console.log('[Server] OpenRouter API key otomatis disimpan dari pesan chat!');

      return res.json({
        success: true,
        reply: '🎉 **OpenRouter API Key Berhasil Disimpan & Diaktifkan!**\n\nKunci API OpenRouter Anda telah otomatis tersimpan ke konfigurasi VPS. Sistem Hermes AI kini aktif dan siap diajak berdiskusi!\n\nSilakan ajukan pertanyaan atau instruksi Anda sekarang.',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        model: currentConfig.openrouter?.model || 'nousresearch/hermes-3-llama-3.1-70b',
        latencyMs: 5
      });
    }

    const or = currentConfig.openrouter || {};
    const result = await openrouter.chat({
      apiKey: or.apiKey,
      model: or.model,
      systemPrompt: or.systemPrompt,
      maxTokens: or.maxTokens,
      temperature: or.temperature,
      sessionKey: sessionKey || 'web_console',
      userMessage: trimmedMsg,
      baseUrl: or.baseUrl
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('[Server /api/chat Error]:', err.message);
    res.status(500).json({ success: false, error: 'Terjadi kesalahan internal: ' + err.message });
  }
});

/**
 * Clear chat session memory
 */
app.post('/api/reset', (req, res) => {
  const { sessionKey } = req.body;
  if (sessionKey) {
    openrouter.resetSession(sessionKey);
  } else {
    openrouter.resetSession('web_console');
  }
  res.json({ success: true, message: 'Memori obrolan berhasil di-reset.' });
});

/**
 * Restart individual bot connectors
 */
app.post('/api/bot/restart-telegram', async (req, res) => {
  try {
    console.log('[Server] Menerima permintaan restart Telegram bot...');
    await telegramService.startBot(currentConfig);
    res.json({
      success: true,
      message: 'Bot Telegram berhasil di-restart!',
      telegram: telegramService.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Gagal restart Telegram: ' + err.message });
  }
});

app.post('/api/bot/restart-discord', async (req, res) => {
  try {
    console.log('[Server] Menerima permintaan restart Discord bot...');
    await discordService.startBot(currentConfig);
    res.json({
      success: true,
      message: 'Bot Discord berhasil di-restart!',
      discord: discordService.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Gagal restart Discord: ' + err.message });
  }
});

/**
 * Stop Telegram bot specifically
 */
app.post('/api/bot/stop-telegram', async (req, res) => {
  try {
    console.log('[Server] Menerima permintaan turn off Telegram bot...');
    await telegramService.stopBot();
    res.json({
      success: true,
      message: 'Bot Telegram berhasil di-turn off (dihentikan)!',
      telegram: telegramService.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Gagal stop Telegram: ' + err.message });
  }
});

/**
 * Stop Discord bot specifically
 */
app.post('/api/bot/stop-discord', async (req, res) => {
  try {
    console.log('[Server] Menerima permintaan turn off Discord bot...');
    await discordService.stopBot();
    res.json({
      success: true,
      message: 'Bot Discord berhasil di-turn off (dihentikan)!',
      discord: discordService.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Gagal stop Discord: ' + err.message });
  }
});

/**
 * Reset Telegram Token and hot-reload bot
 */
app.post('/api/bot/telegram/reset-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Token baru harus diisi' });
    }
    const cleanToken = token.trim();
    if (!/^\d{8,11}:[A-Za-z0-9_-]{34,}$/.test(cleanToken)) {
      return res.status(400).json({
        success: false,
        error: 'Format token Telegram tidak valid (contoh format benar: 123456789:ABCDefgh-1234XYZ...)'
      });
    }

    currentConfig.telegram = currentConfig.telegram || {};
    currentConfig.telegram.botToken = cleanToken;
    currentConfig.telegram.enabled = true;
    saveConfig(currentConfig);

    console.log('[Server] Telegram Bot Token berhasil direset via Web API, me-restart bot...');
    await telegramService.startBot(currentConfig);

    const tgStatus = telegramService.getStatus();
    return res.json({
      success: true,
      message: 'Token Bot Telegram berhasil diperbarui dan bot langsung diaktifkan!',
      telegram: tgStatus
    });
  } catch (err) {
    console.error('[Reset Token Error]', err);
    res.status(500).json({ success: false, error: 'Gagal mereset token: ' + err.message });
  }
});

/**
 * Reset Discord Token and hot-reload bot
 */
app.post('/api/bot/discord/reset-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Token Discord baru harus diisi' });
    }
    const cleanToken = token.trim();
    if (cleanToken.length < 50) {
      return res.status(400).json({
        success: false,
        error: 'Format token Discord tampak tidak valid (panjang token minimal 50 karakter)'
      });
    }

    currentConfig.discord = currentConfig.discord || {};
    currentConfig.discord.botToken = cleanToken;
    currentConfig.discord.enabled = true;
    saveConfig(currentConfig);

    console.log('[Server] Discord Bot Token berhasil direset via Web API, me-restart bot...');
    await discordService.startBot(currentConfig);

    const dcStatus = discordService.getStatus();
    return res.json({
      success: true,
      message: 'Token Bot Discord berhasil diperbarui dan bot langsung diaktifkan!',
      discord: dcStatus
    });
  } catch (err) {
    console.error('[Reset Discord Token Error]', err);
    res.status(500).json({ success: false, error: 'Gagal mereset token Discord: ' + err.message });
  }
});

app.post('/api/bot/restart-all', async (req, res) => {
  try {
    console.log('[Server] Menerima permintaan restart Semua Bot (Telegram & Discord)...');
    await Promise.all([
      telegramService.startBot(currentConfig),
      discordService.startBot(currentConfig)
    ]);
    res.json({
      success: true,
      message: 'Semua bot (Telegram & Discord) berhasil di-restart!',
      telegram: telegramService.getStatus(),
      discord: discordService.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Gagal restart bot: ' + err.message });
  }
});


// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  🤖 HERMES AI ASSISTANT SERVICE RUNNING            `);
  console.log(`  🌐 Internal API: http://localhost:${PORT}        `);
  console.log(`  🧠 OpenRouter Model: ${currentConfig.openrouter?.model}`);
  console.log(`====================================================`);

  initBots();
});

server.on('error', (err) => {
  console.error('[Server Error]', err);
});
