// Usage: node scripts/pins-csv.mjs [days=28]
// Пины из pins/queue.json (status pending) с датой в ближайшие N дней → pins/pinterest-bulk.csv
// для массовой загрузки в Pinterest (Создать → Массовое создание пинов). Выгруженные получают status "csv".

import { readFile, writeFile } from 'node:fs/promises';

const QUEUE_PATH = 'pins/queue.json';
const CSV_PATH = 'pins/pinterest-bulk.csv';
const MEDIA_BASE = 'https://raw.githubusercontent.com/BigBadBLOO/ideas-blog/main/public';
const LINK_ORIGIN = process.env.PINS_LINK_ORIGIN ?? 'http://kvestovichok.ru';

const days = Number(process.argv[2] ?? 28);
const horizon = Date.now() + days * 86_400_000;
const queue = JSON.parse(await readFile(QUEUE_PATH, 'utf8'));
const batch = queue.filter((pin) => pin.status === 'pending' && Date.parse(pin.scheduledFor) <= horizon);

const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const toUtc = (iso) => new Date(iso).toISOString().slice(0, 19);

const rows = [
    ['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords'],
    ...batch.map((pin) => [
        pin.title,
        `${MEDIA_BASE}${pin.imagePath.replace(/^public/, '')}`,
        pin.board,
        '',
        pin.description,
        pin.link.replace(/^https?:\/\/[^/]+/, LINK_ORIGIN),
        toUtc(pin.scheduledFor),
        '',
    ]),
];

await writeFile(CSV_PATH, `${rows.map((row) => row.map(cell).join(',')).join('\n')}\n`);

for (const pin of batch) {
    Object.assign(pin, { status: 'csv', exportedAt: new Date().toISOString() });
}

await writeFile(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`);

const pending = queue.filter((pin) => pin.status === 'pending');
console.log(`${batch.length} пинов → ${CSV_PATH}; осталось в очереди: ${pending.length}${pending[0] ? `, следующая выгрузка после ${pending[0].scheduledFor.slice(0, 10)}` : ''}`);
