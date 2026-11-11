// Usage:
//   node --use-system-ca --env-file=.env scripts/vk.mjs check               проверить ключ и группу
//   node --use-system-ca --env-file=.env scripts/vk.mjs preview <id>        показать, как пост из очереди будет выглядеть в ВК
//   node --use-system-ca --env-file=.env scripts/vk.mjs publish [N]         повторить в ВК до N постов, уже вышедших в Telegram
// Env: VK_GROUP_TOKEN (ключ сообщества с правом «стена»), VK_GROUP_ID (число)
// Очередь общая с Telegram: content-src/telegram/posts.json. В ВК уходят посты без файла, вышедшие в Telegram
// не раньше VK_SINCE; после публикации у поста появляется vkPostId.
// Ключ сообщества не умеет загружать фото на стену, поэтому картинка поста — превью ссылки на статью (og:image).

import { readFile, writeFile } from 'node:fs/promises';

const QUEUE_PATH = 'content-src/telegram/posts.json';
const VK_SINCE = '2026-11-12';
const API_VERSION = '5.199';
const { VK_GROUP_TOKEN, VK_GROUP_ID } = process.env;

if (!VK_GROUP_TOKEN || !VK_GROUP_ID) {
    console.error('Set VK_GROUP_TOKEN and VK_GROUP_ID in .env');
    process.exit(1);
}

async function callApi(method, params) {
    const response = await fetch(`https://api.vk.com/method/${method}`, {
        method: 'POST',
        body: new URLSearchParams({ ...params, access_token: VK_GROUP_TOKEN, v: API_VERSION }),
        signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json();

    if (data.error) {
        throw new Error(`${method}: ${data.error.error_code} ${data.error.error_msg}`);
    }

    return data.response;
}

const decodeEntities = (text) =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// В ссылки на сайт добавляем utm_source=vk, чтобы переходы из ВК были видны в Метрике отдельно
const withUtm = (url) => {
    if (!url.includes('kvestovichok.ru')) {
        return url;
    }

    const parsed = new URL(url);
    parsed.searchParams.set('utm_source', 'vk');
    parsed.searchParams.set('utm_medium', 'post');

    return parsed.href;
};

// Telegram-HTML → простой текст ВК: ссылки раскрываем, спойлеры-ответы переносим в конец поста
export function toVkText(html) {
    const answers = [];
    let text = html
        .replace(/<tg-spoiler>([\s\S]*?)<\/tg-spoiler>/g, (_, answer) => {
            answers.push(answer);
            return 'в конце поста';
        })
        .replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, (_, url, label) => `${label} — ${url}`)
        .replace(/<[^>]+>/g, '');

    if (answers.length) {
        text += `\n\n.\n.\n.\nОтвет: ${answers.join('; ')}`;
    }

    return decodeEntities(text).replace(/https:\/\/kvestovichok\.ru[^\s)»]*/g, withUtm);
}

const firstSiteLink = (text) => text.match(/https:\/\/kvestovichok\.ru[^\s)»]*/)?.[0];

function buildPost(post) {
    const message = toVkText(post.text);
    const link = firstSiteLink(message);

    return { message, ...(link ? { attachments: link } : {}) };
}

async function check() {
    const [group] = (await callApi('groups.getById', { group_id: VK_GROUP_ID })).groups;
    const { permissions } = await callApi('groups.getTokenPermissions', {});
    const names = permissions.map((permission) => permission.name);
    console.log(`Группа «${group.name}» (vk.com/${group.screen_name}), права ключа: ${names.join(', ')}`);

    if (!names.includes('wall')) {
        throw new Error('У ключа нет права «стена» — пересоздайте ключ в «Управление → Работа с API»');
    }
}

async function preview(id) {
    const queue = JSON.parse(await readFile(QUEUE_PATH, 'utf8'));
    const post = queue.find((item) => item.id === id);

    if (!post) {
        throw new Error(`Пост ${id} не найден в очереди`);
    }

    const { message, attachments } = buildPost(post);
    console.log(`${message}\n\n[превью ссылки: ${attachments ?? 'нет'}]`);
}

async function publish(limit) {
    const queue = JSON.parse(await readFile(QUEUE_PATH, 'utf8'));
    const due = queue
        .filter((post) => post.status === 'published' && !post.file && !post.vkPostId && post.scheduledFor >= VK_SINCE)
        .slice(0, limit);

    for (const post of due) {
        try {
            const { post_id: postId } = await callApi('wall.post', {
                owner_id: `-${VK_GROUP_ID}`,
                from_group: 1,
                ...buildPost(post),
            });
            Object.assign(post, { vkPostId: postId, vkPublishedAt: new Date().toISOString() });
            delete post.vkLastError;
            console.log(`✓ ${post.id} → vk.com/wall-${VK_GROUP_ID}_${postId}`);
        } catch (error) {
            post.vkLastError = error.message;
            console.error(`✗ ${post.id}: ${error.message}`);
        }
    }

    await writeFile(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`);
    console.log(`В ВК опубликовано ${due.filter((post) => post.vkPostId).length} из ${due.length}`);
}

const [command, arg] = process.argv.slice(2);

try {
    if (command === 'check') {
        await check();
    } else if (command === 'preview') {
        await preview(arg);
    } else if (command === 'publish') {
        await publish(Number(arg ?? 1));
    } else {
        console.error('Команда: check | preview <id> | publish [N]');
        process.exit(1);
    }
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
