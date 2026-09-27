// Usage:
//   node --use-system-ca --env-file=.env scripts/telegram.mjs check          проверить бота и права в канале
//   node --use-system-ca --env-file=.env scripts/telegram.mjs publish [N]    опубликовать до N постов, чьё время наступило
// Env: TELEGRAM_BOT_TOKEN (от @BotFather), TELEGRAM_CHANNEL (например @kvestovichok)
// Очередь: content-src/telegram/posts.json — { id, text (HTML), file?, pin?, scheduledFor, status }

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

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
    console.log(`Бот @${me.username}, канал «${chat.title}», статус: ${member.status}`);
    console.log(`Публикация: ${member.can_post_messages ? 'да' : 'нет'}, закрепление: ${member.can_pin_messages ?? member.can_edit_messages ? 'да' : 'нет'}`);
}

async function sendPost(post) {
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
