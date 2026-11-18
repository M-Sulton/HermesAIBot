const axios = require('axios');
const fs = require('fs');
const path = require('path');
const memory = require('./memory');
const vpsTools = require('./vpsTools');

const statsFilePath = path.join(__dirname, '../data/token_stats.json');

// Urutan Kasta Model Gemini (5h) dari kasta tertinggi ke bawah
// 9Router akan me-rolling seluruh 5 akun Antigravity di tiap kasta sebelum turun ke kasta berikutnya
const GEMINI_5H_TIER_MODELS = [
  'ag/gemini-3-flash',            // Kasta 1 (Terbaik - Default Gemini 5h)
  'ag/gemini-2.5-flash-thinking', // Kasta 2 (Gemini Flash Thinking)
  'ag/gemini-2.5-flash',          // Kasta 3 (Gemini Flash Standard)
  'ag/gemini-3.5-flash-lite',     // Kasta 4 (Gemini 3.5 Flash Lite - Sangat Cepat)
  'ag/gemini-3.1-flash-lite',     // Kasta 5 (Gemini 3.1 Flash Lite)
  'ag/gemini-3.8-flash',          // Kasta 6 (Gemini 3.8 Flash jika kapasitas pulih)
  'cx/gpt-6-luna',                // Kasta 7 (Cadangan Codex Multi-Account)
  'ag/claude-sonnet-4-6'          // Kasta 8 (Cadangan Claude)
];

// Urutan Kasta Model Claude (Aktif otomatis jika user meminta Claude di prompt)
const CLAUDE_TIER_MODELS = [
  'ag/claude-sonnet-4-6',         // Kasta 1 Claude: Sonnet 4.6 Thinking
  'ag/claude-opus-4-6-thinking',  // Kasta 2 Claude: Opus 4.6 Thinking
  'ag/gemini-3-flash',            // Fallback ke Gemini (5h) jika kuota Claude habis di semua akun
  'cx/gpt-6-luna'
];

/**
 * Deteksi dinamis apakah user meminta model Claude lewat prompt chat
 */
function resolveModelCascade(userMessage, configuredModel) {
  const text = String(userMessage || '').toLowerCase();

  // Jika user meminta Claude Opus di prompt
  if (/\bclaude\s*opus\b/i.test(text) || (/\b(pakai|gunakan|pake|use|model|dengan|ganti)\b/i.test(text) && /\bopus\b/i.test(text))) {
    const primary = 'ag/claude-opus-4-6-thinking';
    return {
      primaryModel: primary,
      modelsToTry: [primary, ...CLAUDE_TIER_MODELS.filter(m => m !== primary)],
      isClaudeOverride: true
    };
  }

  // Jika user menyebut/meminta Claude di prompt
  if (/\bclaude\b/i.test(text)) {
    const primary = 'ag/claude-sonnet-4-6';
    return {
      primaryModel: primary,
      modelsToTry: [primary, ...CLAUDE_TIER_MODELS.filter(m => m !== primary)],
      isClaudeOverride: true
    };
  }

  // Default: gunakan Gemini (5h) kasta tertinggi (ag/gemini-3-flash)
  const cleanConfigModel = (configuredModel && configuredModel !== 'ag/gemini-3.8-flash')
    ? configuredModel
    : 'ag/gemini-3-flash';

  const modelsToTry = [cleanConfigModel];
  for (const fb of GEMINI_5H_TIER_MODELS) {
    if (!modelsToTry.includes(fb)) {
      modelsToTry.push(fb);
    }
  }

  return {
    primaryModel: cleanConfigModel,
    modelsToTry,
    isClaudeOverride: false
  };
}

async function callChatWithRetryAndFallback({
  targetUrl,
  payload,
  headers,
  modelsToTry,
  timeoutMs = 45000
}) {
  const candidateModels = Array.isArray(modelsToTry) && modelsToTry.length > 0
    ? modelsToTry
    : GEMINI_5H_TIER_MODELS;

  let lastErr = null;

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const currentModel = candidateModels[mIdx];
    const requestPayload = { ...payload, model: currentModel };
    // 9Router sudah melakukan rolling ke semua 5 akun secara internal.
    // Jika masih gagal (503/429/timeout), retry 1x lalu turun ke kasta model di bawahnya.
    const maxAttempts = mIdx === 0 ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.post(targetUrl, requestPayload, {
          headers,
          timeout: timeoutMs
        });
        return { response, usedModel: currentModel };
      } catch (err) {
        lastErr = err;
        const statusCode = err.response?.status;
        const errorData = err.response?.data?.error || err.response?.data;
        const errMsg = typeof errorData === 'string' ? errorData : (errorData?.message || err.message);

        const isRetryableOrOverload =
          statusCode === 503 ||
          statusCode === 429 ||
          statusCode === 403 ||
          statusCode === 404 ||
          statusCode === 500 ||
          statusCode === 502 ||
          statusCode === 504 ||
          err.code === 'ECONNABORTED' ||
          (errMsg && /CAPACITY_EXHAUSTED|No capacity available|OVERLOADED|timeout|rate limit|quota/i.test(errMsg));

        console.warn(`[OpenRouter Cascade] Kasta #${mIdx + 1} (${currentModel}) percobaan ${attempt}/${maxAttempts} gagal [${statusCode || err.code}]: ${String(errMsg).slice(0, 140)}`);

        if (isRetryableOrOverload && attempt < maxAttempts) {
          const waitMs = 2000;
          console.log(`[OpenRouter Cascade] Menunggu ${waitMs}ms sebelum mencoba ulang ${currentModel}...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        if (isRetryableOrOverload) {
          if (mIdx + 1 < candidateModels.length) {
            console.warn(`[OpenRouter Cascade] Seluruh akun pada model ${currentModel} sibuk/habis kuota. Turun 1 kasta ke: ${candidateModels[mIdx + 1]}`);
          }
          break;
        }

        throw err;
      }
    }
  }

  throw lastErr;
}

class OpenRouterService {
  constructor() {
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.totalUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      callsCount: 0
    };
    this.tokenHistory = [];
    this.cachedKeyData = null;
    this.lastKeyFetchTime = 0;
    this.loadPersistedStats();
  }

  loadPersistedStats() {
    try {
      if (fs.existsSync(statsFilePath)) {
        const raw = fs.readFileSync(statsFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.totalUsage) this.totalUsage = data.totalUsage;
        if (Array.isArray(data.tokenHistory)) this.tokenHistory = data.tokenHistory;
      }
    } catch (e) {
      console.warn('[OpenRouter] Gagal membaca token_stats.json:', e.message);
    }
  }

  savePersistedStats() {
    try {
      const dir = path.dirname(statsFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(statsFilePath, JSON.stringify({
        totalUsage: this.totalUsage,
        tokenHistory: this.tokenHistory
      }, null, 2));
    } catch (e) {
      console.warn('[OpenRouter] Gagal menyimpan token_stats.json:', e.message);
    }
  }

  /**
   * Send a chat completion request to OpenRouter (Nous Hermes)
   * @param {Object} options
   * @param {string} options.apiKey OpenRouter API Key
   * @param {string} options.model Model ID
   * @param {string} options.systemPrompt System instructions
   * @param {number} options.maxTokens Max response token limit
   * @param {number} options.temperature Temperature
   * @param {string} options.sessionKey Session identifier for memory context
   * @param {string} options.userMessage The incoming user prompt
   */
  async chat({ apiKey, model, systemPrompt, maxTokens, temperature, sessionKey, userMessage, baseUrl, onProgress }) {
    const startTime = Date.now();

    try {
      if (!apiKey || !apiKey.trim()) {
        return {
          success: false,
          error: 'API Key belum diatur. Silakan masukkan API Key Anda di tab Pengaturan Hermes AI!'
        };
      }

      const effectiveBaseUrl = baseUrl || this.apiUrl;
      const targetUrl = effectiveBaseUrl.endsWith('/chat/completions')
        ? effectiveBaseUrl
        : `${effectiveBaseUrl.replace(/\/+$/, '')}/chat/completions`;

      const { primaryModel: effectiveModel, modelsToTry, isClaudeOverride } = resolveModelCascade(userMessage, model);
      if (isClaudeOverride) {
        console.log(`[OpenRouter] Deteksi prompt Claude aktif -> menggunakan kasta Claude (${effectiveModel})`);
      }
      const effectiveMaxTokens = parseInt(maxTokens, 10) || 4096;
      const effectiveTemp = typeof temperature === 'number' ? temperature : 0.7;

      // Construct messages array with system prompt and memory
      const messages = [];

      if (systemPrompt && systemPrompt.trim()) {
        messages.push({
          role: 'system',
          content: systemPrompt.trim()
        });
      }

      // Include recent history if sessionKey provided
      if (sessionKey) {
        const history = memory.getHistory(sessionKey);
        for (const msg of history) {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }

      // Add current user prompt
      messages.push({
        role: 'user',
        content: userMessage
      });

      let loopCount = 0;
      const allAttachments = [];
      let finalReplyText = '';
      let finishReason = 'stop';
      let finalModel = effectiveModel;
      let lastUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      let hasExecutedTools = false;

      while (loopCount < 50) {
        loopCount++;

        const { response, usedModel } = await callChatWithRetryAndFallback({
          targetUrl,
          payload: {
            messages,
            tools: vpsTools.toolDefinitions,
            tool_choice: 'auto',
            max_tokens: effectiveMaxTokens,
            temperature: effectiveTemp
          },
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'HTTP-Referer': 'https://github.com/Hermes-AI-VPS',
            'X-Title': 'Hermes AI VPS Assistant',
            'Content-Type': 'application/json'
          },
          modelsToTry,
          timeoutMs: 45000
        });

        finalModel = usedModel;
        const choice = response.data?.choices?.[0];
        const msg = choice?.message;
        finishReason = choice?.finish_reason || 'stop';

        const usage = response.data?.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        };
        lastUsage = usage;

        // Accumulate usage metrics
        this.totalUsage.promptTokens += (usage.prompt_tokens || 0);
        this.totalUsage.completionTokens += (usage.completion_tokens || 0);
        this.totalUsage.totalTokens += (usage.total_tokens || 0);
        this.totalUsage.callsCount++;

        if (msg?.tool_calls && msg.tool_calls.length > 0) {
          hasExecutedTools = true;
          messages.push(msg); // Add assistant message with tool_calls
          for (const tc of msg.tool_calls) {
            const toolName = tc.function?.name;
            const toolArgs = tc.function?.arguments;

            if (typeof onProgress === 'function') {
              onProgress(toolName, toolArgs, loopCount);
            }

            const toolResult = await vpsTools.executeTool(toolName, toolArgs);
            if (toolResult.attachments && toolResult.attachments.length > 0) {
              allAttachments.push(...toolResult.attachments);
            }

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: toolName,
              content: typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult.output)
            });
          }
        } else {
          finalReplyText = msg?.content?.trim() || '';
          break;
        }
      }

      // If loop reached limit or model returned empty content after tools, generate a final summary
      if (!finalReplyText || !finalReplyText.trim()) {
        if (hasExecutedTools) {
          try {
            console.log('[Hermes AI] Meminta ringkasan akhir setelah eksekusi tools...');
            messages.push({
              role: 'user',
              content: 'Semua operasi dan perintah di VPS telah selesai dijalankan. Berikan ringkasan laporan akhir yang rapi, ramah, dan terstruktur dalam bahasa Indonesia untuk user mengenai apa saja yang berhasil dieksekusi, status/URL hasil jika ada, dan catatan penting lainnya.'
            });

            const { response: summaryRes } = await callChatWithRetryAndFallback({
              targetUrl,
              payload: {
                messages,
                max_tokens: Math.min(effectiveMaxTokens, 2048),
                temperature: effectiveTemp
              },
              headers: {
                'Authorization': `Bearer ${apiKey.trim()}`,
                'HTTP-Referer': 'https://github.com/Hermes-AI-VPS',
                'X-Title': 'Hermes AI VPS Assistant',
                'Content-Type': 'application/json'
              },
              modelsToTry: [finalModel, ...modelsToTry.filter(m => m !== finalModel)],
              timeoutMs: 25000
            });

            finalReplyText = summaryRes.data?.choices?.[0]?.message?.content?.trim() || '';
          } catch (sumErr) {
            console.warn('[OpenRouter] Gagal meminta ringkasan otomatis:', sumErr.message);
          }
        }

        if (!finalReplyText || !finalReplyText.trim()) {
          finalReplyText = hasExecutedTools
            ? `✅ Seluruh operasi di VPS telah selesai dieksekusi (${loopCount} langkah). Perintah sistem berhasil dijalankan.`
            : '*(Selesai tanpa output teks)*';
        }
      }

      const latencyMs = Date.now() - startTime;

      // Record detailed token history for live charts
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      this.tokenHistory.push({
        id: Date.now(),
        time: timeStr,
        timestamp: now.toISOString(),
        promptTokens: lastUsage.prompt_tokens || 0,
        completionTokens: lastUsage.completion_tokens || 0,
        totalTokens: lastUsage.total_tokens || 0,
        model: finalModel,
        latencyMs
      });
      if (this.tokenHistory.length > 40) {
        this.tokenHistory.shift();
      }
      this.savePersistedStats();

      // Save to memory context
      if (sessionKey) {
        memory.addMessage(sessionKey, 'user', userMessage);
        memory.addMessage(sessionKey, 'assistant', finalReplyText);
      }

      return {
        success: true,
        reply: finalReplyText,
        attachments: allAttachments,
        usage: {
          promptTokens: lastUsage.prompt_tokens || 0,
          completionTokens: lastUsage.completion_tokens || 0,
          totalTokens: lastUsage.total_tokens || 0
        },
        model: finalModel,
        finishReason,
        latencyMs
      };
    } catch (err) {
      const errorData = err.response?.data?.error || err.response?.data;
      const errorMessage = errorData?.message || err.message;
      const statusCode = err.response?.status;

      console.error('[OpenRouter Error]', statusCode, errorMessage);

      let friendlyMsg = typeof errorMessage === 'object' ? (errorMessage.message || JSON.stringify(errorMessage)) : (errorMessage || 'Terjadi kesalahan internal pada layanan AI.');
      if (statusCode === 401) {
        friendlyMsg = 'API Key OpenRouter tidak valid atau kedaluwarsa. Periksa kembali API Key Anda di Web Dashboard.';
      } else if (statusCode === 402) {
        friendlyMsg = 'Saldo / Kredit token OpenRouter Anda tidak mencukupi (Insufficient Credits).';
      } else if (statusCode === 429) {
        friendlyMsg = 'Server model AI sedang sangat padat (Rate Limit). Coba kembali dalam beberapa saat.';
      } else if (statusCode === 503) {
        friendlyMsg = 'Server model AI sedang mengalami lonjakan kapasitas server (503 Capacity Exhausted). Seluruh upaya retry otomatis dan model cadangan telah dicoba. Silakan kirim ulang pesan Anda beberapa detik lagi.';
      } else if (err.code === 'ECONNABORTED' || (err.message && err.message.includes('timeout'))) {
        friendlyMsg = 'Waktu permintaan ke server model AI melebihi batas (Timeout). Silakan kirim ulang instruksi Anda.';
      }

      return {
        success: false,
        error: friendlyMsg,
        statusCode,
        rawError: errorData
      };
    }
  }

  /**
   * Fetch key limits and credit usage from OpenRouter API
   */
  async getKeyDetails(apiKey, baseUrl) {
    if (!apiKey || !apiKey.trim()) {
      return null;
    }

    if (baseUrl && (baseUrl.includes('20128') || baseUrl.includes('9router') || !baseUrl.includes('openrouter.ai'))) {
      return {
        label: '9Router Gateway (Active)',
        limit: 9999999,
        limitRemaining: 9999999,
        usage: 0,
        usageDaily: 0,
        isFreeTier: false,
        freeDailyRequests: { used: 0, limit: 9999, remaining: 9999 },
        expiresAt: null
      };
    }

    const now = Date.now();
    if (this.cachedKeyData && (now - this.lastKeyFetchTime < 15000)) {
      return this.cachedKeyData;
    }

    try {
      const res = await axios.get('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        timeout: 8000
      });

      const d = res.data?.data || {};
      const limit = typeof d.limit === 'number' ? d.limit : 0;
      const limitRemaining = typeof d.limit_remaining === 'number' ? d.limit_remaining : limit;
      const usage = typeof d.usage === 'number' ? d.usage : 0;
      const usageDaily = typeof d.usage_daily === 'number' ? d.usage_daily : 0;
      const freeReq = d.free_model_daily_requests || { used: 0, limit: 50, remaining: 50 };

      this.cachedKeyData = {
        label: d.label || 'OpenRouter Active Key',
        limit,
        limitRemaining,
        usage,
        usageDaily,
        isFreeTier: Boolean(d.is_free_tier),
        freeDailyRequests: {
          used: freeReq.used ?? 0,
          limit: freeReq.limit ?? 50,
          remaining: freeReq.remaining ?? 50
        },
        expiresAt: d.expires_at || null
      };
      this.lastKeyFetchTime = now;
      return this.cachedKeyData;
    } catch (err) {
      console.warn('[OpenRouter] Gagal mengambil info auth/key:', err.message);
      return this.cachedKeyData;
    }
  }

  /**
   * Get detailed token metrics including live account quota and usage history
   */
  async getDetailedTokenMetrics(apiKey, baseUrl) {
    const keyDetails = await this.getKeyDetails(apiKey, baseUrl);
    return {
      success: true,
      usage: {
        ...this.totalUsage,
        activeSessions: memory.getSessionCount()
      },
      account: keyDetails,
      history: this.tokenHistory,
      timestamp: new Date().toISOString()
    };
  }

  getUsageStats() {
    return {
      ...this.totalUsage,
      activeSessions: memory.getSessionCount()
    };
  }

  resetSession(sessionKey) {
    memory.clear(sessionKey);
  }
}

module.exports = new OpenRouterService();
