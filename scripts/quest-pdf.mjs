// Usage: node scripts/quest-pdf.mjs [slug ...]
// content-src/quests/<slug>.json → products-pdf/<slug>.pdf, превью в public/products/<slug>/,
// карточка товара src/content/products/<slug>.md

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { printToPdf, screenshot } from './lib/chrome.mjs';
import { getPlaceIcon } from './lib/icons.mjs';
import { escapeHtml, markdownToHtml } from './lib/markdown.mjs';

// Бесплатные квесты — в публичном репо, платные — в private/quests (отдельный приватный репозиторий).
const QUESTS_DIRS = ['content-src/quests', 'private/quests'];
const PDF_DIR = 'products-pdf';
const PREVIEW_DIR = 'public/products';
const PRODUCTS_DIR = 'src/content/products';
const BRAND = 'Квестовичок';
const ALPHABET = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
const A4_PX = { width: 794, height: 1123 };

const paragraphs = (text = '') =>
    String(text)
        .split(/\n{2,}/)
        .map((part) => `<p>${escapeHtml(part.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('');

function formatAges(ages = []) {
    const numbers = ages.flatMap((age) => age.split('-').map(Number)).filter((n) => !Number.isNaN(n));

    return numbers.length ? `${Math.min(...numbers)}–${Math.max(...numbers)} лет` : '';
}

const letters = (text) => [...String(text).toUpperCase()];

function encodeNumbers(secret) {
    return String(secret)
        .toUpperCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) =>
            letters(word)
                .filter((char) => ALPHABET.includes(char))
                .map((char) => ALPHABET.indexOf(char) + 1),
        );
}

const encodeCaesar = (secret, shift) =>
    letters(secret)
        .map((char) => {
            const index = ALPHABET.indexOf(char);

            return index === -1 ? char : ALPHABET[(index + shift) % ALPHABET.length];
        })
        .join('');

const alphabetKey = () =>
    `<div class="key">${[...ALPHABET].map((char, i) => `<span><b>${char}</b>${i + 1}</span>`).join('')}</div>`;

function renderStageBody(stage) {
    const text = `<div class="card__text">${paragraphs(stage.text)}</div>`;

    switch (stage.type) {
        case 'riddle':
            return `<div class="card__riddle">${paragraphs(stage.text)}</div>`;
        case 'cipher-numbers': {
            const words = encodeNumbers(stage.secret)
                .map(
                    (word) =>
                        `<div class="cipher-word">${word.map((n) => `<span class="cell"><i>${n}</i><em></em></span>`).join('')}</div>`,
                )
                .join('');

            return `${text}<div class="cipher">${words}</div>${alphabetKey()}`;
        }
        case 'cipher-caesar': {
            const shift = stage.caesarShift ?? 1;

            return `${text}<div class="caesar">${escapeHtml(encodeCaesar(stage.secret, shift))}</div>
                <p class="card__note">Каждая буква сдвинута на ${shift} вперёд по алфавиту. Замените её на букву, которая стоит на ${shift} раньше.</p>
                <div class="strip">${[...ALPHABET].map((char) => `<span>${char}</span>`).join('')}</div>`;
        }
        case 'cipher-mirror':
            return `${text}<div class="mirror">${escapeHtml(String(stage.secret).toUpperCase())}</div>
                <p class="card__note">Подсказка: прочитайте с помощью зеркала.</p>`;
        case 'acrostic': {
            const rows = (stage.acrostic ?? [])
                .map(
                    ({ clue, answer }, i) => `<li><span class="acrostic__clue">${i + 1}. ${escapeHtml(clue)}</span>
                        <span class="acrostic__boxes">${letters(answer)
                            .map((_, j) => `<em class="${j === 0 ? 'first' : ''}"></em>`)
                            .join('')}</span></li>`,
                )
                .join('');

            return `${text}<ol class="acrostic">${rows}</ol><p class="card__note">Первые буквы ответов подскажут, где искать дальше.</p>`;
        }
        case 'challenge':
            return `${text}<div class="badge">Выполнили задание? Следующую карточку выдаст взрослый.</div>`;
        case 'puzzle':
            return `<div class="puzzle">${text}</div><div class="puzzle__grid">${'<i></i>'.repeat(6)}</div>`;
        case 'picture': {
            const icon = getPlaceIcon(stage.picture, stage.answer);

            return icon
                ? `${text}<div class="picture picture--icon">${icon}</div>`
                : `${text}<div class="picture"><span>${escapeHtml(stage.picture ?? stage.answerPlace)}</span><small>Место для картинки: нарисуйте или наклейте</small></div>`;
        }
        default:
            return text;
    }
}

function renderCard(quest, stage, index) {
    return `<section class="card">
        <header class="card__header"><span>Этап ${index + 1}</span><span>${escapeHtml(quest.title)}</span></header>
        <h2 class="card__title">${escapeHtml(stage.title)}</h2>
        ${renderStageBody(stage)}
    </section>`;
}

const halfPages = (cards) => {
    const pages = [];

    for (let i = 0; i < cards.length; i += 2) {
        pages.push(`<div class="page page--cards">${cards[i]}${cards[i + 1] ? `<div class="cut">✂</div>${cards[i + 1]}` : ''}</div>`);
    }

    return pages;
};

function renderCover(quest) {
    const facts = [
        formatAges(quest.ages),
        quest.players,
        quest.duration,
        quest.kind === 'advent' ? '31 карточка' : `${quest.stages?.length ?? 0} этапов`,
    ].filter(Boolean);

    return `<div class="page cover">
        <div class="cover__blob cover__blob--1"></div><div class="cover__blob cover__blob--2"></div>
        <span class="cover__theme">${escapeHtml(quest.theme)}</span>
        <h1 class="cover__title">${escapeHtml(quest.title)}</h1>
        <p class="cover__subtitle">${escapeHtml(quest.subtitle ?? '')}</p>
        <ul class="cover__facts">${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join('')}</ul>
        <footer class="cover__brand">${BRAND}</footer>
    </div>`;
}

function renderAdult(quest) {
    const props = (quest.props ?? []).map((item) => `<li class="check"><span class="box"></span>${escapeHtml(item)}</li>`).join('');
    let cheat = '';

    if (quest.stages?.length) {
        const rows = quest.stages
            .map((stage, i) => {
                const place = i === 0 ? 'Вручите сами (или вложите в письмо)' : quest.stages[i - 1].answerPlace;

                return `<tr><td>${i + 1}. ${escapeHtml(stage.title)}</td><td>${escapeHtml(place)}</td><td>${escapeHtml(stage.answer)}</td><td>${escapeHtml(stage.adultHint ?? '')}</td></tr>`;
            })
            .join('');
        const last = quest.stages.at(-1);
        cheat = `<h2>Шпаргалка раскладки</h2>
            <p>Раскладывайте с конца: сначала спрячьте приз с финальной карточкой, потом карточки по убыванию номеров.</p>
            <table class="cheat"><thead><tr><th>Карточка</th><th>Где лежит</th><th>Ответ</th><th>Если застряли</th></tr></thead>
            <tbody>${rows}<tr><td>Финал: ${escapeHtml(quest.finale?.title ?? 'приз')}</td><td>${escapeHtml(last.answerPlace)}</td><td>—</td><td></td></tr></tbody></table>`;
    }

    return `<div class="flow">
        <h1>Для взрослого</h1>
        <div class="md">${markdownToHtml(quest.adultIntro)}</div>
        ${props ? `<h2>Что подготовить</h2><ul class="props">${props}</ul>` : ''}
        ${cheat}
    </div>`;
}

const renderStory = (quest) =>
    quest.story
        ? `<div class="page letter"><div class="letter__inner"><h1>${escapeHtml(quest.story.title)}</h1>${paragraphs(quest.story.text)}</div></div>`
        : '';

const renderFinale = (quest) =>
    quest.finale
        ? `<section class="card card--finale"><header class="card__header"><span>Финал</span><span>${escapeHtml(quest.title)}</span></header>
            <h2 class="card__title">${escapeHtml(quest.finale.title)}</h2><div class="card__text">${paragraphs(quest.finale.text)}</div></section>`
        : '';

const renderDiploma = (quest) =>
    quest.diploma
        ? `<div class="page diploma"><div class="diploma__frame">
            <span class="diploma__brand">${BRAND}</span>
            <h1>${escapeHtml(quest.diploma.title)}</h1>
            <p class="diploma__label">вручается</p>
            <div class="diploma__line"></div>
            <p class="diploma__text">${escapeHtml(quest.diploma.text)}</p>
            <div class="diploma__footer"><span>Дата ____________</span><span>Подпись ____________</span></div>
        </div></div>`
        : '';

const renderExtras = (quest) =>
    (quest.extraSheets ?? []).map((sheet) => `<div class="flow"><h1>${escapeHtml(sheet.title)}</h1><div class="md">${markdownToHtml(sheet.text)}</div></div>`);

function renderAdventDay(day) {
    return `<section class="day">
        <span class="day__number">${day.day}</span>
        <span class="day__category">${escapeHtml(day.category ?? '')}</span>
        <h3>${escapeHtml(day.title)}</h3>
        <p>${escapeHtml(day.text)}</p>
        ${day.easier ? `<p class="day__variant"><b>3–4 года:</b> ${escapeHtml(day.easier)}</p>` : ''}
        ${day.harder ? `<p class="day__variant"><b>8–10 лет:</b> ${escapeHtml(day.harder)}</p>` : ''}
    </section>`;
}

function buildPages(quest) {
    const pages = [renderCover(quest), renderAdult(quest)];

    if (quest.kind === 'advent') {
        for (let i = 0; i < quest.days.length; i += 4) {
            pages.push(`<div class="page page--days">${quest.days.slice(i, i + 4).map(renderAdventDay).join('')}</div>`);
        }
    } else {
        pages.push(renderStory(quest));
        const cards = quest.stages.map((stage, i) => renderCard(quest, stage, i));
        const finale = renderFinale(quest);
        pages.push(...halfPages(finale ? [...cards, finale] : cards));
    }

    pages.push(renderDiploma(quest), ...renderExtras(quest));

    return pages.filter(Boolean);
}

const styles = (accent) => `
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
:root { --accent: ${accent}; --tint: color-mix(in srgb, var(--accent) 10%, white); --ink: #2b2118; }
html { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: var(--ink); font-size: 12pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; }
h1, h2, h3 { font-family: Georgia, 'Times New Roman', serif; line-height: 1.15; margin: 0 0 4mm; }
h1 { font-size: 24pt; color: var(--accent); }
h2 { font-size: 16pt; margin-top: 6mm; }
p { margin: 0 0 3mm; }
.page { height: 273mm; overflow: hidden; position: relative; break-after: page; }
.flow { break-after: page; }
.cover { display: flex; flex-direction: column; justify-content: center; gap: 6mm; padding: 20mm; background: var(--tint); border-radius: 8mm; }
.cover__blob { position: absolute; border-radius: 50%; background: var(--accent); opacity: .15; }
.cover__blob--1 { width: 120mm; height: 120mm; top: -40mm; right: -40mm; }
.cover__blob--2 { width: 80mm; height: 80mm; bottom: -25mm; left: -25mm; }
.cover__theme { font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); }
.cover__title { font-size: 40pt; color: var(--ink); }
.cover__subtitle { font-size: 16pt; }
.cover__facts { display: flex; flex-wrap: wrap; gap: 3mm; list-style: none; padding: 0; margin: 0; }
.cover__facts li { padding: 2mm 5mm; border-radius: 99px; background: white; border: 1.5px solid var(--accent); font-weight: 600; }
.cover__brand { position: absolute; bottom: 14mm; left: 20mm; font-family: Georgia, serif; font-weight: 700; font-size: 16pt; color: var(--accent); }
table { width: 100%; border-collapse: collapse; margin: 3mm 0; font-size: 10pt; }
th, td { border: 1px solid #d8ccbd; padding: 2mm 3mm; text-align: left; vertical-align: top; }
th { background: var(--tint); }
.props, .md ul { padding-left: 0; list-style: none; }
.md ol { padding-left: 6mm; }
li.check { display: flex; gap: 3mm; align-items: flex-start; margin-bottom: 2mm; }
.box { flex: none; width: 4.5mm; height: 4.5mm; border: 1.5px solid var(--accent); border-radius: 1mm; margin-top: .8mm; }
.letter { display: flex; align-items: center; }
.letter__inner { width: 100%; padding: 16mm; border: 2px solid var(--accent); border-radius: 6mm; background: var(--tint); font-size: 14pt; line-height: 1.6; }
.page--cards { display: flex; flex-direction: column; }
.card { position: relative; flex: 1; display: flex; flex-direction: column; padding: 7mm 8mm; border: 2px solid var(--accent); border-radius: 6mm; overflow: hidden; }
.cut { height: 8mm; display: flex; align-items: center; color: #999; font-size: 10pt; border-top: 1px dashed #aaa; margin-top: 4mm; }
.card__header { display: flex; justify-content: space-between; font-size: 9pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin-bottom: 3mm; }
.card__title { font-size: 18pt; margin: 0 0 3mm; }
.card__text { font-size: 13pt; }
.card__riddle { font-family: Georgia, serif; font-size: 17pt; line-height: 1.5; font-style: italic; padding: 4mm 6mm; border-left: 4px solid var(--accent); background: var(--tint); border-radius: 0 3mm 3mm 0; }
.card__note { font-size: 10pt; color: #6b5d50; }
.card--finale { background: var(--tint); }
.cipher { display: flex; flex-wrap: wrap; gap: 5mm; margin: 3mm 0; }
.cipher-word { display: flex; gap: 1.5mm; }
.cell { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
.cell i { font-style: normal; font-weight: 700; font-size: 13pt; }
.cell em { width: 9mm; height: 10mm; border: 1.5px solid var(--accent); border-radius: 1.5mm; background: white; }
.key { display: grid; grid-template-columns: repeat(11, 1fr); gap: 1mm; margin-top: auto; font-size: 8.5pt; }
.key span { display: flex; justify-content: space-between; padding: .6mm 1.5mm; border: 1px solid #e3d6c6; border-radius: 1mm; }
.caesar, .mirror { font-size: 24pt; font-weight: 700; letter-spacing: .15em; text-align: center; padding: 5mm; margin: 3mm 0; background: var(--tint); border-radius: 3mm; }
.mirror { transform: scaleX(-1); }
.strip { display: grid; grid-template-columns: repeat(33, 1fr); font-size: 9pt; text-align: center; margin-top: auto; }
.strip span { border: 1px solid #e3d6c6; padding: .8mm 0; }
.acrostic { padding: 0; list-style: none; margin: 1mm 0; font-size: 10.5pt; }
.acrostic li { display: flex; flex-direction: column; gap: .8mm; margin-bottom: 1.6mm; }
.acrostic__boxes { display: flex; gap: 1mm; }
.acrostic__boxes em { width: 6mm; height: 6mm; border: 1.2px solid #bbb; border-radius: 1mm; }
.acrostic__boxes em.first { border: 2px solid var(--accent); background: var(--tint); }
.badge { margin-top: auto; padding: 3mm 5mm; border-radius: 99px; background: var(--tint); border: 1.5px dashed var(--accent); font-weight: 600; font-size: 11pt; text-align: center; }
.puzzle { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.puzzle .card__text { font-size: 18pt; font-weight: 700; text-align: center; padding: 8mm; }
.puzzle__grid { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr); pointer-events: none; }
.puzzle__grid i { border-right: 1px dashed #d4d4d4; border-bottom: 1px dashed #d4d4d4; }
.puzzle__grid i:nth-child(3n) { border-right: 0; }
.puzzle__grid i:nth-child(n+4) { border-bottom: 0; }
.picture { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; margin-top: 3mm; border: 2px dashed var(--accent); border-radius: 4mm; }
.picture span { font-family: Georgia, serif; font-size: 26pt; font-weight: 700; text-transform: uppercase; color: var(--accent); }
.picture small { font-size: 9pt; color: #8a7b6d; }
.picture--icon { border-style: solid; color: var(--accent); }
.picture--icon svg { width: 70%; height: 80%; }
.diploma { display: flex; }
.diploma__frame { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6mm; padding: 16mm; border: 3mm double var(--accent); border-radius: 6mm; text-align: center; }
.diploma h1 { font-size: 40pt; }
.diploma__brand { font-family: Georgia, serif; font-weight: 700; color: var(--accent); letter-spacing: .1em; text-transform: uppercase; }
.diploma__label { font-size: 14pt; color: #6b5d50; }
.diploma__line { width: 70%; border-bottom: 1.5px solid var(--ink); height: 14mm; }
.diploma__text { font-size: 16pt; max-width: 80%; }
.diploma__footer { display: flex; justify-content: space-between; width: 80%; margin-top: 14mm; font-size: 12pt; }
.page--days { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 6mm; }
.day { position: relative; padding: 8mm 7mm 6mm; border: 2px dashed var(--accent); border-radius: 5mm; overflow: hidden; }
.day__number { position: absolute; top: 3mm; right: 5mm; font-family: Georgia, serif; font-size: 34pt; font-weight: 700; color: var(--accent); opacity: .85; }
.day__category { font-size: 8.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
.day h3 { font-size: 15pt; margin: 2mm 18mm 3mm 0; }
.day p { font-size: 11pt; }
.day__variant { font-size: 9.5pt !important; color: #6b5d50; margin-bottom: 1.5mm; }
.preview-mode .page, .preview-mode .flow { width: 186mm; margin: 12mm; }
`;

const htmlDocument = (quest, pages, isPreview = false) => `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${escapeHtml(quest.title)}</title><style>${styles(quest.coverColor ?? '#ff6b2c')}</style></head>
<body class="${isPreview ? 'preview-mode' : ''}">${pages.join('\n')}</body></html>`;

async function countPdfPages(pdfPath) {
    const content = await readFile(pdfPath, 'latin1');

    return (content.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

function productMarkdown(quest, pageCount, previews) {
    const isFree = !quest.price;
    const inside =
        quest.kind === 'advent'
            ? ['31 карточка-задание на каждый день декабря', 'варианты для малышей и школьников', 'памятка для взрослого', 'трекер и диплом']
            : [
                  'письмо-завязка, которое читают детям',
                  `${quest.stages.length} карточек этапов с заданиями`,
                  'шпаргалка для взрослого: где что прятать и ответы',
                  'финальная карточка и диплом',
                  ...(quest.extraSheets ?? []).map((sheet) => sheet.title.toLowerCase()),
              ];
    const frontmatter = [
        '---',
        `title: ${JSON.stringify(quest.title)}`,
        `description: ${JSON.stringify(quest.shortDescription)}`,
        `theme: ${JSON.stringify(quest.theme)}`,
        `ages: ${JSON.stringify(quest.ages)}`,
        `isFree: ${isFree}`,
        ...(isFree ? [] : [`price: ${quest.price}`]),
        `pages: ${pageCount}`,
        `coverColor: ${JSON.stringify(quest.coverColor)}`,
        `previews: ${JSON.stringify(previews)}`,
        'isDraft: false',
        '---',
    ];

    return `${frontmatter.join('\n')}\n\n${quest.productDescription.trim()}\n\n## Что внутри\n\n${inside.map((item) => `- ${item}`).join('\n')}\n`;
}

async function listQuestFiles() {
    const files = [];

    for (const dir of QUESTS_DIRS) {
        try {
            files.push(...(await readdir(dir)).filter((file) => file.endsWith('.json')).map((file) => join(dir, file)));
        } catch {}
    }

    return files;
}

async function findQuestFile(slug) {
    const file = (await listQuestFiles()).find((path) => path.endsWith(`/${slug}.json`));

    if (!file) {
        throw new Error(`нет ${slug}.json в ${QUESTS_DIRS.join(' или ')}`);
    }

    return file;
}

async function buildQuest(slug) {
    const quest = JSON.parse(await readFile(await findQuestFile(slug), 'utf8'));
    const pages = buildPages(quest);
    const workDir = join(tmpdir(), `quest-${slug}`);
    await mkdir(workDir, { recursive: true });

    const htmlPath = join(workDir, 'quest.html');
    const pdfPath = resolve(PDF_DIR, `${slug}.pdf`);
    await writeFile(htmlPath, htmlDocument(quest, pages));
    await printToPdf(htmlPath, pdfPath);

    const previewDir = join(PREVIEW_DIR, slug);
    await rm(previewDir, { recursive: true, force: true });
    await mkdir(previewDir, { recursive: true });
    const previewSources = [0, pages.findIndex((page) => page.includes('page--cards') || page.includes('page--days'))].filter(
        (index, i, all) => index >= 0 && all.indexOf(index) === i,
    );
    const previews = [];

    for (const [i, pageIndex] of previewSources.entries()) {
        const previewHtml = join(workDir, `preview-${i}.html`);
        const pngPath = resolve(previewDir, `page-${i + 1}.png`);
        await writeFile(previewHtml, htmlDocument(quest, [pages[pageIndex]], true));
        await screenshot(previewHtml, pngPath, A4_PX.width, A4_PX.height);
        previews.push(`/products/${slug}/page-${i + 1}.png`);
    }

    if (process.env.QUEST_DEBUG_DIR) {
        const debugDir = resolve(process.env.QUEST_DEBUG_DIR, slug);
        await mkdir(debugDir, { recursive: true });

        for (const [i, page] of pages.entries()) {
            const debugHtml = join(workDir, `debug-${i}.html`);
            await writeFile(debugHtml, htmlDocument(quest, [page], true));
            await screenshot(debugHtml, join(debugDir, `${String(i + 1).padStart(2, '0')}.png`), A4_PX.width, A4_PX.height);
        }
    }

    const pageCount = await countPdfPages(pdfPath);
    await writeFile(join(PRODUCTS_DIR, `${slug}.md`), productMarkdown(quest, pageCount, previews));
    await rm(workDir, { recursive: true, force: true });
    console.log(`✓ ${slug}: ${pageCount} стр. → ${PDF_DIR}/${slug}.pdf`);
}

await mkdir(PDF_DIR, { recursive: true });
const requested = process.argv.slice(2);
const slugs = requested.length
    ? requested
    : (await listQuestFiles()).map((path) => path.split('/').pop().replace(/\.json$/, ''));

for (const slug of slugs) {
    try {
        await buildQuest(slug);
    } catch (error) {
        console.error(`✗ ${slug}: ${error.message}`);
    }
}
