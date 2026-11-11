// Usage: node scripts/social-cover.mjs
// Обложка для групп ВК и Дзена 1920×768 → brand/cover.png: название, подпись и веер из обложек квестов.
// Важное держим в центральной зоне: мобильный ВК обрезает края обложки.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { screenshot } from './lib/chrome.mjs';

const SIZE = { width: 1920, height: 768 };
const COVERS = [
    'kvest-sekretnye-agenty',
    'piratskij-kvest-sokrovishcha-kapitana',
    'advent-kalendar-31-zadanie',
    'mini-kvest-tajna-propavshego-podarka',
    'novogodnij-kvest-pismo-deda-moroza',
].map((slug) => `file://${resolve('public/products', slug, 'page-1.png')}`);

const ANGLES = [-16, -8, 0, 8, 16];

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
* { box-sizing: border-box; margin: 0; }
html, body { width: ${SIZE.width}px; height: ${SIZE.height}px; overflow: hidden; }
body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #fff;
    background: radial-gradient(circle at 20% 15%, #ff8a4c, #ff6b2c 45%, #d9531c);
    position: relative;
}
.circle { position: absolute; border-radius: 50%; background: rgba(255,255,255,.1); }
.text { position: absolute; left: 300px; top: 190px; width: 760px; }
.name { font-family: Georgia, serif; font-weight: 700; font-size: 92px; line-height: 1; }
.tagline { margin-top: 26px; font-size: 38px; line-height: 1.3; font-weight: 600; }
.badges { margin-top: 40px; display: flex; gap: 16px; }
.badge { white-space: nowrap; padding: 14px 28px; border-radius: 999px; background: #fff; color: #d9531c; font-size: 28px; font-weight: 700; }
.fan { position: absolute; left: 1090px; top: 120px; width: 560px; height: 560px; }
.fan img {
    position: absolute; left: 150px; top: 30px; width: 270px; border-radius: 14px;
    box-shadow: 0 18px 40px rgba(80,25,0,.35); transform-origin: 50% 160%; background: #fff;
}
</style></head><body>
<div class="circle" style="width:620px;height:620px;right:-180px;top:-260px"></div>
<div class="circle" style="width:420px;height:420px;left:-140px;bottom:-220px"></div>
<div class="text">
    <div class="name">Квестовичок</div>
    <div class="tagline">Готовые квесты, конкурсы и игры<br>для детского праздника дома</div>
    <div class="badges"><span class="badge">3–13 лет</span><span class="badge">PDF для печати</span><span class="badge">бесплатно</span></div>
</div>
<div class="fan">${COVERS.map((src, i) => `<img src="${src}" style="transform: rotate(${ANGLES[i]}deg)">`).join('')}</div>
</body></html>`;

const workDir = await mkdtemp(join(tmpdir(), 'cover-'));
const htmlPath = join(workDir, 'cover.html');
await writeFile(htmlPath, html);
await screenshot(htmlPath, resolve('brand/cover.png'), SIZE.width, SIZE.height);
await rm(workDir, { recursive: true, force: true });
console.log('✓ brand/cover.png');
