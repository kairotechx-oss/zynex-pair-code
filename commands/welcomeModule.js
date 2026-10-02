import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { jidNormalizedUser } from 'baileys';
import configManager from '../utils/manageConfigs.js';

function getGroupCfg(groupId) {
    configManager.config.groups ||= {};
    configManager.config.groups[groupId] ||= {};
    return configManager.config.groups[groupId];
}

function isEnabled(groupId) {
    return getGroupCfg(groupId).welcome !== false;
}

async function getDisplayName(groupMetadata, participantString) {
    const user = participantString.split('@')[0];
    try {
        const participant = groupMetadata.participants.find(p => p.id === participantString);
        if (participant?.name) return participant.name;
    } catch {}
    return user;
}

async function buildMessage(socket, groupId, participantString, type) {
    const groupMetadata = await socket.groupMetadata(groupId);
    const groupName = groupMetadata.subject;
    const groupDesc = groupMetadata.desc || 'No description available';
    const displayName = await getDisplayName(groupMetadata, participantString);
    const cfg = getGroupCfg(groupId);

    const customMessage = type === 'add' ? cfg.welcomeText : cfg.goodbyeText;

    let finalMessage;
    if (customMessage) {
        finalMessage = customMessage
            .replace(/{user}/g, `@${displayName}`)
            .replace(/{group}/g, groupName)
            .replace(/{description}/g, groupDesc);
    } else if (type === 'add') {
        const timeString = new Date().toLocaleString('en-US');
        finalMessage = `╭╼━≪•𝙽𝙴𝚆 𝙼𝙴𝙼𝙱𝙴𝚁•≫━╾╮\n┃𝚆𝙴𝙻𝙲𝙾𝙼𝙴: @${displayName} 👋\n┃Member count: #${groupMetadata.participants.length}\n┃𝚃𝙸𝙼𝙴: ${timeString}⏰\n╰━━━━━━━━━━━━━━━╯\n\n*@${displayName}* Welcome to *${groupName}*! 🎉\n*Group 𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝚃𝙸𝙾𝙽*\n${groupDesc}\n\n> *Powered by KAIRO ZYNEX*`;
    } else {
        finalMessage = `*@${displayName}* we will never miss you! 👋\n\n> *Powered by KAIRO ZYNEX*`;
    }

    return { finalMessage, groupName, groupMetadata, displayName };
}

async function sendJoinLeaveMessage(socket, groupId, participantString, type) {
    try {
        const { finalMessage, groupName, groupMetadata, displayName } = await buildMessage(socket, groupId, participantString, type);

        let profilePicUrl = null;
        try { profilePicUrl = await socket.profilePictureUrl(participantString, 'image'); } catch {}

        try {
            const kind = type === 'add' ? 'gaming3' : 'gaming1';
            const action = type === 'add' ? 'join' : 'leave';
            const color = type === 'add' ? 'green' : 'red';
            const avatarParam = profilePicUrl ? `&avatar=${encodeURIComponent(profilePicUrl)}` : '';

            const apiUrl = `https://api.some-random-api.com/welcome/img/2/${kind}?type=${action}&textcolor=${color}&username=${encodeURIComponent(displayName)}&guildName=${encodeURIComponent(groupName)}&memberCount=${groupMetadata.participants.length}${avatarParam}`;

            const response = await fetch(apiUrl);
            if (response.ok) {
                const imageBuffer = await response.buffer();
                await socket.sendMessage(groupId, {
                    image: imageBuffer,
                    caption: finalMessage,
                    mentions: [participantString]
                });
                return;
            }
        } catch (imageError) {
            console.log('Welcome/goodbye image generation failed, falling back to local photo:', imageError.message);
        }

        // Fallback: bot's own local photo instead of a plain text message.
        await socket.sendMessage(groupId, {
            image: fs.readFileSync(path.join(process.cwd(), 'menu.jpg')),
            caption: finalMessage,
            mentions: [participantString]
        });

    } catch (error) {
        console.error('Error sending welcome/goodbye message:', error);
    }
}

// ─── Called ONCE right after the socket is created (in utils/connector.js) ──
export function initWelcome(socket) {
    try {
        if (!socket || !socket.user || !socket.user.id) return;
        if (socket._welcomeListenerAttached) return;
        socket._welcomeListenerAttached = true;

        const sessionJid = jidNormalizedUser(socket.user.id);
        const socketId = sessionJid.split('@')[0];

        const listener = async (update) => {
            try {
                const { id: groupId, participants, action } = update || {};
                if (!groupId || !participants?.length) return;
                if (action !== 'add' && action !== 'remove') return;
                if (!isEnabled(groupId)) return;

                for (const participant of participants) {
                    const participantString = typeof participant === 'string' ? participant : (participant.id || participant.toString());
                    await sendJoinLeaveMessage(socket, groupId, participantString, action);
                }
            } catch (e) {
                console.error('Welcome/goodbye listener error:', e.message);
            }
        };

        socket.ev.on('group-participants.update', listener);
        if (!global.welcomeActiveListeners) global.welcomeActiveListeners = new Map();
        global.welcomeActiveListeners.set(socketId, listener);
    } catch (e) {
        console.error('Welcome init error:', e.message);
    }
}

async function isSenderAdminOrOwner(client, remoteJid, senderJid, isOwner) {
    if (isOwner) return true;
    try {
        const groupMetadata = await client.groupMetadata(remoteJid);
        return groupMetadata.participants.some(p => p.id === senderJid && p.admin);
    } catch {
        return false;
    }
}

// ─── .welcome [on|off|<custom text with {user} {group} {description}>] ─────
export async function welcomeToggle(message, client, args, isOwner) {
    const remoteJid = message.key.remoteJid;
    if (!remoteJid.endsWith('@g.us')) {
        return client.sendMessage(remoteJid, { text: '👥 This command only works in groups.' }, { quoted: message });
    }

    const senderJid = message.key.participant || message.key.remoteJid;
    if (!(await isSenderAdminOrOwner(client, remoteJid, senderJid, isOwner))) {
        return client.sendMessage(remoteJid, { text: '❌ Only group admins or the bot owner can configure this.' }, { quoted: message });
    }

    const cfg = getGroupCfg(remoteJid);
    const option = (args[0] || '').toLowerCase();

    if (option === 'on') {
        cfg.welcome = true;
        configManager.save();
        return client.sendMessage(remoteJid, { text: '✅ Welcome & Goodbye messages turned ON for this group.' }, { quoted: message });
    }
    if (option === 'off') {
        cfg.welcome = false;
        configManager.save();
        return client.sendMessage(remoteJid, { text: '✅ Welcome & Goodbye messages turned OFF for this group.' }, { quoted: message });
    }

    const customText = args.join(' ').trim();
    if (customText) {
        cfg.welcomeText = customText;
        configManager.save();
        return client.sendMessage(remoteJid, { text: '✅ Custom welcome message saved.\nPlaceholders: {user} {group} {description}' }, { quoted: message });
    }

    return client.sendMessage(remoteJid, {
        text: `👋 Welcome Settings\n\n🔸 Status: ${isEnabled(remoteJid) ? 'ON' : 'OFF'}\n🔸 Custom message: ${cfg.welcomeText ? 'yes' : 'default'}\n\nUsage:\n.welcome on\n.welcome off\n.welcome <text with {user} {group} {description}>`
    }, { quoted: message });
}

// ─── .goodbye [on|off|<custom text with {user} {group}>] ───────────────────
export async function goodbyeToggle(message, client, args, isOwner) {
    const remoteJid = message.key.remoteJid;
    if (!remoteJid.endsWith('@g.us')) {
        return client.sendMessage(remoteJid, { text: '👥 This command only works in groups.' }, { quoted: message });
    }

    const senderJid = message.key.participant || message.key.remoteJid;
    if (!(await isSenderAdminOrOwner(client, remoteJid, senderJid, isOwner))) {
        return client.sendMessage(remoteJid, { text: '❌ Only group admins or the bot owner can configure this.' }, { quoted: message });
    }

    const cfg = getGroupCfg(remoteJid);
    const option = (args[0] || '').toLowerCase();

    if (option === 'on') {
        cfg.welcome = true;
        configManager.save();
        return client.sendMessage(remoteJid, { text: '✅ Welcome & Goodbye messages turned ON for this group.' }, { quoted: message });
    }
    if (option === 'off') {
        cfg.welcome = false;
        configManager.save();
        return client.sendMessage(remoteJid, { text: '✅ Welcome & Goodbye messages turned OFF for this group.' }, { quoted: message });
    }

    const customText = args.join(' ').trim();
    if (customText) {
        cfg.goodbyeText = customText;
        configManager.save();
        return client.sendMessage(remoteJid, { text: '✅ Custom goodbye message saved.\nPlaceholders: {user} {group}' }, { quoted: message });
    }

    return client.sendMessage(remoteJid, {
        text: `👋 Goodbye Settings\n\n🔸 Status: ${isEnabled(remoteJid) ? 'ON' : 'OFF'}\n🔸 Custom message: ${cfg.goodbyeText ? 'yes' : 'default'}\n\nUsage:\n.goodbye on\n.goodbye off\n.goodbye <text with {user} {group}>`
    }, { quoted: message });
}

export default { initWelcome, welcomeToggle, goodbyeToggle };
