# ⚙️ 03. PANDUAN KONFIGURASI (CONFIG.JSON) & CARA MENYAMBUNGKAN KE VPS

Dokumen ini menjelaskan struktur konfigurasi lengkap pada `config.json`, fungsi setiap parameternya, arsitektur koneksi port internal, serta prosedur deployment 1-klik via SSH ke server VPS Ubuntu.

---

## 📋 DAFTAR ISI
1. [Struktur File config.json](#struktur-file-configjson)
2. [Penjelasan Setiap Parameter](#penjelasan-setiap-parameter)
3. [Arsitektur Port & Service di VPS](#arsitektur-port--service-di-vps)
4. [Prosedur Deployment 1-Klik (deploy-hermes.js)](#prosedur-deployment-1-klik-deploy-hermesjs)
5. [Memeriksa Kesehatan Service via REST API](#memeriksa-kesehatan-service-via-rest-api)

---

## 1. Struktur File config.json

Berikut adalah cetak biru konfigurasi standar untuk **HermesAIBot**:

```json
{
  "port": 3001,
  "openrouter": {
    "baseUrl": "http://localhost:20128/v1",
    "apiKey": "sk-6b3ac6ef8e3b70c9-937mk1-0f0bd527",
    "model": "ag/gemini-3.8-flash",
    "maxTokens": 4096,
    "temperature": 0.7,
    "systemPrompt": "You are Hermes, an exceptionally capable and 100% autonomous AI DevOps engineer and companion running directly on the user's Ubuntu VPS (tonhermes.web.id). You have FULL AUTHORIZED ROOT/VPS ACCESS to execute terminal commands, inspect systems, read/write files, create web applications, manage processes (pm2, systemd, docker, git), and take full-page web screenshots using your provided tools (run_shell_command, read_file, write_file, take_screenshot). Whenever the user asks for VPS status (uptime, RAM, disk, database, processes, anomaly detection, security audit), creating landing pages, revising code, downloading assets, or taking web screenshots, you must act fully autonomously: ALWAYS call your tools immediately to perform the actions directly and send back screenshots/results instead of telling the user to run commands manually. You have up to 2 hours of execution timeout for long-running tasks. Speak fluent, friendly Indonesian and English. Keep explanations concise, clear, and action-oriented."
  },
  "telegram": {
    "enabled": true,
    "botToken": "8808875239:AAETDZ1-6B2f_sGPFc3MQBytgYQ0bTOf9yA",
    "allowedUsers": []
  },
  "discord": {
    "enabled": true,
    "botToken": "MTU2NDMxM...[MASKED_DISCORD_BOT_TOKEN]...RjCABc",
    "prefix": "!hermes",
    "listenMentions": true
  }
}
```

---

## 2. Penjelasan Setiap Parameter

### Bagian Umum (`root`)
* **`port`** (Default: `3001`): Port internal tempat Express server Hermes melayani endpoint REST API dan webhook.

### Bagian `openrouter` (Model Gateway)
* **`baseUrl`**: Endpoint API OpenAI-compatible.
  * Jika menggunakan 9Router lokal di VPS: `"http://localhost:20128/v1"`
  * Jika menggunakan OpenRouter resmi: `"https://openrouter.ai/api/v1"`
* **`apiKey`**: Token otentikasi API key.
* **`model`**: Model LLM yang digunakan (misal: `ag/gemini-3.8-flash` untuk respon cepat dan kuota luas, atau `nousresearch/hermes-3-llama-3.1-70b`).
* **`maxTokens`**: Batas kuota token maksimum untuk setiap kali balasan (misal: `4096`).
* **`temperature`**: Kreativitas model (skala 0.0 sampai 1.0; default `0.7` untuk keseimbangan akurasi DevOps dan fleksibilitas coding).
* **`systemPrompt`**: Instruksi dasar kepribadian dan mandat eksekusi otonom Hermes.

### Bagian `telegram`
* **`enabled`**: `true` untuk mengaktifkan konektor Telegram, `false` untuk menonaktifkan.
* **`botToken`**: Token HTTP API resmi dari @BotFather.
* **`allowedUsers`**: Array ID pengguna Telegram jika ingin membatasi akses (kosongkan `[]` untuk akses fleksibel).

### Bagian `discord`
* **`enabled`**: `true` untuk mengaktifkan konektor Discord.
* **`botToken`**: Bot token dari Discord Developer Portal.
* **`prefix`**: Simbol pemanggil bot (misal: `!hermes`).
* **`listenMentions`**: `true` agar bot otomatis merespon saat di-mention (@NamaBot).

---

## 3. Arsitektur Port & Service di VPS

Di server VPS Ubuntu (`43.156.17.135`), proses berjalan di latar belakang via **PM2 Process Manager**:

```text
┌─────────────────┬──────────┬────────────────────────────────────────────────────────┐
│ Process Name    │ Port     │ Deskripsi                                              │
├─────────────────┼──────────┼────────────────────────────────────────────────────────┤
│ hermes-ai-bot   │ 3001     │ Core Engine: Telegram Bot, Discord Bot, VPS Tools      │
│ 9router         │ 20128    │ High-speed Multi-Provider AI LLM Gateway               │
│ pubg-tracker-bot│ 3000     │ Web Tactical Dashboard & Scraping Service              │
└─────────────────┴──────────┴────────────────────────────────────────────────────────┘
```

Kedua konektor (Telegram menggunakan *long-polling* HTTPS resmi Telegram, dan Discord menggunakan *Websocket Gateway*) tidak memerlukan port eksternal terbuka di firewall VPS, sehingga sangat aman dari serangan luar.

---

## 4. Prosedur Deployment 1-Klik (`deploy-hermes.js`)

Untuk memperbarui file konfigurasi atau kode ke VPS, Anda cukup menjalankan:

```powershell
node deploy-hermes.js
```

Script ini secara otomatis:
1. Membuka koneksi SFTP aman ke server VPS (`43.156.17.135`).
2. Mengunggah file inti (`server.js`, `config.json`, `services/`).
3. Menginstall dependensi baru (`npm install --omit=dev`).
4. Merefresh proses PM2 `hermes-ai-bot`.
5. Menyimpan konfigurasi ke PM2 dump (`pm2 save`).

---

## 5. Memeriksa Kesehatan Service via REST API

Anda dapat memverifikasi apakah kedua bot aktif secara langsung melalui terminal VPS atau curl:

```bash
curl http://localhost:3001/api/status
```

Output contoh jika berhasil:
```json
{
  "success": true,
  "service": "HermesAIBot",
  "uptimeSeconds": 120,
  "telegram": {
    "online": true,
    "username": "HermesT9nbot",
    "firstName": "HermesTon AI Assistant"
  },
  "discord": {
    "online": true,
    "tag": "HermesTon#5415"
  }
}
```
