async function fetchWiki(topic, lang) {
    const title = encodeURIComponent(topic.trim().replace(/\s+/g, '_'));
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'WhatsAppBot/1.0' } });
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
    return response.json();
}

export async function wiki(message, client, topic, lang = 'en') {
    if (!topic) return client.sendMessage(message.key.remoteJid, { text: `Usage: .wiki-${lang} <topic>` }, { quoted: message });
    try {
        const data = await fetchWiki(topic, lang);
        if (data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') throw new Error('Topic not found');
        const text = `📚 ${data.title || topic}\n\n${data.extract || 'No summary available.'}\n\n🔗 ${data.content_urls?.desktop?.page || ''}`;
        await client.sendMessage(message.key.remoteJid, { text }, { quoted: message });
    } catch (e) {
        await client.sendMessage(message.key.remoteJid, { text: `❌ Wiki error: ${e.message}` }, { quoted: message });
    }
}

export async function kairo(message, client, question) {
    if (!question) return client.sendMessage(message.key.remoteJid, { text: 'Usage: .kairo <question>' }, { quoted: message });
    try {
        const data = await fetchWiki(question, 'en');
        await client.sendMessage(message.key.remoteJid, {
            text: `🔎 ${data.title || question}\n\n${data.extract || 'No result found.'}`
        }, { quoted: message });
    } catch {
        await client.sendMessage(message.key.remoteJid, { text: '❌ No result found. Try .wiki-en <topic>.' }, { quoted: message });
    }
}

export default { wiki, kairo };
