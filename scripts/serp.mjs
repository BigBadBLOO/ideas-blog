// Usage: node --use-system-ca --env-file=.env scripts/serp.mjs --file research/serp-queries.txt
// Top-10 Yandex results per query via Yandex Cloud Search API → research/serp/<slug>.json

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://searchapi.api.cloud.yandex.net/v2/web/search';
const OUT_DIR = 'research/serp';
const REQUEST_GAP_MS = 300;

const { WORDSTAT_API_KEY, YC_FOLDER_ID } = process.env;

if (!WORDSTAT_API_KEY || !YC_FOLDER_ID) {
    console.error('Set WORDSTAT_API_KEY and YC_FOLDER_ID in .env');
    process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toSlug = (phrase) => phrase.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

const stripTags = (value) => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function parseDocs(xml) {
    return [...xml.matchAll(/<doc\b[^>]*>([\s\S]*?)<\/doc>/g)].map(([, doc]) => ({
        url: stripTags(doc.match(/<url>([\s\S]*?)<\/url>/)?.[1] ?? ''),
        domain: stripTags(doc.match(/<domain>([\s\S]*?)<\/domain>/)?.[1] ?? ''),
        title: stripTags(doc.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''),
    }));
}

async function fetchSerp(queryText) {
    const response = await fetch(API, {
        method: 'POST',
        headers: {
            Authorization: `Api-Key ${WORDSTAT_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query: { searchType: 'SEARCH_TYPE_RU', queryText },
            groupSpec: { groupMode: 'GROUP_MODE_DEEP', groupsOnPage: '10', docsInGroup: '1' },
            region: '225',
            l10n: 'LOCALIZATION_RU',
            responseFormat: 'FORMAT_XML',
            folderId: YC_FOLDER_ID,
        }),
    });

    if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`);
    }

    const { rawData } = await response.json();

    return parseDocs(Buffer.from(rawData, 'base64').toString('utf8'));
}

const fileIndex = process.argv.indexOf('--file');
const queries =
    fileIndex === -1
        ? process.argv.slice(2)
        : (await readFile(process.argv[fileIndex + 1], 'utf8'))
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line && !line.startsWith('#'));

await mkdir(OUT_DIR, { recursive: true });

for (const query of queries) {
    try {
        const docs = await fetchSerp(query);
        await writeFile(
            join(OUT_DIR, `${toSlug(query)}.json`),
            `${JSON.stringify({ query, fetchedAt: new Date().toISOString(), docs }, null, 2)}\n`,
        );
        console.log(`\n## ${query}`);
        docs.forEach((doc, i) => console.log(`${i + 1}. ${doc.domain} — ${doc.title.slice(0, 80)}`));
    } catch (error) {
        console.error(`✗ ${query}: ${error.message}`);
    }

    await sleep(REQUEST_GAP_MS);
}
