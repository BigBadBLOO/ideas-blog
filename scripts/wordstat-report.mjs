// Usage: node scripts/wordstat-report.mjs [topPhrasesPerSeed=15]
// Reads research/wordstat/{top,dynamics}/*.json → research/wordstat/REPORT.md

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'research/wordstat';
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const topPerSeed = Number(process.argv[2] ?? 15);

const readJsonDir = async (dir) => {
    const files = await readdir(dir);
    const entries = await Promise.all(
        files.filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))),
    );

    return new Map(entries.map((entry) => [entry.phrase, entry]));
};

const tops = await readJsonDir(join(DIR, 'top'));
const dynamics = await readJsonDir(join(DIR, 'dynamics'));

const format = (n) => n.toLocaleString('ru-RU');

function getSeasonality(months) {
    const lastYear = months.slice(-12);
    const yearTotal = lastYear.reduce((sum, m) => sum + m.count, 0);
    const avg = yearTotal / lastYear.length;
    const peak = lastYear.reduce((max, m) => (m.count > max.count ? m : max), lastYear[0]);
    const prevYear = months.slice(-24, -12).reduce((sum, m) => sum + m.count, 0);
    const peakMonths = lastYear
        .filter((m) => m.count >= avg * 1.3)
        .map((m) => MONTHS_RU[Number(m.month.slice(5, 7)) - 1]);

    return {
        yearTotal,
        peakRatio: avg ? peak.count / avg : 0,
        peakMonths,
        yoy: prevYear ? yearTotal / prevYear - 1 : 0,
        curve: lastYear.map((m) => `${MONTHS_RU[Number(m.month.slice(5, 7)) - 1]} ${format(m.count)}`).join(' · '),
    };
}

const rows = [...tops.values()]
    .map((top) => ({ top, season: dynamics.has(top.phrase) ? getSeasonality(dynamics.get(top.phrase).months) : null }))
    .sort((a, b) => b.top.totalCount - a.top.totalCount);

const lines = [
    `# Wordstat — отчёт (${new Date().toISOString().slice(0, 10)})`,
    '',
    'Частотность — показы за последние 30 дней (все устройства, вся Россия). Год — сумма за 12 последних полных месяцев.',
    'Пик ×N — во сколько раз самый сильный месяц выше среднего. YoY — изменение к предыдущим 12 месяцам.',
    '',
    '| Сид | 30 дней | Год | Пик ×N | Месяцы пика | YoY |',
    '|---|---|---|---|---|---|',
    ...rows.map(({ top, season }) =>
        [
            '',
            top.phrase,
            format(top.totalCount),
            season ? format(season.yearTotal) : '—',
            season ? season.peakRatio.toFixed(1) : '—',
            season ? season.peakMonths.join(', ') || 'ровно' : '—',
            season ? `${season.yoy >= 0 ? '+' : ''}${Math.round(season.yoy * 100)}%` : '—',
            '',
        ].join(' | ').trim(),
    ),
    '',
];

for (const { top, season } of rows) {
    lines.push(`## ${top.phrase} — ${format(top.totalCount)}`, '');

    if (season) {
        lines.push(`Динамика: ${season.curve}`, '');
    }

    lines.push(...top.results.slice(0, topPerSeed).map((r) => `- ${r.phrase} — ${format(r.count)}`), '');

    if (top.associations.length) {
        lines.push(
            `Похожие: ${top.associations
                .slice(0, 8)
                .map((a) => `${a.phrase} (${format(a.count)})`)
                .join('; ')}`,
            '',
        );
    }
}

await writeFile(join(DIR, 'REPORT.md'), lines.join('\n'));
console.log(lines.slice(0, rows.length + 8).join('\n'));
