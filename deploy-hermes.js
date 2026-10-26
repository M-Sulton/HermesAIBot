const { Client } = require('../BotScrapPubgStat/node_modules/ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '43.156.17.135',
  port: 22,
  username: 'ubuntu',
  password: 'tiger-96@-desert',
  readyTimeout: 30000
};

console.log('======================================================');
console.log('  🚀 DEPLOYING HERMES AI ASSISTANT SERVICE TO VPS     ');
console.log(`  🌐 Target: ${config.username}@${config.host}:${config.port}`);
console.log('======================================================');

const conn = new Client();

conn.on('ready', () => {
  console.log('✅ SSH Connection established successfully!');

  const prepareCmd = 'mkdir -p /home/ubuntu/HermesAIBot/services';

  conn.exec(prepareCmd, (err, stream) => {
    if (err) {
      console.error('❌ Remote mkdir error:', err.message);
      conn.end();
      return;
    }

    stream.on('data', () => {});
    stream.stderr.on('data', () => {});
    stream.on('close', () => {
      uploadFiles();
    });
  });
});

conn.on('error', (err) => {
  console.error('❌ SSH Error:', err.message);
});

function uploadFiles() {
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('❌ SFTP Error:', err.message);
      conn.end();
      return;
    }

    const localBase = __dirname;
    const remoteBase = '/home/ubuntu/HermesAIBot';

    const files = [
      { local: path.join(localBase, 'package.json'), remote: `${remoteBase}/package.json` },
      { local: path.join(localBase, 'config.json'), remote: `${remoteBase}/config.json` },
      { local: path.join(localBase, 'server.js'), remote: `${remoteBase}/server.js` },
      { local: path.join(localBase, 'services', 'openrouter.js'), remote: `${remoteBase}/services/openrouter.js` },
      { local: path.join(localBase, 'services', 'telegramService.js'), remote: `${remoteBase}/services/telegramService.js` },
      { local: path.join(localBase, 'services', 'discordService.js'), remote: `${remoteBase}/services/discordService.js` },
      { local: path.join(localBase, 'services', 'memory.js'), remote: `${remoteBase}/services/memory.js` },
      { local: path.join(localBase, 'services', 'vpsTools.js'), remote: `${remoteBase}/services/vpsTools.js` }
    ];

    let count = 0;
    files.forEach(f => {
      sftp.fastPut(f.local, f.remote, (pErr) => {
        if (pErr) {
          console.warn(`⚠️ Failed: ${f.local} -> ${f.remote}:`, pErr.message);
        } else {
          console.log(`  Uploaded: ${path.basename(f.remote)}`);
        }

        count++;
        if (count === files.length) {
          console.log('✅ All HermesAIBot files uploaded!');
          startRemoteProcess();
        }
      });
    });
  });
}

function startRemoteProcess() {
  const remoteBase = '/home/ubuntu/HermesAIBot';
  const startCmd = [
    `cd ${remoteBase}`,
    'npm install --omit=dev',
    'pm2 delete hermes-ai-bot || true',
    'pm2 start server.js --name "hermes-ai-bot"',
    'pm2 save',
    'pm2 status'
  ].join(' && ');

  console.log('🚀 Installing dependencies and registering Hermes AI with PM2...');
  conn.exec(startCmd, (err, stream) => {
    if (err) {
      console.error('❌ Remote command error:', err.message);
      conn.end();
      return;
    }

    stream.on('close', () => {
      console.log('======================================================');
      console.log('  🎉 HERMES AI BOT SERVICE IS NOW LIVE ON VPS!        ');
      console.log('======================================================');
      conn.end();
    }).on('data', (d) => process.stdout.write(d.toString()))
      .stderr.on('data', (d) => process.stderr.write(d.toString()));
  });
}

conn.connect(config);
