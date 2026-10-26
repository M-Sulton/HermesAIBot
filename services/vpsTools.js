const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  try {
    puppeteer = require('/home/ubuntu/HermesAIBot/node_modules/puppeteer');
  } catch {}
}

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'run_shell_command',
      description: 'Menjalankan perintah bash/terminal langsung di VPS Ubuntu. Gunakan untuk memeriksa sistem (uptime, free -h, df -h, pm2 status, top/htop stats), mengelola service, git, curl/wget download, dan mengecek proses server.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Perintah shell/bash yang akan dijalankan'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Membaca konten file dari VPS (kode HTML, JS, CSS, JSON, config, log).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path file relatif terhadap /home/ubuntu atau path absolut'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Membuat atau merevisi file di VPS (misalnya membuat landing page baru, mengedit kode HTML/CSS/JS, atau mengubah config). Folder akan dibuat otomatis jika belum ada.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path file tujuan di VPS'
          },
          content: {
            type: 'string',
            description: 'Konten file lengkap yang ingin ditulis'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'take_screenshot',
      description: 'Mengambil tangkapan layar (screenshot full page) dari halaman web (URL publik atau localhost port seperti http://localhost:3000) atau file HTML lokal, lalu mengirimkannya sebagai foto/gambar ke chat Telegram dan Discord.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'URL target (misal http://localhost:3000 atau https://tonhermes.web.id) atau path file HTML lokal'
          },
          fullPage: {
            type: 'boolean',
            description: 'Ambil screenshot satu halaman penuh (default: true)'
          }
        },
        required: ['target']
      }
    }
  }
];

function resolvePath(targetPath) {
  if (path.isAbsolute(targetPath)) return targetPath;
  return path.join('/home/ubuntu', targetPath);
}

async function executeTool(name, rawArgs) {
  let args = {};
  try {
    args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});
  } catch (e) {
    return { output: `Error parsing arguments for ${name}: ${e.message}` };
  }

  console.log(`[VPS Tool Execution] ${name} with args:`, args);

  switch (name) {
    case 'run_shell_command': {
      return new Promise((resolve) => {
        exec(args.command, { cwd: '/home/ubuntu', timeout: 7200000, maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
          let output = '';
          if (stdout) output += stdout;
          if (stderr) output += (output ? '\n' : '') + '[STDERR]: ' + stderr;
          if (err && !output) output = `Execution Error: ${err.message}`;

          // Safety guard against massive outputs exceeding model context window
          if (output.length > 60000) {
            output = output.slice(0, 30000) + '\n\n...[OUTPUT TERPOTONG KARENA MELEBIHI 60KB: MENAMPILKAN AWAL DAN AKHIR LOG]...\n\n' + output.slice(-30000);
          }

          resolve({ output: output.trim() || '(Perintah berhasil dieksekusi tanpa output)' });
        });
      });
    }

    case 'read_file': {
      try {
        const fullPath = resolvePath(args.path);
        if (!fs.existsSync(fullPath)) {
          return { output: `File tidak ditemukan: ${fullPath}` };
        }
        const stat = fs.statSync(fullPath);
        if (stat.size > 200 * 1024) {
          return { output: `File terlalu besar (${Math.round(stat.size / 1024)} KB). Maksimal pembacaan 200 KB.` };
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        return { output: content };
      } catch (err) {
        return { output: `Gagal membaca file: ${err.message}` };
      }
    }

    case 'write_file': {
      try {
        const fullPath = resolvePath(args.path);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, args.content, 'utf8');
        return { output: `File berhasil disimpan di ${fullPath} (${Buffer.byteLength(args.content, 'utf8')} bytes).` };
      } catch (err) {
        return { output: `Gagal menulis file: ${err.message}` };
      }
    }

    case 'take_screenshot': {
      if (!puppeteer) {
        return { output: 'Modul Puppeteer belum tersedia di server.' };
      }
      let browser = null;
      try {
        let url = args.target;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          const localPath = resolvePath(url);
          url = `file://${localPath}`;
        }

        browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const isFullPage = args.fullPage !== false;
        const buffer = await page.screenshot({ fullPage: isFullPage, type: 'png' });
        await browser.close();

        return {
          output: `Screenshot dari ${args.target} berhasil diambil!`,
          attachments: [
            {
              attachment: buffer,
              name: `screenshot-${Date.now()}.png`
            }
          ]
        };
      } catch (err) {
        if (browser) await browser.close().catch(() => {});
        return { output: `Gagal mengambil screenshot: ${err.message}` };
      }
    }

    default:
      return { output: `Unknown tool: ${name}` };
  }
}

module.exports = {
  toolDefinitions,
  executeTool
};
