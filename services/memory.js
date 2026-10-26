/**
 * Conversation Context Memory Manager
 * Keeps track of recent chat turns per channel/user to maintain conversational context
 * while enforcing max message count to respect OpenRouter token limits.
 */

class MemoryManager {
  constructor(maxMessages = 10) {
    this.maxMessages = maxMessages;
    // Map of sessionKey -> Array of { role: 'user'|'assistant', content: string }
    this.sessions = new Map();
  }

  /**
   * Get history for a session
   */
  getHistory(sessionKey) {
    if (!this.sessions.has(sessionKey)) {
      return [];
    }
    return this.sessions.get(sessionKey);
  }

  /**
   * Add a message to session history
   */
  addMessage(sessionKey, role, content) {
    if (!this.sessions.has(sessionKey)) {
      this.sessions.set(sessionKey, []);
    }
    const history = this.sessions.get(sessionKey);
    // Prevent saving excessively huge responses into memory
    let safeContent = content;
    if (typeof safeContent === 'string' && safeContent.length > 30000) {
      safeContent = safeContent.slice(0, 30000) + '\n...[Riwayat dipotong demi efisiensi konteks]...';
    }

    history.push({ role, content: safeContent, timestamp: Date.now() });

    // Enforce sliding window (keep last maxMessages)
    if (history.length > this.maxMessages) {
      this.sessions.set(sessionKey, history.slice(-this.maxMessages));
    }
  }

  /**
   * Clear session history
   */
  clear(sessionKey) {
    this.sessions.delete(sessionKey);
  }

  /**
   * Clear all sessions
   */
  clearAll() {
    this.sessions.clear();
  }

  /**
   * Get total active sessions count
   */
  getSessionCount() {
    return this.sessions.size;
  }
}

module.exports = new MemoryManager(10);
