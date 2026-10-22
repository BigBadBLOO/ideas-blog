// Usage: node --use-system-ca --env-file=.env scripts/pinterest-oauth.mjs
// Разовая авторизация OAuth: открывает браузер, принимает код на http://localhost:8085/ и сохраняет
// refresh-токен (365 дней) в .pinterest-oauth.json. Дальше scripts/pinterest.mjs сам получает access-токены.
// Env: PINTEREST_APP_ID, PINTEREST_APP_SECRET

import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}/`;
const SCOPES = ['boards:read', 'boards:write', 'pins:read', 'pins:write', 'user_accounts:read'];
const OAUTH_FILE = '.pinterest-oauth.json';

const { PINTEREST_APP_ID, PINTEREST_APP_SECRET } = process.env;

if (!PINTEREST_APP_ID || !PINTEREST_APP_SECRET) {
    console.error('Set PINTEREST_APP_ID and PINTEREST_APP_SECRET in .env');
    process.exit(1);
}

const state = randomBytes(16).toString('hex');
const authorizeUrl = new URL('https://www.pinterest.com/oauth/');
authorizeUrl.search = new URLSearchParams({
    client_id: PINTEREST_APP_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
}).toString();

async function exchangeCode(code) {
    const response = await fetch('https://api.pinterest.com/v5/oauth/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${PINTEREST_APP_ID}:${PINTEREST_APP_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`oauth/token ${response.status}: ${JSON.stringify(data)}`);
    }

    return data;
}

const server = createServer(async (request, response) => {
    const url = new URL(request.url, REDIRECT_URI);
    const code = url.searchParams.get('code');

    if (!code) {
        response.writeHead(404).end();
        return;
    }

    try {
        if (url.searchParams.get('state') !== state) {
            throw new Error('state не совпадает');
        }

        const token = await exchangeCode(code);
        await writeFile(
            OAUTH_FILE,
            `${JSON.stringify(
                {
                    refreshToken: token.refresh_token,
                    refreshTokenExpiresAt: new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString(),
                    scope: token.scope,
                },
                null,
                2,
            )}\n`,
        );
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<h1>Готово, вкладку можно закрыть.</h1>');
        console.log(`✓ Авторизация прошла. Права: ${token.scope}. Refresh-токен до ${token.refresh_token_expires_in / 86400} дней → ${OAUTH_FILE}`);
    } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(error.message);
        console.error(`✗ ${error.message}`);
    } finally {
        server.close();
    }
});

server.listen(PORT, () => {
    console.log('Открываю Pinterest для авторизации… Нажми «Дать доступ».');
    execFile('open', [authorizeUrl.toString()]);
});
