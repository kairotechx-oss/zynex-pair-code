import { exec } from 'child_process';

// ─── .ffmpegcheck (owner only) ───────────────────────────────────────────
// Quick diagnostic: confirms whether ffmpeg is actually installed and
// reachable on the server, without needing Railway console access.
export async function ffmpegcheck(message, client, isOwner) {
    const remoteJid = message.key.remoteJid;

    if (!isOwner) {
        return client.sendMessage(remoteJid, { text: '❌ Owner only.' }, { quoted: message });
    }

    exec('which ffmpeg && ffmpeg -version', { timeout: 10000 }, async (err, stdout, stderr) => {
        if (err) {
            return client.sendMessage(remoteJid, {
                text: `❌ ffmpeg NOT found on this server.\n\n🐛 ${(stderr || err.message).slice(0, 500)}`
            }, { quoted: message });
        }

        await client.sendMessage(remoteJid, {
            text: `✅ ffmpeg IS installed.\n\n${stdout.slice(0, 800)}`
        }, { quoted: message });
    });
}

export default { ffmpegcheck };
