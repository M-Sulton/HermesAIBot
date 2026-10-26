# 🛠️ 04. ARSITEKTUR AUTONOMOUS AI TOOLS & AUTOMATED SCREENSHOT

Dokumen ini membedah bagaimana **Hermes AI** bekerja secara mandiri (*autonomous agent*): mengeksekusi perintah terminal VPS, membaca dan menulis file proyek, mengambil screenshot web halaman penuh (*full-page*), serta mekanisme proteksi context window token dan timeout 2 jam.

---

## 📋 DAFTAR ISI
1. [Prinsip Kerja Agen Otonom (Autonomous Agent Loop)](#prinsip-kerja-agen-otonom-autonomous-agent-loop)
2. [Katalog Tools VPS Hermes](#katalog-tools-vps-hermes)
3. [Mekanisme Full-Page Screenshot (Puppeteer)](#mekanisme-full-page-screenshot-puppeteer)
4. [Konfigurasi Extended Timeout 2 Jam (7.200.000 ms)](#konfigurasi-extended-timeout-2-jam-7200000-ms)
5. [Proteksi Batas Token (Context Safety Guard 60KB)](#proteksi-batas-token-context-safety-guard-60kb)

---

## 1. Prinsip Kerja Agen Otonom (Autonomous Agent Loop)

Alih-alih hanya menjawab dengan teks dan menyuruh user mengetik perintah secara manual di terminal, Hermes beroperasi dengan pola **ReAct (Reason + Act)**:

```text
[User Chat di Telegram / Discord]
              ↓
    [OpenRouter LLM Request]
              ↓
  LLM Memanggil Tool Calls (Misal: run_shell_command atau take_screenshot)
              ↓
      [Eksekusi di VPS Node.js]
              ↓
  Kirimkan Hasil Tool Balik ke LLM
              ↓
  (Looping hingga tugas selesai, max 50 iterasi)
              ↓
[Kirim Jawaban Akhir + Foto Screenshot ke Chat User]
```

Maksimum loop iterasi ditetapkan hingga **50 langkah** agar Hermes dapat menyelesaikan tugas-tugas multi-langkah seperti: *cek bug ➔ edit file ➔ restart service ➔ ambil screenshot hasil web ➔ beri laporan*.

---

## 2. Katalog Tools VPS Hermes

Definisi tools terletak di `services/vpsTools.js`:

### 1. `run_shell_command`
* **Deskripsi:** Menjalankan perintah bash di server Ubuntu pada direktori `/home/ubuntu`.
* **Parameter:** `command` (string perintah shell).
* **Contoh:**
  * `free -h && df -h /` (Cek RAM & Disk)
  * `pm2 status` (Cek proses server)
  * `git status` atau `git pull`
  * `sqlite3 /home/ubuntu/.9router/db/data.sqlite "SELECT * FROM kv;"`

### 2. `read_file`
* **Deskripsi:** Membaca konten file dari sistem VPS (file log, konfigurasi, source code JS/HTML/CSS).
* **Parameter:** `path` (path relatif terhadap `/home/ubuntu` atau path absolut).

### 3. `write_file`
* **Deskripsi:** Membuat atau merevisi file di VPS secara langsung. Folder tujuan otomatis dibuat jika belum ada.
* **Parameter:** `path` (tujuan file), `content` (isi file lengkap).
* **Kasus Penggunaan:** Membuat halaman web baru di `/var/www/` atau memperbaiki bug kode.

### 4. `take_screenshot`
* **Deskripsi:** Mengambil tangkapan layar penuh dari URL web atau file HTML lokal.
* **Parameter:** `target` (URL atau path HTML), `fullPage` (boolean, default: true).
* **Output:** Menghasilkan Buffer gambar PNG yang otomatis dikirimkan ke Telegram / Discord.

---

## 3. Mekanisme Full-Page Screenshot (Puppeteer)

Hermes menggunakan browser Chromium headless yang terpasang di VPS:

```javascript
browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

const buffer = await page.screenshot({ fullPage: true, type: 'png' });
await browser.close();
```

Di sisi Telegram, buffer tersebut langsung dikirim menggunakan:
```javascript
await ctx.replyWithPhoto({ source: buf }, { caption: `📸 Screenshot (${filename})` });
```
Dengan demikian, foto screenshot langsung tampil secara tajam dan dapat dibuka di HP.

---

## 4. Konfigurasi Extended Timeout 2 Jam (7.200.000 ms)

Beberapa tugas server (seperti build frontend, scraping massal, scanning keamanan mendalam, atau backup sistem) memerlukan waktu eksekusi yang panjang. Oleh karena itu, timeout diperpanjang menjadi **2 jam (7.200.000 ms)**:

1. **Pada Axios HTTP Client (`services/openrouter.js`):**
   ```javascript
   timeout: 7200000 // 2 Jam
   ```
2. **Pada Node.js Child Process Exec (`services/vpsTools.js`):**
   ```javascript
   exec(args.command, { cwd: '/home/ubuntu', timeout: 7200000, maxBuffer: 15 * 1024 * 1024 }, ...)
   ```

---

## 5. Proteksi Batas Token (Context Safety Guard 60KB)

Ketika menjalankan perintah terminal seperti membaca log PM2 atau database, output teks bisa mencapai puluhan megabyte. Jika teks raksasa tersebut langsung dikirimkan ke model AI, API akan menolak dengan error `400: Input token count exceeds maximum`.

Untuk mencegah hal tersebut, Hermes mengimplementasikan **Safety Guard**:
```javascript
if (output.length > 60000) {
  output = output.slice(0, 30000) + 
    '\n\n...[OUTPUT TERPOTONG KARENA MELEBIHI 60KB: MENAMPILKAN AWAL DAN AKHIR LOG]...\n\n' + 
    output.slice(-30000);
}
```
Teknik ini memotong teks di tengah dan mempertahankan 30KB bagian awal serta 30KB bagian akhir, sehingga AI tetap mendapatkan informasi lengkap tanpa melebihi batas kuota token.
