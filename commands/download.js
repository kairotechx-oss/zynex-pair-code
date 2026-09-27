import axios from 'axios';
import yts from 'yt-search';

// ─── Shared HTTP + multi-server fallback helpers ───────────────────────────
// Same 3 backing APIs/endpoints as provided — logic untouched, only wrapped
// so song() and video1() can both reuse them for mp3/mp4.

const axiosConfig = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*'
    }
};

async function request(url) {
    return await axios.get(url, axiosConfig);
}

// New source, tried first. No official docs were available, so this parses
// several common response shapes used by these YouTube-downloader APIs.
// If it keeps failing, log the raw JSON (console.log(data)) and adjust the
// field lookup below to match.
async function whiteShadow(url, type) {
    const api = `https://whiteshadow-x-api.onrender.com/download/${type}?url=${encodeURIComponent(url)}`;
    const response = await request(api);
    const data = response.data || {};

    const dlUrl =
        data?.result?.download?.url ||
        data?.result?.url ||
        data?.result?.downloadUrl ||
        data?.data?.download?.url ||
        data?.data?.url ||
        data?.url ||
        data?.downloadUrl;

    const title =
        data?.result?.metadata?.title ||
        data?.result?.title ||
        data?.data?.title ||
        data?.title ||
        '';

    if (dlUrl) {
        return { url: dlUrl, title };
    }
    throw new Error('WhiteShadow failed');
}

async function eliteProTech(url, format) {
    const api = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(url)}&format=${format}`;
    const response = await request(api);
    const data = response.data || {};

    if (data.success && data.downloadURL) {
        return { url: data.downloadURL, title: data.title || '' };
    }
    throw new Error('EliteProTech failed');
}

async function yupra(url, type) {
    const api = `https://api.yupra.my.id/api/downloader/yt${type}?url=${encodeURIComponent(url)}`;
    const response = await request(api);
    const data = response.data || {};

    if (data.success && data.data && data.data.download_url) {
        return {
            url: data.data.download_url,
            title: data.data.title || '',
            thumbnail: data.data.thumbnail || ''
        };
    }
    throw new Error('Yupra failed');
}

async function okatsu(url, type) {
    const api = `https://okatsu-rolezapiiz.vercel.app/downloader/yt${type}?url=${encodeURIComponent(url)}`;
    const response = await request(api);
    const result = response.data?.result || {};
    const field = type === 'mp3' ? result.mp3 : result.mp4;

    if (field) {
        return { url: field, title: result.title || '' };
    }
    throw new Error('Okatsu failed');
}

function cleanFileName(title, fallback) {
    return (
        (title || '')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 100) || fallback
    );
}

// ─── .song / .play / .mp3 / .ytmp3 / .music / .audio ───────────────────────
export async function song(message, client, query) {
    const remoteJid = message.key.remoteJid;

    if (!query) {
        return client.sendMessage(remoteJid, {
            text: '❌ Provide a song name or YouTube link.\nEx: .play Faded Alan Walker'
        }, { quoted: message });
    }

    try {
        let youtubeUrl;
        let searchTitle = '';

        if (/^https?:\/\//i.test(query)) {
            youtubeUrl = query;
        } else {
            const search = await yts(query);
            const video = search?.videos?.[0];
            if (!video) {
                return client.sendMessage(remoteJid, { text: '❌ No results found.' }, { quoted: message });
            }
            youtubeUrl = video.url;
            searchTitle = video.title || '';
        }

        const servers = [
            { name: 'WhiteShadow', run: () => whiteShadow(youtubeUrl, 'ytmp3') },
            { name: 'EliteProTech', run: () => eliteProTech(youtubeUrl, 'mp3') },
            { name: 'Yupra', run: () => yupra(youtubeUrl, 'mp3') },
            { name: 'Okatsu', run: () => okatsu(youtubeUrl, 'mp3') }
        ];

        let audioData = null;
        for (const server of servers) {
            try {
                console.log(`Trying ${server.name}...`);
                const result = await server.run();
                if (result?.url) {
                    audioData = result;
                    console.log(`${server.name} SUCCESS`);
                    break;
                }
            } catch (err) {
                console.log(`${server.name} FAILED:`, err.message);
            }
        }

        if (!audioData) {
            return client.sendMessage(remoteJid, {
                text: '❌ Audio download failed — all servers are currently unavailable. Try again later.'
            }, { quoted: message });
        }

        const title = audioData.title || searchTitle || 'KAIRO ZYNEX Audio';
        const fileName = cleanFileName(title, 'song');

        await client.sendMessage(remoteJid, {
            audio: { url: audioData.url },
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: `${fileName}.mp3`
        }, { quoted: message });

        await client.sendMessage(remoteJid, {
            text: `🎵 *${title}*\n\n*Powered by: KAIRO ZYNEX*`
        }, { quoted: message });

    } catch (err) {
        console.error('SONG ERROR:', err);
        await client.sendMessage(remoteJid, { text: '❌ Something went wrong, try again later.' }, { quoted: message });
    }
}

// ─── .video1 / .vid / .ytv ──────────────────────────────────────────────────
export async function video1(message, client, query) {
    const remoteJid = message.key.remoteJid;

    if (!query) {
        return client.sendMessage(remoteJid, {
            text: '❌ Provide a YouTube link or search query.\nEx: .video1 Pasoori'
        }, { quoted: message });
    }

    try {
        let youtubeUrl;
        let searchTitle = '';

        if (/^https?:\/\//i.test(query)) {
            youtubeUrl = query;
        } else {
            const search = await yts(query);
            const video = search?.videos?.[0];
            if (!video) {
                return client.sendMessage(remoteJid, { text: '❌ No results found.' }, { quoted: message });
            }
            youtubeUrl = video.url;
            searchTitle = video.title || '';
        }

        const servers = [
            { name: 'WhiteShadow', run: () => whiteShadow(youtubeUrl, 'ytmp4') },
            { name: 'EliteProTech', run: () => eliteProTech(youtubeUrl, 'mp4') },
            { name: 'Yupra', run: () => yupra(youtubeUrl, 'mp4') },
            { name: 'Okatsu', run: () => okatsu(youtubeUrl, 'mp4') }
        ];

        let videoData = null;
        for (const server of servers) {
            try {
                console.log(`Trying ${server.name}...`);
                const result = await server.run();
                if (result?.url) {
                    videoData = result;
                    console.log(`${server.name} SUCCESS`);
                    break;
                }
            } catch (err) {
                console.log(`${server.name} FAILED:`, err.message);
            }
        }

        if (!videoData) {
            return client.sendMessage(remoteJid, {
                text: '❌ Video download failed — all servers are currently unavailable. Try again later.'
            }, { quoted: message });
        }

        const title = videoData.title || searchTitle || 'KAIRO ZYNEX Video';
        const fileName = cleanFileName(title, 'video');

        await client.sendMessage(remoteJid, {
            video: { url: videoData.url },
            mimetype: 'video/mp4',
            fileName: `${fileName}.mp4`,
            caption:
                `╭━━━〔 *KAIRO ZYNEX VIDEO* 〕━━━⬣\n` +
                `┃ 🎬 Title: ${title}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━⬣\n\n*Powered by: KAIRO ZYNEX*`
        }, { quoted: message });

    } catch (err) {
        console.error('VIDEO1 ERROR:', err);
        await client.sendMessage(remoteJid, { text: '❌ Error while fetching video.' }, { quoted: message });
    }
}

// ─── .apk ────────────────────────────────────────────────────────────────
export async function apk(message, client, query) {
    const remoteJid = message.key.remoteJid;

    if (!query) {
        return client.sendMessage(remoteJid, { text: '📦 *USAGE:* .apk <app name>' }, { quoted: message });
    }

    try {
        const apiUrl = `http://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        const app = data?.datalist?.list?.[0];
        if (!app) {
            return client.sendMessage(remoteJid, { text: '❌ No APK found.' }, { quoted: message });
        }

        const appSize = (app.size / 1048576).toFixed(2);
        const caption = `┏━━ ✦ *APK INFO* ✦ ━━┓\n┃ 📱 Name    : *${app.name}*\n┃ 📦 Size    : *${appSize} MB*\n┃ 🧩 Package : *${app.package}*\n┃ 🔖 Version : *${app.file.vername}*\n┗━━━━━━━━━━━━━━━━━━┛\n\n*Powered by: KAIRO ZYNEX*`;

        await client.sendMessage(remoteJid, { image: { url: app.icon }, caption }, { quoted: message });

        await client.sendMessage(remoteJid, {
            document: { url: app.file.path || app.file.path_alt },
            mimetype: 'application/vnd.android.package-archive',
            fileName: `${app.name}.apk`
        }, { quoted: message });

    } catch (err) {
        console.error('APK ERROR:', err);
        await client.sendMessage(remoteJid, { text: '❌ Error, try again.' }, { quoted: message });
    }
}

export default { song, video1, apk };
