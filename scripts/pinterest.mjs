// Usage:
//   node --use-system-ca --env-file=.env scripts/pinterest.mjs boards        создать недостающие доски → pins/boards.json
//   node --use-system-ca --env-file=.env scripts/pinterest.mjs publish [N]   опубликовать до N пинов, чьё время наступило (по умолчанию 1)
// Env: PINTEREST_TOKEN — access token приложения Pinterest API v5 (scopes: boards:read, boards:write, pins:read, pins:write)

import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://api.pinterest.com/v5';
const QUEUE_PATH = 'pins/queue.json';
const BOARDS_PATH = 'pins/boards.json';

const BOARD_DESCRIPTIONS = {
    'Квесты для детей дома': 'Готовые квесты для детей дома: поиск подарка, загадки, шифры и задания по возрастам. Сценарии для печати.',
    'Конкурсы и игры на день рождения': 'Конкурсы и игры на детский день рождения дома: подвижные, за столом, для малышей и школьников.',
    'Детский праздник дома: сценарии': 'Сценарии детского праздника дома, программа дня рождения по минутам, идеи и чек-листы подготовки.',
    'Новый год с детьми: игры и идеи': 'Новогодний квест, адвент-календарь с заданиями, конкурсы на Новый год для детей и семьи.',
};

const { PINTEREST_TOKEN } = process.env;

if (!PINTEREST_TOKEN) {
    console.error('Set PINTEREST_TOKEN in .env');
    process.exit(1);
}

async function callApi(path, { method = 'GET', body } = {}) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${PINTEREST_TOKEN}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        throw new Error(`${method} ${path} ${response.status}: ${await response.text()}`);
    }

    return response.json();
}

const readJson = async (path, fallback) => {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch {
        return fallback;
    }
};

const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

async function syncBoards() {
    const queue = await readJson(QUEUE_PATH, []);
    const names = new Set([...Object.keys(BOARD_DESCRIPTIONS), ...queue.map((pin) => pin.board)]);
    const { items = [] } = await callApi('/boards?page_size=100');
    const boards = Object.fromEntries(items.map((board) => [board.name, board.id]));

    for (const name of names) {
        if (boards[name]) {
            continue;
        }

        const board = await callApi('/boards', {
            method: 'POST',
            body: { name, description: BOARD_DESCRIPTIONS[name] ?? '', privacy: 'PUBLIC' },
        });
        boards[name] = board.id;
        console.log(`+ доска «${name}»`);
    }

    await writeJson(BOARDS_PATH, boards);
    console.log(`Доски: ${Object.keys(boards).length} → ${BOARDS_PATH}`);
}

async function publishDue(limit) {
    const queue = await readJson(QUEUE_PATH, []);
    const boards = await readJson(BOARDS_PATH, {});
    const now = Date.now();
    const due = queue.filter((pin) => pin.status === 'pending' && pin.scheduledFor && Date.parse(pin.scheduledFor) <= now).slice(0, limit);

    for (const pin of due) {
        const boardId = boards[pin.board];

        if (!boardId) {
            console.error(`✗ ${pin.id}: нет доски «${pin.board}» — запустите команду boards`);
            continue;
        }

        try {
            const created = await callApi('/pins', {
                method: 'POST',
                body: {
                    board_id: boardId,
                    title: pin.title,
                    description: pin.description,
                    link: pin.link,
                    alt_text: pin.altText,
                    media_source: { source_type: 'image_url', url: pin.imageUrl },
                },
            });
            Object.assign(pin, { status: 'published', pinId: created.id, publishedAt: new Date().toISOString() });
            console.log(`✓ ${pin.id} → ${created.id}`);
        } catch (error) {
            Object.assign(pin, { lastError: error.message });
            console.error(`✗ ${pin.id}: ${error.message}`);
        }
    }

    await writeJson(QUEUE_PATH, queue);
    console.log(`Опубликовано: ${due.filter((pin) => pin.status === 'published').length} из ${due.length} готовых`);
}

const [command, arg] = process.argv.slice(2);

if (command === 'boards') {
    await syncBoards();
} else if (command === 'publish') {
    await publishDue(Number(arg ?? 1));
} else {
    console.error('Команда: boards | publish [N]');
    process.exit(1);
}
