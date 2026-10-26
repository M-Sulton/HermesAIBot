# 🤖 HERMES AI ASSISTANT (AUTONOMOUS DEVOPS & BOT HUB)

> Asisten AI Otonom berbasis Node.js yang berjalan 24/7 di VPS Ubuntu, terhubung langsung dengan **Telegram Bot** dan **Discord Bot**, dibekali akses root terminal, pembuat landing page, screenshot Puppeteer full-page, serta perlindungan timeout 2 jam.

---

## 🌟 FITUR UTAMA

1. **📱 Telegram Bot Resmi (`@HermesT9nbot`):**
   * Ngobrol langsung 1-on-1 dari aplikasi Telegram HP atau desktop.
   * Dilengkapi pengiriman foto screenshot web langsung ke ruang chat.
   * Indikator status real-time saat menjalankan perintah server.
2. **🎮 Discord Bot (`HermesTon#5415`):**
   * Mention `@Hermes` atau ketik `!hermes <perintah>` di channel server Discord.
   * Mendukung upload file dan gambar hasil pekerjaan di server.
3. **⚙️ Autonomous DevOps Tools (Full VPS Access):**
   * `run_shell_command`: Menjalankan perintah terminal Ubuntu (cek uptime, RAM, disk, proses PM2, git, database SQLite/MySQL).
   * `read_file` & `write_file`: Membaca log server dan membuat web landing page baru secara mandiri.
   * `take_screenshot`: Mengambil tangkapan layar penuh dari URL web atau file HTML lokal menggunakan Chromium Puppeteer.
4. **⏱️ Extended 2-Hour Timeout (7.200.000 ms):**
   * Mampu menangani tugas-tugas berdurasi panjang tanpa putus di tengah jalan.
5. **🛡️ Smart Token Context Guard (60KB):**
   * Mencegah crash kuota token jika perintah shell menghasilkan log raksasa.

---

## 📂 STRUKTUR DIREKTORI & DOKUMENTASI

```text
HermesAIBot/
├── config.json                        # File konfigurasi aktif (Token & Pengaturan)
├── config.example.json                # Template konfigurasi aman untuk repositori
├── deploy-hermes.js                   # Script deployment otomatis 1-klik via SSH ke VPS
├── package.json                       # Dependensi Node.js (Telegraf, Discord.js, Puppeteer, Axios)
├── server.js                          # Express REST API & lifecycle manager
│
├── services/
│   ├── openrouter.js                  # Engine LLM router & autonomous tool calling loop
│   ├── telegramService.js             # Client Telegram Bot (Telegraf) & photo sender
│   ├── discordService.js              # Client Discord Bot (Discord.js)
│   ├── vpsTools.js                    # Implementasi tools: shell, file I/O, Puppeteer screenshot
│   └── memory.js                      # Context sliding window per sesi chat
│
└── docs/                              # PANDUAN STEP-BY-STEP LENGKAP
    ├── 01-STEP-BY-STEP-DISCORD-BOT.md # Cara buat bot Discord dari 0 sampai online
    ├── 02-STEP-BY-STEP-TELEGRAM-BOT.md# Cara buat bot Telegram via @BotFather
    ├── 03-CARA-CONFIG-DAN-MENYAMBUNGKAN.md # Penjelasan config.json & deployment VPS
    ├── 04-AUTONOMOUS-TOOLS-VPS-DAN-SCREENSHOT.md # Arsitektur otonom & screenshot
    └── 05-LOG-HISTORY-USER-SULTON.md  # Catatan riwayat instruksi & solusi teknis Sulton
```

---

## 🚀 PANDUAN CEPAT (QUICK START)

### 1. Kloning Repositori
```bash
git clone https://github.com/M-Sulton/HermesAIBot.git
cd HermesAIBot
npm install
```

### 2. Atur Konfigurasi
Salin template konfigurasi:
```bash
cp config.example.json config.json
```
Isi token Telegram dari **@BotFather** dan token Discord dari **Discord Developer Portal**.

### 3. Deploy ke VPS
```bash
node deploy-hermes.js
```

### 4. Periksa Status Service
```bash
curl http://localhost:3001/api/status
```

---

## 📖 DOKUMEN PANDUAN LENGKAP
* 📘 [01. Panduan Step-by-Step Discord Bot](docs/01-STEP-BY-STEP-DISCORD-BOT.md)
* 📙 [02. Panduan Step-by-Step Telegram Bot](docs/02-STEP-BY-STEP-TELEGRAM-BOT.md)
* 📗 [03. Panduan Konfigurasi & Koneksi VPS](docs/03-CARA-CONFIG-DAN-MENYAMBUNGKAN.md)
* 📕 [04. Arsitektur Autonomous Tools & Screenshot](docs/04-AUTONOMOUS-TOOLS-VPS-DAN-SCREENSHOT.md)
* 📜 [05. Log History Interaksi & Solusi Teknis User Sulton](docs/05-LOG-HISTORY-USER-SULTON.md)
