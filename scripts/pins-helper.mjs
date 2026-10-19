// Usage: node scripts/pins-helper.mjs
// Страница-помощник для ручной публикации пинов: pins/helper.html (открыть в браузере).

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { escapeHtml } from './lib/markdown.mjs';

const queue = JSON.parse(await readFile('pins/queue.json', 'utf8'));
const pins = queue.filter((pin) => pin.status === 'pending');

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
});

const field = (label, value) => `<div class="field"><span class="label">${label}</span>
    <div class="value">${escapeHtml(value)}</div><button data-copy="${escapeHtml(value)}">Копировать</button></div>`;

const cards = pins
    .map(
        (pin, i) => `<article class="pin" id="${pin.id}">
        <img src="file://${resolve(pin.imagePath)}" alt="" draggable="true">
        <div class="body">
            <div class="head"><b>${i + 1}. ${dateFormatter.format(new Date(pin.scheduledFor))}</b>
                <label><input type="checkbox" data-done="${pin.id}"> готово</label></div>
            ${field('Заголовок', pin.title)}
            ${field('Описание', pin.description)}
            ${field('Ссылка', pin.link)}
            ${field('Альт-текст', pin.altText)}
            <div class="field"><span class="label">Доска</span><div class="value">${escapeHtml(pin.board)}</div></div>
            <a class="file" href="file://${resolve(pin.imagePath)}" download>Открыть картинку</a>
        </div>
    </article>`,
    )
    .join('\n');

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Пины — Квестовичок</title><style>
body { font-family: -apple-system, Arial, sans-serif; background: #fffaf3; color: #2b2118; max-width: 1100px; margin: 0 auto; padding: 24px; }
h1 { font-family: Georgia, serif; }
.how { background: #fff; border: 1px solid #f0e3d3; border-radius: 12px; padding: 16px 24px; }
.pin { display: grid; grid-template-columns: 220px 1fr; gap: 24px; background: #fff; border: 1px solid #f0e3d3; border-radius: 12px; padding: 16px; margin: 16px 0; }
.pin.done { opacity: .35; }
.pin img { width: 220px; border-radius: 8px; cursor: grab; }
.head { display: flex; justify-content: space-between; margin-bottom: 8px; }
.field { display: grid; grid-template-columns: 100px 1fr auto; gap: 12px; align-items: start; padding: 6px 0; border-top: 1px solid #f6ede2; }
.label { color: #7a6a5c; font-size: 13px; }
.value { font-size: 14px; word-break: break-word; }
button { border: 0; background: #ff6b2c; color: #fff; border-radius: 99px; padding: 6px 14px; cursor: pointer; }
button.ok { background: #2e7d32; }
.file { display: inline-block; margin-top: 8px; font-size: 13px; }
</style></head><body>
<h1>Пины к публикации: ${pins.length}</h1>
<div class="how"><ol>
<li>Открой <b>pinterest.com/pin-builder</b> (вход под kvestovichok).</li>
<li>Перетащи картинку пина отсюда в поле загрузки (или «Открыть картинку» → сохранить → загрузить).</li>
<li>Скопируй заголовок, описание, ссылку и альт-текст кнопками, выбери доску.</li>
<li>«Опубликовать позже» → дата и время из карточки → «Опубликовать». Отметь «готово».</li>
</ol>Pinterest сам опубликует запланированные пины. Удобно планировать по неделе за раз.</div>
${cards}
<script>
document.addEventListener('click', async (event) => {
    const value = event.target.dataset.copy;
    if (value === undefined) return;
    await navigator.clipboard.writeText(value);
    event.target.textContent = 'Скопировано'; event.target.classList.add('ok');
    setTimeout(() => { event.target.textContent = 'Копировать'; event.target.classList.remove('ok'); }, 1500);
});
const done = JSON.parse(localStorage.getItem('pins-done') || '[]');
document.querySelectorAll('[data-done]').forEach((box) => {
    const card = document.getElementById(box.dataset.done);
    box.checked = done.includes(box.dataset.done);
    card.classList.toggle('done', box.checked);
    box.addEventListener('change', () => {
        const set = new Set(JSON.parse(localStorage.getItem('pins-done') || '[]'));
        box.checked ? set.add(box.dataset.done) : set.delete(box.dataset.done);
        localStorage.setItem('pins-done', JSON.stringify([...set]));
        card.classList.toggle('done', box.checked);
    });
});
</script></body></html>`;

await writeFile('pins/helper.html', html);
console.log(`${pins.length} пинов → pins/helper.html`);
