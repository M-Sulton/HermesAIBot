# 📜 05. LOG HISTORY INTERAKSI & SOLUSI TEKNIS USER SULTON

Dokumen ini adalah catatan historis (*chronological dev log*) yang merekam semua pertanyaan, permintaan instruksi, konfigurasi, masalah (*troubleshooting*), serta solusi teknis yang telah dikerjakan bersama **User Sulton (SultonDev)** dari sesi pertama (tadi malam) hingga sesi implementasi bot Telegram dan 9Remote saat ini.

---

## 📅 SESI 1: TADI MALAM (26 OKTOBER 2026)

### 1. Evaluasi Platform: Web Dashboard vs Discord
* **Permintaan User Sulton:**  
  *Lebih bagus di mana jika ingin menyuruh Hermes membuat web landing page atau download sesuatu dari browser HP vs chat Discord? Mana yang lebih unggul dari segi kegunaan, fitur, kecepatan, dan yang penting Hermes bisa kirim screenshot via chat?*
* **Solusi & Analisis yang Diberikan:**  
  Discord Bot dipilih sebagai opsi terbaik untuk *mobile on-the-go* karena:
  1. Mendukung notifikasi push instan di HP.
  2. Memiliki gateway terenkripsi tanpa perlu membuka port web publik tambahan.
  3. Mendukung pengiriman file *attachment* (foto screenshot resolusi penuh dan dokumen hasil download).

---

### 2. Panduan Step-by-Step Integrasi Discord Bot
* **Permintaan User Sulton:**  
  *Kasih step by step lengkap untuk menghubungkan chat Discord dengan Hermes.*
* **Solusi yang Diberikan:**  
  1. Panduan membuat Application di Discord Developer Portal.
  2. Cara reset dan menyalin Bot Token.
  3. Mengaktifkan **Message Content Intent** dan **Server Members Intent**.
  4. Membuat link OAuth2 URL Generator dengan izin `Send Messages` dan `Attach Files`.
  5. Mengundang bot ke server Discord.
* **Hasil:**  
  User Sulton mengirimkan token Discord:
  `MTU2NDMxM...[MASKED_DISCORD_BOT_TOKEN]...RjCABc`. Bot berhasil dihubungkan dengan tag `HermesTon#5415`.

---

### 3. Penambahan Akun & Mekanisme Failover 9Router
* **Permintaan User Sulton:**  
  *Cara menambahkan akun lagi di `https://9router.tonhermes.web.id/dashboard/quota` dan apakah sudah auto ganti akun saat 1 akun terkena limit?*
* **Solusi & Analisis yang Diberikan:**  
  * Diperiksa skema SQLite dan backend 9Router.
  * Dijelaskan cara menambah akun di menu *Providers/Connections* dan sistem rotasi otomatis (*fallback/failover* model lock) saat akun utama mengalami *rate-limit (HTTP 429)* atau kehabisan kuota harian.

---

### 4. Transformasi ke Autonomous AI (Root VPS Tools)
* **Permintaan User Sulton:**  
  *Ketika diminta rangkuman status VPS, bot justru membalas menyuruh user menjalankan perintah terminal `uptime && free -h...`. Padahal user ingin bot terintegrasi langsung dengan VPS seperti membuat web baru, cek status VPS, dll.*
* **Solusi yang Diberikan:**  
  * Diciptakan modul `services/vpsTools.js` yang menyediakan 4 *function calling tools* untuk LLM:
    1. `run_shell_command`: Eksekusi terminal bash langsung di Ubuntu.
    2. `read_file`: Membaca file konfigurasi dan source code.
    3. `write_file`: Membuat file baru (web landing page) langsung di server.
    4. `take_screenshot`: Browser Chromium headless Puppeteer untuk memotret web.
  * System prompt diperbarui agar Hermes **selalu** memanggil tools secara otonom tanpa menyuruh user mengetik manual.

---

### 5. Penanganan Error Timeout & Peningkatan ke 1 Jam
* **Permintaan User Sulton:**  
  *Saat meminta analisis mendalam (status VPS, tampilan dashboard, kesehatan database, dan cek anomali ransomware 3 hari terakhir), bot mengalami error: `Hermes AI Error: timeout of 60000ms exceeded`. User meminta timeout diganti menjadi 1 jam.*
* **Solusi yang Diberikan:**  
  * Timeout Axios dinaikkan dari 60 detik (60.000 ms) menjadi 1 jam (3.600.000 ms).
  * Child process `exec` untuk terminal shell juga dinaikkan ke 1 jam.

---

## 📅 SESI 2: DINI HARI / SAAT INI (27 OKTOBER 2026)

### 6. Permintaan Panduan Step-by-Step Bot Telegram
* **Permintaan User Sulton:**  
  *Sama seperti Anda memberikan step tadi malam, kali ini bukan Discord, tapi Telegram.*
* **Solusi yang Diberikan:**  
  Diberikan panduan step-by-step resmi:
  1. Membuka `@BotFather` di Telegram.
  2. Perintah `/newbot`, pemberian nama tampilan dan username berakhiran `bot`.
  3. Pengambilan token HTTP API.
  4. Cara menghubungkan ke `HermesAIBot`.

---

### 7. Integrasi Token Telegram & Bug Fix Blocking Launch
* **Tindakan User Sulton:**  
  User Sulton membuat bot dan mengirimkan token:
  * Username: `t.me/HermesT9nbot` (`@HermesT9nbot`)
  * Token: `8808875239:AAETDZ1-6B2f_sGPFc3MQBytgYQ0bTOf9yA`
* **Masalah Teknis Ditemukan:**  
  Pada Telegraf v4, `await bot.launch()` mengembalikan Promise yang hanya selesai ketika proses berhenti (*blocking*). Hal ini menyebabkan status Telegram tidak ter-update dan bot Discord ikut tertahan.
* **Solusi Teknis:**  
  * Mengambil info bot terlebih dahulu dengan `await bot.telegram.getMe()`.
  * Menjalankan `this.bot.launch()` secara *asynchronous background* tanpa blocking.
  * Hasil: Kedua bot (**Telegram `@HermesT9nbot`** dan **Discord `HermesTon#5415`**) berhasil online bersamaan secara stabil di VPS.

---

### 8. Peningkatan Kapabilitas: Otonom Penuh, Screenshot Foto, dan Timeout 2 Jam
* **Permintaan User Sulton:**  
  *Pastikan itu juga autonomous AI, yang bisa akses full VPS saya dan mengirimkan screenshot, timeout max 2 jam.*
* **Solusi & Peningkatan yang Diterapkan:**  
  1. **Timeout 2 Jam (7.200.000 ms):**
     * Timeout LLM di `openrouter.js` dinaikkan ke `7200000 ms`.
     * Timeout shell di `vpsTools.js` dinaikkan ke `7200000 ms`.
     * Maksimal iterasi loop otonom dinaikkan hingga **50 langkah**.
  2. **Kirim Foto Screenshot Langsung ke Telegram:**
     * Menambahkan penanganan `Buffer` Puppeteer pada `telegramService.js` menggunakan `ctx.replyWithPhoto({ source: buf })`.
  3. **Proteksi Token Guard 60KB:**
     * Mencegah crash error `400 Invalid Argument (Token limit exceeded)` dengan memotong output terminal yang melebihi 60KB dan mempertahankan 30KB awal serta 30KB akhir log.
  4. **Pembaruan System Prompt Otonom:**
     * Menegaskan otorisasi root penuh untuk inspeksi sistem, revisi kode, landing page, dan pemotretan web.

---

### 9. Panduan Penggunaan 9Remote (9remote.cc)
* **Permintaan User Sulton:**  
  *Berikan step by step menggunakan https://9remote.cc/ di HP dan laptop ini.*
* **Solusi yang Diberikan:**  
  * Analisis web & dokumentasi 9Remote.
  * Panduan instalasi Host di laptop via `npm install -g 9remote` dan `9remote start`.
  * Konfigurasi `9remote auto-approve on`.
  * Panduan koneksi dari HP via scan QR atau login di `https://9remote.cc/login`.
  * Penjelasan fitur utama di HP: Terminal PTY persistent, File Explorer & Editor, Remote Desktop 60fps, dan Site Browser (preview localhost tanpa ngrok).

---

### 10. Pembuatan Repositori Dokumentasi & Source Code
* **Permintaan User Sulton:**  
  *Buat repo baru dan upload step by step di sana, cara config sampai menyambungkan, dan log history user Sulton agar sewaktu-waktu lupa tinggal cek repo.*
* **Solusi yang Diterapkan:**  
  * Membuat dokumentasi modular terstruktur dalam folder `docs/`:
    * `01-STEP-BY-STEP-DISCORD-BOT.md`
    * `02-STEP-BY-STEP-TELEGRAM-BOT.md`
    * `03-CARA-CONFIG-DAN-MENYAMBUNGKAN.md`
    * `04-AUTONOMOUS-TOOLS-VPS-DAN-SCREENSHOT.md`
    * `05-LOG-HISTORY-USER-SULTON.md` (Dokumen ini)
    * `README.md`
  * Inisialisasi Git repository dan menghubungkannya ke GitHub `M-Sulton`.
