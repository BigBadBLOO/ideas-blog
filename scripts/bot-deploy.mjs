// Usage: node --use-system-ca --env-file=.env scripts/bot-deploy.mjs
// Деплой бота @kvestovichok_bot (bot/worker.js) в Cloudflare Workers через REST API и подключение вебхука Telegram.
// Env: CF_ACCOUNT_ID, CF_API_TOKEN (шаблон «Edit Cloudflare Workers»), TELEGRAM_BOT_TOKEN

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const WORKER = 'kvestovichok-bot';
const CHANNEL = '@kvestovichok';
const { CF_ACCOUNT_ID, CF_API_TOKEN, TELEGRAM_BOT_TOKEN } = process.env;

if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !TELEGRAM_BOT_TOKEN) {
    console.error('Set CF_ACCOUNT_ID, CF_API_TOKEN and TELEGRAM_BOT_TOKEN in .env');
    process.exit(1);
}

const API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers`;

async function cloudflare(path, { method = 'GET', body, json } = {}) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${CF_API_TOKEN}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
        body: json ? JSON.stringify(json) : body,
        signal: AbortSignal.timeout(60_000),
    });
    const data = await response.json();

    if (!data.success) {
        throw new Error(`${method} ${path}: ${data.errors?.map((error) => error.message).join('; ')}`);
    }

    return data.result;
}

try {
    const form = new FormData();
    form.append(
        'metadata',
        JSON.stringify({
            main_module: 'worker.js',
            compatibility_date: '2026-11-01',
            bindings: [
                { type: 'plain_text', name: 'TELEGRAM_CHANNEL', text: CHANNEL },
                { type: 'secret_text', name: 'TELEGRAM_BOT_TOKEN', text: TELEGRAM_BOT_TOKEN },
            ],
        }),
    );
    form.append('worker.js', new Blob([await readFile('bot/worker.js')], { type: 'application/javascript+module' }), 'worker.js');
    await cloudflare(`/scripts/${WORKER}`, { method: 'PUT', body: form });
    console.log('✓ Воркер загружен');

    await cloudflare(`/scripts/${WORKER}/subdomain`, { method: 'POST', json: { enabled: true } });
    const { subdomain } = await cloudflare('/subdomain');
    const url = `https://${WORKER}.${subdomain}.workers.dev`;

    const secret = createHash('sha256').update(`webhook:${TELEGRAM_BOT_TOKEN}`).digest('hex').slice(0, 32);
    const webhook = await (
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }),
        })
    ).json();

    if (!webhook.ok) {
        throw new Error(`setWebhook: ${webhook.description}`);
    }

    console.log(`✓ Бот развёрнут: ${url}`);
    console.log('  Проверка: https://t.me/kvestovichok_bot?start=mini-kvest-tajna-propavshego-podarka');
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
