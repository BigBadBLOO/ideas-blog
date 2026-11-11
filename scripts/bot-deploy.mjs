// Usage: node --use-system-ca --env-file=.env scripts/bot-deploy.mjs
// Деплой бота @kvestovichok_bot (bot/) в Yandex Cloud Functions через REST API и подключение вебхука Telegram.
// Без yc CLI: его gRPC не проходит через корпоративную сеть, а HTTPS из Node проходит.
// Env: YC_SA_KEY_FILE — путь к авторизованному ключу сервисного аккаунта (JSON из консоли Облака, роль functions.admin),
//      YC_FOLDER_ID, TELEGRAM_BOT_TOKEN. OAuth-токены, выпущенные после 01.06.2026, Облако на IAM-токен не меняет.

import { execFile } from 'node:child_process';
import { constants, createHash, sign } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const FUNCTION_NAME = 'kvestovichok-bot';
const CHANNEL = '@kvestovichok';
const RUNTIME = process.env.RUNTIME ?? 'nodejs22';
const FUNCTIONS_API = 'https://serverless-functions.api.cloud.yandex.net/functions/v1';
const IAM_TOKENS_URL = 'https://iam.api.cloud.yandex.net/iam/v1/tokens';
const { YC_SA_KEY_FILE, YC_FOLDER_ID, TELEGRAM_BOT_TOKEN } = process.env;

if (!YC_SA_KEY_FILE || !YC_FOLDER_ID || !TELEGRAM_BOT_TOKEN) {
    console.error('Set YC_SA_KEY_FILE, YC_FOLDER_ID and TELEGRAM_BOT_TOKEN in .env');
    process.exit(1);
}

const run = promisify(execFile);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function request(url, { method = 'GET', body, token } = {}) {
    const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(`${response.status} ${method} ${url}: ${data.message ?? JSON.stringify(data)}`);
    }

    return data;
}

async function waitOperation(operation, token) {
    let current = operation;

    while (!current.done) {
        await sleep(1500);
        current = await request(`https://operation.api.cloud.yandex.net/operations/${operation.id}`, { token });
    }

    if (current.error) {
        throw new Error(`Операция ${current.description}: ${current.error.message}`);
    }

    return current.response;
}

// IAM-токен по ключу сервисного аккаунта: JWT (PS256), подписанный приватным ключом из JSON
async function getIamToken() {
    const key = JSON.parse(await readFile(YC_SA_KEY_FILE.replace(/^~/, process.env.HOME), 'utf8'));
    const now = Math.floor(Date.now() / 1000);
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ typ: 'JWT', alg: 'PS256', kid: key.id })}.${encode({ aud: IAM_TOKENS_URL, iss: key.service_account_id, iat: now, exp: now + 600 })}`;
    const signature = sign('sha256', Buffer.from(unsigned), {
        key: key.private_key,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    }).toString('base64url');
    const { iamToken } = await request(IAM_TOKENS_URL, { method: 'POST', body: { jwt: `${unsigned}.${signature}` } });

    return iamToken;
}

async function zipBot() {
    const dir = await mkdtemp(join(tmpdir(), 'bot-'));
    const zipPath = join(dir, 'bot.zip');
    await run('zip', ['-q', '-j', zipPath, resolve('bot/index.js'), resolve('bot/package.json')]);
    const content = (await readFile(zipPath)).toString('base64');
    await rm(dir, { recursive: true, force: true });

    return content;
}

try {
    const token = await getIamToken();

    const { runtimes } = await request(`${FUNCTIONS_API}/runtimes`, { token });

    if (!runtimes.includes(RUNTIME)) {
        throw new Error(`Рантайм ${RUNTIME} недоступен, есть: ${runtimes.filter((name) => name.startsWith('nodejs')).join(', ')}`);
    }

    const filter = encodeURIComponent(`name="${FUNCTION_NAME}"`);
    let [fn] = (await request(`${FUNCTIONS_API}/functions?folderId=${YC_FOLDER_ID}&filter=${filter}`, { token })).functions ?? [];

    if (!fn) {
        const operation = await request(`${FUNCTIONS_API}/functions`, {
            method: 'POST',
            token,
            body: { folderId: YC_FOLDER_ID, name: FUNCTION_NAME, description: 'Telegram-бот: PDF-квесты подписчикам канала' },
        });
        fn = await waitOperation(operation, token);
        console.log(`✓ Функция создана: ${fn.id}`);
    }

    const version = await request(`${FUNCTIONS_API}/versions`, {
        method: 'POST',
        token,
        body: {
            functionId: fn.id,
            runtime: RUNTIME,
            entrypoint: 'index.handler',
            resources: { memory: String(128 * 1024 * 1024) },
            executionTimeout: '10s',
            environment: { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL: CHANNEL },
            content: await zipBot(),
        },
    });
    await waitOperation(version, token);
    console.log('✓ Новая версия загружена');

    // Вызывать функцию может кто угодно (Telegram), чужие запросы отсекает секрет вебхука в bot/index.js
    await waitOperation(
        await request(`${FUNCTIONS_API}/functions/${fn.id}:updateAccessBindings`, {
            method: 'POST',
            token,
            body: {
                accessBindingDeltas: [
                    { action: 'ADD', accessBinding: { roleId: 'functions.functionInvoker', subject: { id: 'allUsers', type: 'system' } } },
                ],
            },
        }),
        token,
    ).catch((error) => {
        if (!error.message.includes('already')) {
            throw error;
        }
    });

    const url = `https://functions.yandexcloud.net/${fn.id}`;
    const secret = createHash('sha256').update(`webhook:${TELEGRAM_BOT_TOKEN}`).digest('hex').slice(0, 32);
    const webhook = await request(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        body: { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true },
    });

    if (!webhook.ok) {
        throw new Error(`setWebhook: ${webhook.description}`);
    }

    console.log(`✓ Бот развёрнут: ${url}`);
    console.log('  Проверка: https://t.me/kvestovichok_bot?start=mini-kvest-tajna-propavshego-podarka');
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
