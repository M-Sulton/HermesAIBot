# 🎮 01. PANDUAN STEP-BY-STEP MEMBUAT & MENGHUBUNGKAN BOT DISCORD KE HERMES AI

Dokumen ini berisi panduan lengkap langkah demi langkah untuk membuat aplikasi Bot di Discord Developer Portal, mengaktifkan izin intent pesan, mengundang bot ke server Discord, hingga menghubungkannya dengan **Hermes AI Assistant** yang berjalan di VPS Ubuntu.

---

## 📋 DAFTAR ISI
1. [Langkah 1: Membuat Aplikasi Bot di Discord Developer Portal](#langkah-1-membuat-aplikasi-bot-di-discord-developer-portal)
2. [Langkah 2: Mengambil Bot Token & Mengaktifkan Gateway Intents](#langkah-2-mengambil-bot-token--mengaktifkan-gateway-intents)
3. [Langkah 3: Membuat URL Undangan & Mengundang Bot ke Server](#langkah-3-membuat-url-undangan--mengundang-bot-ke-server)
4. [Langkah 4: Memasukkan Token ke Konfigurasi Hermes AI](#langkah-4-memasukkan-token-ke-konfigurasi-hermes-ai)
5. [Langkah 5: Menguji Coba Bot di Discord](#langkah-5-menguji-coba-bot-di-discord)
6. [Daftar Perintah & Format Interaksi Discord](#daftar-perintah--format-interaksi-discord)

---

## Langkah 1: Membuat Aplikasi Bot di Discord Developer Portal
1. Buka browser dan kunjungi: **[Discord Developer Portal](https://discord.com/developers/applications)**.
2. Login menggunakan akun Discord Anda.
3. Klik tombol **`New Application`** di pojok kanan atas.
4. Masukkan nama aplikasi, misalnya: **`Hermes AI`** atau **`HermesTon`**.
5. Centang kotak persetujuan Terms of Service, lalu klik tombol **`Create`**.

---

## Langkah 2: Mengambil Bot Token & Mengaktifkan Gateway Intents (PENTING ⚠️)
1. Di menu sidebar sebelah kiri, klik tab **`Bot`**.
2. **Ambil Token:**
   - Di bagian **TOKEN**, klik tombol **`Reset Token`** (masukkan kode 2FA / autentikator jika diminta).
   - Klik tombol **`Copy`** untuk menyalin token tersebut.
   - *Catatan: Token ini hanya muncul sekali. Simpan token ini dengan aman.*
3. **Aktifkan Privileged Gateway Intents (Wajib ON):**
   - Gulir ke bawah ke bagian **Privileged Gateway Intents**.
   - Aktifkan toggle **`MESSAGE CONTENT INTENT`** *(WAJIB AKTIF agar Hermes bisa membaca isi chat dan perintah yang Anda ketik)*.
   - Aktifkan toggle **`SERVER MEMBERS INTENT`** *(Disarankan AKTIF)*.
4. Klik tombol **`Save Changes`** di bagian bawah layar.

---

## Langkah 3: Membuat URL Undangan & Mengundang Bot ke Server
1. Di menu sebelah kiri, pilih tab **`OAuth2`** ➔ lalu klik sub-menu **`URL Generator`**.
2. Di kotak **SCOPES**, centang:
   - ✅ `bot`
3. Setelah mencentang `bot`, akan muncul kotak **BOT PERMISSIONS** di bagian bawah. Centang izin berikut:
   - ✅ `Send Messages` (Mengirim pesan)
   - ✅ `Read Message History` (Membaca riwayat pesan)
   - ✅ `Attach Files` *(WAJIB ON agar Hermes bisa mengirimkan foto screenshot web dan file download)*
   - ✅ `Embed Links` (Menampilkan link embed)
   - ✅ `Use External Emojis`
4. Di bagian paling bawah halaman, salin tautan di kolom **`Generated URL`**.
5. Buka tab baru di browser Anda dan tempel (*paste*) tautan tersebut.
6. Pilih server Discord milik Anda tempat bot akan bergabung, lalu klik **`Continue`** ➔ klik **`Authorize`**.
7. Bot sekarang sudah resmi bergabung di server Discord Anda.

---

## Langkah 4: Memasukkan Token ke Konfigurasi Hermes AI
1. Buka file `config.json` pada folder `HermesAIBot`:
   ```json
   {
     "discord": {
       "enabled": true,
       "botToken": "TOKEN_DISCORD_ANDA_DI_SINI",
       "prefix": "!hermes",
       "listenMentions": true
     }
   }
   ```
2. Pastikan `"enabled": true` dan masukkan token Discord Anda di `"botToken"`.
3. Simpan file dan restart service Hermes di VPS:
   ```bash
   pm2 restart hermes-ai-bot
   ```
   *(Atau jalankan `node deploy-hermes.js` dari laptop).*

---

## Langkah 5: Menguji Coba Bot di Discord
Buka server Discord Anda di channel teks mana saja:
1. **Mention Bot:**
   > `@HermesTon halo, apakah kamu sudah online?`
2. **Prefix Command:**
   > `!hermes berikan saya rangkuman status VPS saat ini`
3. **Minta Screenshot Web:**
   > `!hermes tolong ambilkan screenshot web https://tonhermes.web.id`  
   *(Hermes akan membuka Chromium di VPS, memotret layar, dan mengunggah gambarnya langsung ke channel Discord!)*

---

## Daftar Perintah & Format Interaksi Discord

| Perintah | Deskripsi |
|---|---|
| `!hermes <pertanyaan>` | Mengirim instruksi umum / tugas ke Hermes AI. |
| `@Hermes <pertanyaan>` | Memerintah Hermes melalui mention langsung. |
| `!hermes status` | Menampilkan model AI aktif, kuota token terpakai, dan latensi. |
| `!hermes reset` | Menghapus konteks memori percakapan untuk memulai topik baru. |
| `!hermes screenshot <url>` | Memotret halaman web target dan mengirimkan gambarnya. |
