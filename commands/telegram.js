case 'tg':
case 'tgsticker': {
  await react(CMD_EMOJIS.tg || '📦');

  if (!text) {
    await sakuta.send(from, {
      text: `📦 *TELEGRAM STICKER DOWNLOADER*\n\n` +
        `❌ Please provide a Telegram sticker URL.\n\n` +
        `📌 *Example:*\n` +
        `${config.PREFIX}${cmd} https://t.me/addstickers/Porcientoreal`
    });
    break;
  }

  if (!/(https:\/\/t\.me\/addstickers\/)/gi.test(text)) {
    await sakuta.send(from, { text: '❌ *Invalid URL!*' });
    break;
  }

  const packName = text.replace('https://t.me/addstickers/', '').trim().split(/\s+/)[0];
  const botToken = '8987379889:AAFIHTMcgECq2HNBouyiSXa4rT6_BciHZtQ';

  let webp, crypto, fs, path, exec;
  try {
    webp = require('node-webpmux');
    crypto = require('crypto');
    fs = require('fs');
    path = require('path');
    exec = require('child_process').exec;
  } catch (e) {
    await sakuta.send(from, {
      text: `❌ *Missing module:* ${e.message}\n\nInstall: \`npm install node-webpmux\``
    });
    break;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getStickerSet?name=${encodeURIComponent(packName)}`,
      {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(20000),
      }
    );

    if (!res.ok) {
      await sakuta.send(from, { text: `❌ HTTP ${res.status}` });
      break;
    }

    const stickerSet = await res.json();
    if (!stickerSet.ok || !stickerSet.result) {
      await sakuta.send(from, {
        text: `❌ Invalid pack: ${JSON.stringify(stickerSet).slice(0, 200)}`
      });
      break;
    }

    const total = stickerSet.result.stickers.length;
    await sakuta.send(from, {
      text: `📦 Found ${total} stickers\n⏳ Starting download...`
    });

    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    let ok = 0, failed = 0;
    let firstError = null;

    for (let i = 0; i < total; i++) {
      const sticker = stickerSet.result.stickers[i];
      try {
        console.log(`[${sessionId}] Sticker ${i+1}/${total} — animated=${sticker.is_animated} video=${sticker.is_video}`);

        const fi = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${sticker.file_id}`);
        if (!fi.ok) throw new Error(`getFile HTTP ${fi.status}`);
        const fd = await fi.json();
        if (!fd.ok || !fd.result.file_path) throw new Error('No file_path');

        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fd.result.file_path}`;
        const ir = await fetch(fileUrl);
        if (!ir.ok) throw new Error(`download HTTP ${ir.status}`);
        const buf = Buffer.from(await ir.arrayBuffer());
        console.log(`[${sessionId}]   → ${buf.length} bytes, type=${fd.result.file_path.split('.').pop()}`);

        let finalBuffer = buf;
        const ext = fd.result.file_path.split('.').pop().toLowerCase();

        if (sticker.is_animated || sticker.is_video || ext === 'tgs' || ext === 'webm') {
          const inPath = path.join(tmpDir, `in_${Date.now()}_${i}.${ext}`);
          const outPath = path.join(tmpDir, `out_${Date.now()}_${i}.webp`);
          fs.writeFileSync(inPath, buf);

          const cmd = sticker.is_video
            ? `ffmpeg -y -i "${inPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -loop 0 -pix_fmt yuva420p -quality 75 "${outPath}"`
            : `ffmpeg -y -i "${inPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -loop 0 -pix_fmt yuva420p -quality 75 "${outPath}"`;

          await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 30000 }, (err) => err ? reject(err) : resolve());
          });

          finalBuffer = fs.readFileSync(outPath);
          try { fs.unlinkSync(inPath); } catch {}
          try { fs.unlinkSync(outPath); } catch {}
        }

        const img = new webp.Image();
        await img.load(finalBuffer);

        const meta = {
          'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
          'sticker-pack-name': config.BOT_NAME || 'Stickers',
          'emojis': sticker.emoji ? [sticker.emoji] : ['🤖'],
        };

        const exifAttr = Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
        const jsonBuf = Buffer.from(JSON.stringify(meta), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuf]);
        exif.writeUIntLE(jsonBuf.length, 14, 4);
        img.exif = exif;

        const out = await img.save(null);
        
        await sakuta.send(from, { sticker: out });
        ok++;
        console.log(`[${sessionId}]   ✅ sent`);
        await new Promise(r => setTimeout(r, 800));

      } catch (err) {
        failed++;
        if (!firstError) firstError = err.message;
        console.error(`[${sessionId}] Sticker ${i+1} failed:`, err.message);
        continue;
      }
    }

    await sakuta.send(from, {
      text: `✅ *Done!*\n\n` +
        `✔️ Success: *${ok}/${total}*\n` +
        `❌ Failed: *${failed}*\n` +
        (firstError ? `\n☻️ *First error:* ${firstError.slice(0, 200)}` : '')
    });

  } catch (error) {
    console.error(`[${sessionId}] tgsticker error:`, error);
    await sakuta.send(from, { text: `❌ *Failed:* ${error.message}` });
  }

  break;
}
