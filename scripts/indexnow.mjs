// Usage:
//   node --use-system-ca scripts/indexnow.mjs                 сообщить Яндексу обо всех страницах из sitemap сайта
//   node --use-system-ca scripts/indexnow.mjs /kvesty/slug/   только о перечисленных страницах (путь или полный адрес)
// IndexNow: Яндекс сам приходит за страницами, без Вебмастера. Ключ публичный, файл с ним лежит в public/<ключ>.txt

import { readFile } from 'node:fs/promises';

const KEY = 'ca6107066c0a0b9ad14b6f8eeefe71f6';
const ENDPOINT = 'https://yandex.com/indexnow';

const siteConfig = await readFile('src/site.config.ts', 'utf8');
const SITE_URL = siteConfig.match(/url:\s*'([^']+)'/)[1];
const HOST = new URL(SITE_URL).host;

async function fetchText(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });

    if (!response.ok) {
        throw new Error(`${response.status} ${url}`);
    }

    return response.text();
}

async function sitemapUrls() {
    const index = await fetchText(`${SITE_URL}/sitemap-index.xml`);
    const sitemaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
    const urls = [];

    for (const sitemap of sitemaps) {
        const xml = await fetchText(sitemap);
        urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc));
    }

    return urls;
}

try {
    // Яндекс проверяет ключ по файлу на сайте — если сайт ещё не выложен с ключом, запрос отклонят
    const keyOnSite = await fetchText(`${SITE_URL}/${KEY}.txt`).catch(() => '');

    if (keyOnSite.trim() !== KEY) {
        throw new Error(`${SITE_URL}/${KEY}.txt не отдаёт ключ — сначала выложите сайт (git push)`);
    }

    const args = process.argv.slice(2);
    const urlList = args.length ? args.map((arg) => new URL(arg, SITE_URL).href) : await sitemapUrls();

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host: HOST, key: KEY, urlList }),
        signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
        throw new Error(`${response.status} ${ENDPOINT}: ${await response.text()}`);
    }

    console.log(`✓ Яндекс принял ${urlList.length} адр. (${response.status})`);
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
