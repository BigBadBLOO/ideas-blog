// Usage: node scripts/pins.mjs [--no-images]
// Для статей со статусом published/evergreen и pinTitles:
//  - рендерит пины 1000×1500 в public/pins/<slug>/<n>.png (три чередующихся шаблона);
//  - дополняет очередь публикации pins/queue.json с расписанием (опубликованные записи не трогает).

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { screenshot } from './lib/chrome.mjs';
import { parseArticle } from './lib/frontmatter.mjs';
import { escapeHtml } from './lib/markdown.mjs';

const ARTICLES_DIR = 'src/content/articles';
const PRODUCTS_PREVIEW_DIR = 'public/products';
const PINS_DIR = 'public/pins';
const QUEUE_PATH = 'pins/queue.json';
const PIN = { width: 1000, height: 1500 };
const SLOTS_MSK = ['09:00', '14:00', '20:00'];
const SAME_ARTICLE_GAP_DAYS = 2;
const LISTED_STATUSES = new Set(['published', 'evergreen']);

const CATEGORY_COLORS = { kvesty: '#ff6b2c', 'konkursy-i-igry': '#3d7bff', prazdniki: '#2e7d32' };
const SEASON_COLOR = '#c0392b';
const BOARDS = {
    season: 'Новый год с детьми: игры и идеи',
    kvesty: 'Квесты для детей дома',
    'konkursy-i-igry': 'Конкурсы и игры на день рождения',
    prazdniki: 'Детский праздник дома: сценарии',
};

const siteConfig = await readFile('src/site.config.ts', 'utf8');
const SITE_URL = siteConfig.match(/url:\s*'([^']+)'/)[1].replace(/\/$/, '');
const SITE_NAME = siteConfig.match(/name:\s*'([^']+)'/)[1];
const DOMAIN = new URL(SITE_URL).host;

const baseStyles = (color) => `
* { box-sizing: border-box; margin: 0; }
html, body { width: ${PIN.width}px; height: ${PIN.height}px; overflow: hidden; }
body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #2b2118; --accent: ${color}; --tint: color-mix(in srgb, ${color} 12%, #fffaf3); }
.title { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; line-height: 1.08; }
.brand { font-family: Georgia, serif; font-weight: 700; font-size: 34px; }
.domain { font-size: 30px; font-weight: 600; letter-spacing: .02em; }
.badge { display: inline-block; padding: 14px 30px; border-radius: 999px; font-size: 30px; font-weight: 700; }
`;

function splitNumber(title) {
    const match = title.match(/^(.*?)(\d+(?:[–-]\d+)?)(.*)$/);

    if (!match) {
        return { number: '', rest: title };
    }

    const [, before, number, after] = match;

    return { number, rest: `${before}${after}`.replace(/^[\s:,—-]+|[\s:,—-]+$/g, '').replace(/\s{2,}/g, ' ') };
}

function templateNumber({ title, color }) {
    const { number, rest } = splitNumber(title);

    return `<style>${baseStyles(color)}
        body { background: linear-gradient(165deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #000)); color: #fff; padding: 90px 80px; display: flex; flex-direction: column; }
        .circle { position: absolute; border-radius: 50%; background: #fff; opacity: .1; }
        .number { font-family: Georgia, serif; font-weight: 700; font-size: ${number.length > 3 ? 260 : 380}px; line-height: .9; margin-top: 120px; }
        .title { font-size: 88px; margin-top: 30px; }
        .badge { background: #fff; color: var(--accent); margin-top: 60px; align-self: flex-start; }
        footer { margin-top: auto; display: flex; justify-content: space-between; align-items: center; }
    </style>
    <div class="circle" style="width:700px;height:700px;top:-250px;right:-250px"></div>
    <div class="circle" style="width:400px;height:400px;bottom:-150px;left:-120px"></div>
    <span class="brand">${escapeHtml(SITE_NAME)}</span>
    ${number ? `<span class="number">${escapeHtml(number)}</span>` : ''}
    <h1 class="title">${escapeHtml(rest)}</h1>
    <span class="badge">Готово к печати</span>
    <footer><span class="domain">${escapeHtml(DOMAIN)}</span></footer>`;
}

function templateCollage({ title, color, previews }) {
    const [first, second] = previews;

    return `<style>${baseStyles(color)}
        body { background: var(--tint); display: flex; flex-direction: column; }
        .stage { position: relative; height: 900px; }
        .sheet { position: absolute; width: 470px; border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,.18); background: #fff; }
        .sheet--1 { left: 90px; top: 110px; transform: rotate(-6deg); }
        .sheet--2 { right: 90px; top: 150px; transform: rotate(5deg); }
        .band { flex: 1; background: var(--accent); color: #fff; padding: 60px 80px; display: flex; flex-direction: column; gap: 24px; }
        .title { font-size: 76px; }
        footer { margin-top: auto; display: flex; justify-content: space-between; align-items: center; }
        .brand { position: absolute; top: 40px; left: 80px; color: var(--accent); }
    </style>
    <div class="stage">
        <span class="brand">${escapeHtml(SITE_NAME)}</span>
        ${first ? `<img class="sheet sheet--1" src="file://${first}">` : ''}
        ${second ? `<img class="sheet sheet--2" src="file://${second}">` : ''}
    </div>
    <div class="band">
        <h1 class="title">${escapeHtml(title)}</h1>
        <footer><span class="domain">${escapeHtml(DOMAIN)}</span><span class="domain">PDF для печати</span></footer>
    </div>`;
}

function templateList({ title, color, items }) {
    const shown = items.slice(0, 5);
    const more = items.length - shown.length;

    return `<style>${baseStyles(color)}
        body { background: var(--tint); padding: 80px; display: flex; flex-direction: column; gap: 40px; }
        .brand { color: var(--accent); }
        .title { font-size: 84px; }
        ol { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 22px; }
        li { display: flex; align-items: center; gap: 28px; font-size: 40px; font-weight: 600; background: #fff; padding: 22px 30px; border-radius: 22px; }
        li b { flex: none; width: 64px; height: 64px; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32px; }
        .more { font-size: 36px; font-weight: 700; color: var(--accent); }
        footer { margin-top: auto; display: flex; justify-content: space-between; align-items: center; }
        .badge { background: var(--accent); color: #fff; }
    </style>
    <span class="brand">${escapeHtml(SITE_NAME)}</span>
    <h1 class="title">${escapeHtml(title)}</h1>
    <ol>${shown.map((item, i) => `<li><b>${i + 1}</b>${escapeHtml(item)}</li>`).join('')}</ol>
    ${more > 0 ? `<span class="more">+ ещё ${more} на сайте</span>` : ''}
    <footer><span class="domain">${escapeHtml(DOMAIN)}</span><span class="badge">Сохранить идею</span></footer>`;
}

function getItems(body) {
    return [...body.matchAll(/^###\s+\d+\.\s+(.+)$/gm)].map(([, name]) => name.replace(/[*_`]/g, '').trim()).filter((name) => name.length <= 34);
}

async function getPreviews(products) {
    for (const product of products) {
        const dir = resolve(PRODUCTS_PREVIEW_DIR, product);

        try {
            const files = (await readdir(dir)).filter((file) => file.endsWith('.png')).sort();

            if (files.length) {
                return files.map((file) => join(dir, file));
            }
        } catch {}
    }

    return [];
}

function pickTemplate(index, context) {
    const order = [templateNumber, context.previews.length ? templateCollage : templateList, templateList];
    const template = order[index % order.length];

    return template === templateList && context.items.length < 3 ? templateNumber : template;
}

const toMonthDay = (date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function getEarliestDate(season, today) {
    if (!season?.promoteFrom || !season?.peak) {
        return today;
    }

    const md = toMonthDay(today);
    const { promoteFrom, peak } = season;
    const isWrapping = promoteFrom > peak;
    const isInWindow = isWrapping ? md >= promoteFrom || md <= peak : md >= promoteFrom && md <= peak;

    if (isInWindow) {
        return today;
    }

    const [month, day] = promoteFrom.split('-').map(Number);
    const candidate = new Date(today.getFullYear(), month - 1, day);

    if (candidate < today) {
        candidate.setFullYear(candidate.getFullYear() + 1);
    }

    return candidate;
}

const localDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const slotIso = (date, time) => `${localDate(date)}T${time}:00+03:00`;

function schedule(pins, startDate) {
    const waiting = [...pins];
    const lastByArticle = new Map();
    const day = new Date(startDate);

    for (let guard = 0; waiting.length && guard < 3650; guard += 1) {
        for (const time of SLOTS_MSK) {
            const index = waiting.findIndex((pin) => {
                const last = lastByArticle.get(pin.article);
                const isGapOk = !last || (day - last) / 86_400_000 >= SAME_ARTICLE_GAP_DAYS;

                return pin.earliest <= day && isGapOk;
            });

            if (index === -1) {
                continue;
            }

            const [pin] = waiting.splice(index, 1);
            pin.scheduledFor = slotIso(day, time);
            lastByArticle.set(pin.article, new Date(day));
        }

        day.setDate(day.getDate() + 1);
    }
}

const isRenderingImages = !process.argv.includes('--no-images');
const workDir = join(tmpdir(), 'pins-render');
await mkdir(workDir, { recursive: true });

let queue = [];

try {
    queue = JSON.parse(await readFile(QUEUE_PATH, 'utf8'));
} catch {}

const existing = new Map(queue.map((pin) => [pin.id, pin]));
const today = new Date();
today.setHours(0, 0, 0, 0);
const newPins = [];

for (const file of (await readdir(ARTICLES_DIR)).filter((name) => name.endsWith('.md')).sort()) {
    const slug = file.replace(/\.md$/, '');
    const { data, body } = parseArticle(await readFile(join(ARTICLES_DIR, file), 'utf8'));

    if (!LISTED_STATUSES.has(data.status) || !data.pinTitles?.length) {
        continue;
    }

    const color = data.season ? SEASON_COLOR : (CATEGORY_COLORS[data.category] ?? '#ff6b2c');
    const context = { color, items: getItems(body), previews: await getPreviews(data.products ?? []) };
    const pinDir = join(PINS_DIR, slug);

    if (isRenderingImages) {
        await rm(pinDir, { recursive: true, force: true });
        await mkdir(pinDir, { recursive: true });
    }

    for (const [i, pinTitle] of data.pinTitles.entries()) {
        const id = `${slug}-${i + 1}`;
        const imagePath = `/pins/${slug}/${i + 1}.png`;

        if (isRenderingImages) {
            const htmlPath = join(workDir, `${id}.html`);
            const template = pickTemplate(i, context);
            await writeFile(htmlPath, `<!doctype html><html lang="ru"><head><meta charset="utf-8"></head><body>${template({ ...context, title: pinTitle })}</body></html>`);
            await screenshot(htmlPath, resolve(`public${imagePath}`), PIN.width, PIN.height);
        }

        if (existing.has(id) && existing.get(id).status !== 'pending') {
            continue;
        }

        const description = `${data.description} Готовые квесты и задания для печати — на ${DOMAIN}.`.slice(0, 500);
        newPins.push({
            id,
            article: slug,
            round: i,
            earliest: getEarliestDate(data.season, today),
            title: pinTitle.slice(0, 100),
            description,
            altText: pinTitle,
            board: data.season ? BOARDS.season : (BOARDS[data.category] ?? BOARDS.kvesty),
            link: `${SITE_URL}/${data.category}/${slug}/?utm_source=pinterest&utm_medium=pin&utm_content=${id}`,
            imageUrl: `${SITE_URL}${imagePath}`,
            imagePath: `public${imagePath}`,
            status: 'pending',
        });
    }

    console.log(`✓ ${slug}: ${data.pinTitles.length} пинов`);
}

newPins.sort((a, b) => a.round - b.round || a.article.localeCompare(b.article));
const start = new Date(today);
start.setDate(start.getDate() + 1);
schedule(newPins, start);

const kept = queue.filter((pin) => pin.status !== 'pending');
const next = [...kept, ...newPins.map(({ round, earliest, ...pin }) => pin)].sort((a, b) =>
    String(a.scheduledFor ?? '').localeCompare(String(b.scheduledFor ?? '')),
);

await mkdir('pins', { recursive: true });
await writeFile(QUEUE_PATH, `${JSON.stringify(next, null, 2)}\n`);
await rm(workDir, { recursive: true, force: true });
console.log(`Очередь: ${next.filter((pin) => pin.status === 'pending').length} в ожидании → ${QUEUE_PATH}`);
