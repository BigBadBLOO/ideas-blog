// Usage:
//   node --use-system-ca --env-file=.env scripts/wordstat.mjs top "идеи подарков" "сервировка стола"
//   node --use-system-ca --env-file=.env scripts/wordstat.mjs dynamics "идеи подарков"
//   node --use-system-ca --env-file=.env scripts/wordstat.mjs top --file research/seeds.txt
// Env: WORDSTAT_API_KEY (scope yc.search-api.execute), YC_FOLDER_ID

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://searchapi.api.cloud.yandex.net/v2/wordstat';
const OUT_DIR = 'research/wordstat';
const REQUEST_GAP_MS = 300;

const { WORDSTAT_API_KEY, YC_FOLDER_ID } = process.env;

if (!WORDSTAT_API_KEY || !YC_FOLDER_ID) {
    console.error('Set WORDSTAT_API_KEY and YC_FOLDER_ID in .env');
    process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toSlug = (phrase) => phrase.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

async function callApi(method, body) {
    const response = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: {
            Authorization: `Api-Key ${WORDSTAT_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, folderId: YC_FOLDER_ID }),
    });

    if (!response.ok) {
        const text = await response.text();
        let message = text;

        try {
            message = JSON.parse(text).message ?? text;
        } catch {}

        throw new Error(`${method} ${response.status}: ${message}`);
    }

    return response.json();
}

async function fetchTop(phrase) {
    const data = await callApi('topRequests', { phrase, numPhrases: '2000', devices: ['DEVICE_ALL'] });

    return {
        phrase,
        fetchedAt: new Date().toISOString(),
        totalCount: Number(data.totalCount ?? 0),
        results: (data.results ?? []).map(({ phrase: p, count }) => ({ phrase: p, count: Number(count) })),
        associations: (data.associations ?? []).map(({ phrase: p, count }) => ({ phrase: p, count: Number(count) })),
    };
}

async function fetchDynamics(phrase) {
    const now = new Date();
    const toDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const fromDate = new Date(Date.UTC(toDate.getUTCFullYear() - 2, toDate.getUTCMonth() + 1, 1));

    const data = await callApi('dynamics', {
        phrase,
        period: 'PERIOD_MONTHLY',
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        devices: ['DEVICE_ALL'],
    });

    return {
        phrase,
        fetchedAt: new Date().toISOString(),
        months: (data.results ?? []).map(({ date, count, share }) => ({
            month: date.slice(0, 7),
            count: Number(count),
            share: Number(share),
        })),
    };
}

const METHODS = { top: fetchTop, dynamics: fetchDynamics };

async function readPhrases(args) {
    const fileIndex = args.indexOf('--file');

    if (fileIndex === -1) {
        return args;
    }

    const content = await readFile(args[fileIndex + 1], 'utf8');

    return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
}

const [command, ...rest] = process.argv.slice(2);
const fetcher = METHODS[command];

if (!fetcher) {
    console.error('Command must be "top" or "dynamics"');
    process.exit(1);
}

const phrases = await readPhrases(rest);
const dir = join(OUT_DIR, command);
await mkdir(dir, { recursive: true });

for (const phrase of phrases) {
    try {
        const result = await fetcher(phrase);
        await writeFile(join(dir, `${toSlug(phrase)}.json`), `${JSON.stringify(result, null, 2)}\n`);
        const summary = command === 'top' ? `total ${result.totalCount}, ${result.results.length} phrases` : `${result.months.length} months`;
        console.log(`✓ ${phrase}: ${summary}`);
    } catch (error) {
        console.error(`✗ ${phrase}: ${error.message}`);
    }

    await sleep(REQUEST_GAP_MS);
}
