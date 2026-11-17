// Usage:
//   node --use-system-ca --env-file=.env scripts/telegram.mjs check          бот, права в канале и число подписчиков
//   node --use-system-ca --env-file=.env scripts/telegram.mjs publish [N]    опубликовать до N постов, чьё время наступило
// Env: TELEGRAM_BOT_TOKEN (от @BotFather), TELEGRAM_CHANNEL (например @kvestovichok)
// Очередь: content-src/telegram/posts.json — { id, text (HTML), file?, pin?, scheduledFor, status }

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const QUEUE_PATH = 'content-src/telegram/posts.json';
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL } = process.env;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL) {
    console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL in .env');
    process.exit(1);
}

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function callApi(method, body) {
    const isForm = body instanceof FormData;
    const response = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        body: isForm ? body : JSON.stringify(body ?? {}),
    });
    const data = await response.json();

    if (!data.ok) {
        throw new Error(`${method}: ${data.description}`);
    }

    return data.result;
}

async function check() {
    const me = await callApi('getMe');
    const chat = await callApi('getChat', { chat_id: TELEGRAM_CHANNEL });
    const member = await callApi('getChatMember', { chat_id: TELEGRAM_CHANNEL, user_id: me.id });
    const subscribers = await callApi('getChatMemberCount', { chat_id: TELEGRAM_CHANNEL });
    console.log(`Бот @${me.username}, канал «${chat.title}», статус: ${member.status}, подписчиков: ${subscribers}`);
    console.log(`Публикация: ${member.can_post_messages ? 'да' : 'нет'}, закрепление: ${member.can_pin_messages ?? member.can_edit_messages ? 'да' : 'нет'}`);
}

// Картинка поста — пин статьи, на которую ссылается пост. Без картинки Дзен (@zen_sync_bot) переносит пост
// с пустой обложкой, и лента его почти не показывает. Свой файл — поле photo, отключить — photo: false.
async function findPhoto(post) {
    if (post.photo !== undefined) {
        return post.photo || null;
    }
    const slug = post.text.match(/kvestovichok\.ru\/[a-z-]+\/([a-z0-9-]+)\//)?.[1];
    const dir = slug && join('public/pins', slug);
    const pins = dir ? (await readdir(dir).catch(() => [])).filter((name) => name.endsWith('.png')).sort() : [];

    if (!pins.length) {
        return null;
    }
    // Разные посты об одной статье получают разные пины
    const hash = [...post.id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);

    return join(dir, pins[hash % pins.length]);
}

async function sendPost(post) {
    const photo = !post.file && (await findPhoto(post));

    if (photo) {
        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHANNEL);
        form.append('caption', post.text);
        form.append('parse_mode', 'HTML');
        form.append('photo', new Blob([await readFile(photo)], { type: 'image/png' }), basename(photo));

        return callApi('sendPhoto', form);
    }

    if (!post.file) {
        return callApi('sendMessage', {
            chat_id: TELEGRAM_CHANNEL,
            text: post.text,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: !post.preview },
        });
    }

    const form = new FormData();
    form.append('chat_id', TELEGRAM_CHANNEL);
    form.append('caption', post.text);
    form.append('parse_mode', 'HTML');
    form.append('document', new Blob([await readFile(post.file)], { type: 'application/pdf' }), basename(post.file));

    return callApi('sendDocument', form);
}

async function publish(limit) {
    const queue = JSON.parse(await readFile(QUEUE_PATH, 'utf8'));
    const now = Date.now();
    const due = queue.filter((post) => post.status === 'pending' && Date.parse(post.scheduledFor) <= now).slice(0, limit);

    for (const post of due) {
        try {
            const message = await sendPost(post);

            if (post.pin) {
                await callApi('pinChatMessage', { chat_id: TELEGRAM_CHANNEL, message_id: message.message_id, disable_notification: true });
            }

            Object.assign(post, { status: 'published', messageId: message.message_id, publishedAt: new Date().toISOString() });
            delete post.lastError;
            console.log(`✓ ${post.id} → сообщение ${message.message_id}`);
        } catch (error) {
            post.lastError = error.message;
            console.error(`✗ ${post.id}: ${error.message}`);
        }
    }

    await writeFile(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`);
    console.log(`Опубликовано ${due.filter((post) => post.status === 'published').length} из ${due.length}`);
}

const [command, arg] = process.argv.slice(2);

if (command === 'check') {
    await check();
} else if (command === 'publish') {
    await publish(Number(arg ?? 1));
} else {
    console.error('Команда: check | publish [N]');
    process.exit(1);
}
