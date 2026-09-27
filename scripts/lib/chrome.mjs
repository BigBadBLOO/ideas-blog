import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

const CANDIDATES = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter(Boolean);

async function findChrome() {
    for (const candidate of CANDIDATES) {
        try {
            await access(candidate);

            return candidate;
        } catch {}
    }

    throw new Error('Chrome не найден. Укажите путь в CHROME_PATH.');
}

const BASE_FLAGS = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check'];

export async function printToPdf(htmlPath, pdfPath) {
    const chrome = await findChrome();
    await run(chrome, [...BASE_FLAGS, '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`]);
}

export async function screenshot(htmlPath, pngPath, width, height) {
    const chrome = await findChrome();
    await run(chrome, [
        ...BASE_FLAGS,
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--window-size=${width},${height}`,
        `--screenshot=${pngPath}`,
        `file://${htmlPath}`,
    ]);
}
