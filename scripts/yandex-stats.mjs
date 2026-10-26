// Usage:
//   node --use-system-ca --env-file=.env scripts/yandex-stats.mjs metrika [days=7]    трафик, источники, страницы, цели
//   node --use-system-ca --env-file=.env scripts/yandex-stats.mjs webmaster           индексация и поисковые запросы
// Env: YANDEX_OAUTH_TOKEN (scopes metrika:read, webmaster:hostinfo); номер счётчика берётся из src/site.config.ts

import { readFile } from 'node:fs/promises';

const { YANDEX_OAUTH_TOKEN } = process.env;

if (!YANDEX_OAUTH_TOKEN) {
    console.error('Set YANDEX_OAUTH_TOKEN in .env');
    process.exit(1);
}

const siteConfig = await readFile('src/site.config.ts', 'utf8');
const COUNTER_ID = siteConfig.match(/yandexMetrikaId:\s*'(\d+)'/)?.[1];
const HOST = new URL(siteConfig.match(/url:\s*'([^']+)'/)[1]).host;

async function get(url) {
    let response;

    try {
        response = await fetch(url, {
            headers: { Authorization: `OAuth ${YANDEX_OAUTH_TOKEN}` },
            signal: AbortSignal.timeout(20_000),
        });
    } catch (error) {
        const reason = error.name === 'TimeoutError' ? 'нет ответа за 20 с' : (error.cause?.code ?? error.message);
        throw new Error(`${new URL(url).host} недоступен (${reason}). Проверьте сеть: VPN, exit node, корпоративный прокси.`);
    }


    if (!response.ok) {
        throw new Error(`${response.status} ${url}: ${await response.text()}`);
    }

    return response.json();
}

const table = (rows) => console.table(rows);

async function metrika(days) {
    if (!COUNTER_ID) {
        throw new Error('В src/site.config.ts не задан yandexMetrikaId');
    }

    const base = `https://api-metrika.yandex.net/stat/v1/data?ids=${COUNTER_ID}&date1=${days}daysAgo&date2=today&accuracy=full`;
    const { goals = [] } = await get(`https://api-metrika.yandex.net/management/v1/counter/${COUNTER_ID}/goals`);
    const goalMetrics = goals.map((goal) => `ym:s:goal${goal.id}reaches`);

    const totals = await get(`${base}&metrics=${['ym:s:visits', 'ym:s:users', 'ym:s:bounceRate', 'ym:s:avgVisitDurationSeconds', ...goalMetrics].join(',')}`);
    const [visits, users, bounce, duration, ...goalValues] = totals.totals;
    console.log(`\nЗа ${days} дн.: визитов ${visits}, посетителей ${users}, отказов ${bounce.toFixed(1)}%, время ${Math.round(duration)} с`);
    goals.forEach((goal, i) => console.log(`Цель «${goal.name}»: ${goalValues[i]}`));

    const sources = await get(`${base}&metrics=ym:s:visits&dimensions=ym:s:lastTrafficSource,ym:s:lastSourceEngine&sort=-ym:s:visits&limit=15`);
    console.log('\nИсточники:');
    table(sources.data.map((row) => ({ источник: row.dimensions[0].name, система: row.dimensions[1].name ?? '', визиты: row.metrics[0] })));

    const pages = await get(`${base}&metrics=ym:s:visits,ym:s:bounceRate&dimensions=ym:s:startURLPath&sort=-ym:s:visits&limit=20`);
    console.log('\nСтраницы входа:');
    table(pages.data.map((row) => ({ страница: row.dimensions[0].name, визиты: row.metrics[0], отказы: `${row.metrics[1].toFixed(0)}%` })));
}

async function webmaster() {
    const { user_id: userId } = await get('https://api.webmaster.yandex.net/v4/user');
    const { hosts } = await get(`https://api.webmaster.yandex.net/v4/user/${userId}/hosts`);
    // Сайт заведён и как http, и как https; данные бывают загружены только по одному из них — https пробуем первым
    const candidates = hosts
        .filter((item) => new URL(item.ascii_host_url).host === HOST)
        .sort((a, b) => Number(b.ascii_host_url.startsWith('https:')) - Number(a.ascii_host_url.startsWith('https:')));

    if (!candidates.length) {
        throw new Error(`Сайт ${HOST} не найден в Вебмастере`);
    }

    let host, api, summary;

    for (const item of candidates) {
        host = item;
        api = `https://api.webmaster.yandex.net/v4/user/${userId}/hosts/${encodeURIComponent(item.host_id)}`;

        try {
            summary = await get(`${api}/summary`);
            break;
        } catch (error) {
            if (!error.message.includes('HOST_NOT_LOADED') || item === candidates.at(-1)) {
                throw error;
            }
        }
    }
    console.log(`\n${host.ascii_host_url}: в поиске ${summary.searchable_pages_count ?? 0} стр., исключено ${summary.excluded_pages_count ?? 0}, ИКС ${summary.sqi ?? 0}`);

    if (summary.site_problems && Object.keys(summary.site_problems).length) {
        console.log('Проблемы:', summary.site_problems);
    }

    const queries = await get(
        `${api}/search-queries/popular?order_by=TOTAL_SHOWS&query_indicator=TOTAL_SHOWS&query_indicator=TOTAL_CLICKS&query_indicator=AVG_SHOW_POSITION&limit=30`,
    );
    console.log('\nПоисковые запросы (последние 7 дней):');
    table(
        (queries.queries ?? []).map((query) => ({
            запрос: query.query_text,
            показы: query.indicators.TOTAL_SHOWS,
            клики: query.indicators.TOTAL_CLICKS,
            позиция: query.indicators.AVG_SHOW_POSITION?.toFixed(1),
        })),
    );
}

const [command, arg] = process.argv.slice(2);

try {
    if (command === 'metrika') {
        await metrika(Number(arg ?? 7));
    } else if (command === 'webmaster') {
        await webmaster();
    } else {
        console.error('Команда: metrika [days] | webmaster');
        process.exit(1);
    }
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
