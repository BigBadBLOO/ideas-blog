// Usage:
//   node --use-system-ca --env-file=.env scripts/pinterest.mjs boards        создать недостающие доски → pins/boards.json
//   node --use-system-ca --env-file=.env scripts/pinterest.mjs publish [N]   опубликовать до N пинов, чьё время наступило (по умолчанию 1)
//   PINTEREST_ENV=sandbox node … scripts/pinterest.mjs demo                   песочница: доска + один пин из очереди (очередь не меняется)
//   node … scripts/pinterest.mjs list                                          доски и пины аккаунта (в песочнице — тоже)
//   PINTEREST_ENV=sandbox node … scripts/pinterest.mjs cleanup                 удалить тестовые доски «API test …» из песочницы
// Env: PINTEREST_TOKEN — access token приложения Pinterest API v5 (scopes: boards:read, boards:write, pins:read, pins:write);
//      PINTEREST_SANDBOX_TOKEN — токен песочницы

import { readFile, writeFile } from 'node:fs/promises';

const IS_SANDBOX = process.env.PINTEREST_ENV === 'sandbox';
const API = IS_SANDBOX ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
const QUEUE_PATH = 'pins/queue.json';
const BOARDS_PATH = IS_SANDBOX ? 'pins/boards.sandbox.json' : 'pins/boards.json';

const BOARD_DESCRIPTIONS = {
    'Квесты для детей дома': 'Готовые квесты для детей дома: поиск подарка, загадки, шифры и задания по возрастам. Сценарии для печати.',
    'Конкурсы и игры на день рождения': 'Конкурсы и игры на детский день рождения дома: подвижные, за столом, для малышей и школьников.',
    'Детский праздник дома: сценарии': 'Сценарии детского праздника дома, программа дня рождения по минутам, идеи и чек-листы подготовки.',
    'Новый год с детьми: игры и идеи': 'Новогодний квест, адвент-календарь с заданиями, конкурсы на Новый год для детей и семьи.',
};

const PINTEREST_TOKEN = IS_SANDBOX ? (process.env.PINTEREST_SANDBOX_TOKEN ?? process.env.PINTEREST_TOKEN) : process.env.PINTEREST_TOKEN;

if (!PINTEREST_TOKEN) {
    console.error(`Set ${IS_SANDBOX ? 'PINTEREST_SANDBOX_TOKEN' : 'PINTEREST_TOKEN'} in .env`);
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

async function demo() {
    const queue = await readJson(QUEUE_PATH, []);
    const pin = queue.find((item) => item.status === 'pending');
    const me = await callApi('/user_account');
    console.log(`Аккаунт: ${me.username} (${API})`);
    const board = await callApi('/boards', {
        method: 'POST',
        body: { name: `API test ${new Date().toISOString().slice(0, 16)}`, description: 'Sandbox demo board', privacy: 'PUBLIC' },
    });
    console.log(`✓ Доска создана: ${board.id} «${board.name}»`);
    const created = await callApi('/pins', {
        method: 'POST',
        body: {
            board_id: board.id,
            title: pin.title,
            description: pin.description,
            link: pin.link,
            alt_text: pin.altText,
            media_source: { source_type: 'image_url', url: pin.imageUrl },
        },
    });
    console.log(`✓ Пин создан: ${created.id} «${created.title}»`);
    const fetched = await callApi(`/pins/${created.id}`);
    console.log(`Проверка GET /pins/${created.id}: ${fetched.title} | ${fetched.link}`);
}

async function list() {
    const { items: boards = [] } = await callApi('/boards?page_size=100');
    console.log(`${IS_SANDBOX ? 'Песочница' : 'Аккаунт'}: ${boards.length} досок`);

    for (const board of boards) {
        const { items: pins = [] } = await callApi(`/boards/${board.id}/pins?page_size=100`);
        console.log(`\n«${board.name}» — ${pins.length} пин.`);
        pins.forEach((pin) => console.log(`  • ${pin.title} → ${(pin.link ?? '').split('?')[0]}`));
    }
}

async function cleanup() {
    if (!IS_SANDBOX) {
        throw new Error('cleanup работает только в песочнице (PINTEREST_ENV=sandbox)');
    }

    const { items: boards = [] } = await callApi('/boards?page_size=100');

    for (const board of boards.filter((item) => item.name.startsWith('API test'))) {
        await fetch(`${API}/boards/${board.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${PINTEREST_TOKEN}` } });
        console.log(`- «${board.name}»`);
    }
}

const [command, arg] = process.argv.slice(2);

if (command === 'boards') {
    await syncBoards();
} else if (command === 'list') {
    await list();
} else if (command === 'cleanup') {
    await cleanup();
} else if (command === 'demo') {
    await demo();
} else if (command === 'publish') {
    await publishDue(Number(arg ?? 1));
} else {
    console.error('Команда: boards | publish [N] | demo | list | cleanup');
    process.exit(1);
}
