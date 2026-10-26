const axios = require('axios');
const fs = require('fs');
const path = require('path');
const memory = require('./memory');
const vpsTools = require('./vpsTools');

const statsFilePath = path.join(__dirname, '../data/token_stats.json');

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

      const effectiveModel = model || 'ag/gemini-3.8-flash';
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

      while (loopCount < 50) {
        loopCount++;

        const response = await axios.post(
          targetUrl,
          {
            model: effectiveModel,
            messages,
            tools: vpsTools.toolDefinitions,
            tool_choice: 'auto',
            max_tokens: effectiveMaxTokens,
            temperature: effectiveTemp
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey.trim()}`,
              'HTTP-Referer': 'https://github.com/Hermes-AI-VPS',
              'X-Title': 'Hermes AI VPS Assistant',
              'Content-Type': 'application/json'
            },
            timeout: 7200000 // 2 hours max timeout
          }
        );

        const choice = response.data?.choices?.[0];
        const msg = choice?.message;
        finalModel = response.data?.model || effectiveModel;
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
          messages.push(msg); // Add assistant message with tool_calls
          for (const tc of msg.tool_calls) {
            const toolName = tc.function?.name;
            const toolArgs = tc.function?.arguments;

            if (typeof onProgress === 'function') {
              onProgress(toolName, toolArgs);
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
          finalReplyText = msg?.content || '*(Selesai tanpa output teks)*';
          break;
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

      let friendlyMsg = errorMessage;
      if (statusCode === 401) {
        friendlyMsg = 'API Key OpenRouter tidak valid atau kedaluwarsa. Periksa kembali API Key Anda di Web Dashboard.';
      } else if (statusCode === 402) {
        friendlyMsg = 'Saldo / Kredit token OpenRouter Anda tidak mencukupi (Insufficient Credits).';
      } else if (statusCode === 429) {
        friendlyMsg = 'Terkena Rate Limit OpenRouter. Tunggu beberapa saat sebelum mengirim pesan lagi.';
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
