# 📱 02. PANDUAN STEP-BY-STEP MEMBUAT & MENGHUBUNGKAN BOT TELEGRAM KE HERMES AI

Panduan ini menjelaskan cara membuat bot Telegram baru secara resmi melalui **@BotFather**, mengambil token HTTP API, mengonfigurasi `HermesAIBot`, serta mengintegrasikannya agar bisa mengeksekusi perintah VPS dan mengirimkan screenshot foto langsung ke chat Telegram Anda.

---

## 📋 DAFTAR ISI
1. [Langkah 1: Menghubungi @BotFather di Telegram](#langkah-1-menghubungi-botfather-di-telegram)
2. [Langkah 2: Membuat Bot Baru (/newbot)](#langkah-2-membuat-bot-baru-newbot)
3. [Langkah 3: Mengambil HTTP API Token](#langkah-3-mengambil-http-api-token)
4. [Langkah 4: Memasukkan Token ke HermesAIBot](#langkah-4-memasukkan-token-ke-hermesaibot)
5. [Langkah 5: Menguji Coba Bot di Telegram](#langkah-5-menguji-coba-bot-di-telegram)
6. [Daftar Perintah & Fitur Khusus Telegram](#daftar-perintah--fitur-khusus-telegram)

---

## Langkah 1: Menghubungi @BotFather di Telegram
1. Buka aplikasi **Telegram** di HP (Android/iOS) atau di Telegram Desktop / Web.
2. Di kolom pencarian (search bar), ketik: **`@BotFather`**.
3. Pastikan memilih akun resmi yang memiliki **centang biru verifikasi Telegram ✔️**.
4. Klik tombol **`Start`** (atau ketik `/start`).

---

## Langkah 2: Membuat Bot Baru (/newbot)
1. Kirim pesan ke BotFather:
   ```text
   /newbot
   ```
2. **Masukkan Nama Tampilan Bot:**  
   BotFather akan membalas: *"Alright, a new bot. How are we going to call it? Please choose a name for your bot."*  
   Ketik nama tampilan yang Anda inginkan, contoh:
   ```text
   HermesTon AI Assistant
   ```
3. **Masukkan Username Bot:**  
   BotFather akan meminta username unik yang **WAJIB diakhiri kata `bot`** (tanpa spasi).  
   Contoh:
   ```text
   HermesT9nbot
   ```
   *(Jika username sudah dipakai pengguna lain, BotFather akan memberitahu Anda untuk mencoba username lain hingga sukses).*

---

## Langkah 3: Mengambil HTTP API Token
Setelah username diterima, BotFather akan memberikan pesan ucapan selamat yang menyertakan **HTTP API Access Token**.

Format token Telegram berupa deretan angka dan karakter unik, contoh:
```text
8808875239:AAETDZ1-6B2f_sGPFc3MQBytgYQ0bTOf9yA
```
Salin token tersebut dan simpan di tempat yang aman.

---

## Langkah 4: Memasukkan Token ke HermesAIBot
1. Buka file `config.json` pada project `HermesAIBot`:
   ```json
   {
     "telegram": {
       "enabled": true,
       "botToken": "8808875239:AAETDZ1-6B2f_sGPFc3MQBytgYQ0bTOf9yA",
       "allowedUsers": []
     }
   }
   ```
2. Ubah `"enabled": true` dan tempel token HTTP API pada `"botToken"`.
3. Unggah dan jalankan ulang service di VPS:
   ```bash
   node deploy-hermes.js
   ```
4. Di log PM2 VPS akan muncul status konfirmasi:
   ```text
   ✅ [Telegram] Bot aktif sebagai @HermesT9nbot (HermesTon AI Assistant)
   ```

---

## Langkah 5: Menguji Coba Bot di Telegram
1. Buka link bot Anda: 👉 **[t.me/HermesT9nbot](https://t.me/HermesT9nbot)**.
2. Klik tombol **`START`** di bagian bawah obrolan.
3. Bot akan membalas dengan pesan salam pembuka.
4. Coba kirimkan perintah berikut:
   * **Cek Status Server:**  
     > *"Berikan saya rangkuman status VPS saat ini (uptime, RAM, dan disk space)"*
   * **Minta Screenshot Web:**  
     > *"Ambilkan screenshot web https://9router.tonhermes.web.id"*  
     *(Hermes akan mengeksekusi Puppeteer di VPS dan langsung mengirim foto screenshot-nya ke chat Anda!)*

---

## Daftar Perintah & Fitur Khusus Telegram

| Perintah / Aksi | Penjelasan |
|---|---|
| Kirim teks bebas | Ngobrol, konsultasi coding, troubleshooting VPS, minta analisis log. |
| `/start` | Memulai sesi bot dan melihat menu panduan ringkas. |
| `/status` | Melihat model AI aktif (`ag/gemini-3.8-flash`), total token terpakai sesi ini, dan latensi respon. |
| `/reset` | Menghapus konteks memori percakapan untuk memulai percakapan baru yang bersih. |
| `/help` | Menampilkan bantuan perintah. |
| **Status Real-time** | Saat Hermes menjalankan perintah di terminal atau mengambil screenshot, status pesan di Telegram akan otomatis menampilkan indikator interaktif seperti: `⏳ Hermes: 📸 Mengambil screenshot web...` lalu dihapus otomatis begitu selesai. |
