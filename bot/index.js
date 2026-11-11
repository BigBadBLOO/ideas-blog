// Бот @kvestovichok_bot: выдаёт PDF-квесты подписчикам канала.
// Работает как Yandex Cloud Function (вебхук Telegram), деплой — scripts/bot-deploy.sh.
// Сайт ведёт на t.me/kvestovichok_bot?start=<slug товара>. Бот проверяет подписку на канал и копирует
// пользователю пост канала с PDF — файлы отдельно не храним.
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL (@kvestovichok)

const crypto = require('node:crypto');

// slug товара на сайте → пост канала с PDF (messageId из content-src/telegram/posts.json)
const QUESTS = {
    'novogodnij-kvest-pismo-deda-moroza': { title: 'Письмо Деда Мороза', ages: '5–9 лет', messageId: 8 },
    'advent-kalendar-31-zadanie': { title: 'Адвент-календарь: 31 задание', ages: '3–10 лет', messageId: 9 },
    'mini-kvest-tajna-propavshego-podarka': { title: 'Тайна пропавшего подарка', ages: '5–10 лет', messageId: 4 },
    'piratskij-kvest-sokrovishcha-kapitana': { title: 'Сокровища капитана Бороды', ages: '5–7 лет', messageId: 6 },
    'kvest-sekretnye-agenty': { title: 'Секретные агенты', ages: '8–12 лет', messageId: 7 },
};

const SUBSCRIBED = new Set(['creator', 'administrator', 'member']);

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL } = process.env;
const CHANNEL_URL = `https://t.me/${TELEGRAM_CHANNEL.replace(/^@/, '')}`;

// Секрет вебхука выводим из токена — его не нужно хранить отдельно (тот же расчёт в bot-deploy.sh)
const WEBHOOK_SECRET = crypto.createHash('sha256').update(`webhook:${TELEGRAM_BOT_TOKEN}`).digest('hex').slice(0, 32);

async function callApi(method, body) {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await response.json();

    if (!data.ok) {
        throw new Error(`${method}: ${data.description}`);
    }

    return data.result;
}

async function isSubscribed(userId) {
    const member = await callApi('getChatMember', { chat_id: TELEGRAM_CHANNEL, user_id: userId });

    return SUBSCRIBED.has(member.status) || (member.status === 'restricted' && member.is_member);
}

const questButtons = () =>
    Object.entries(QUESTS).map(([slug, quest]) => [{ text: `${quest.title} · ${quest.ages}`, callback_data: `get:${slug}` }]);

function sendMenu(chatId) {
    return callApi('sendMessage', {
        chat_id: chatId,
        text: 'Привет! Это бот «Квестовичка». Какой квест для печати прислать?',
        reply_markup: { inline_keyboard: questButtons() },
    });
}

// Кнопки меню — get:<slug>, кнопка «Я подписался» — chk:<slug>: для неё инструкция уже на экране,
// повторять её не нужно, хватит всплывающего предупреждения (prompt: false)
async function deliver(chatId, userId, slug, { prompt = true } = {}) {
    const quest = QUESTS[slug];

    if (!(await isSubscribed(userId))) {
        if (!prompt) {
            return false;
        }

        await callApi('sendMessage', {
            chat_id: chatId,
            text:
                `Квест «${quest.title}» — бесплатно для подписчиков канала «Квестовичок».\n\n` +
                '1. Подпишитесь на канал — там к каждому празднику новые игры и задания.\n' +
                '2. Вернитесь сюда и нажмите «Получить квест».',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Подписаться на канал', url: CHANNEL_URL }],
                    [{ text: 'Я подписался — получить квест', callback_data: `chk:${slug}` }],
                ],
            },
        });

        return false;
    }

    await callApi('copyMessage', { chat_id: chatId, from_chat_id: TELEGRAM_CHANNEL, message_id: quest.messageId });
    await callApi('sendMessage', {
        chat_id: chatId,
        text: 'Готово! Распечатайте и играйте. Другие квесты:',
        reply_markup: { inline_keyboard: questButtons().filter(([button]) => button.callback_data !== `get:${slug}`) },
    });

    return true;
}

async function handleUpdate(update) {
    if (update.message?.text) {
        const { chat, from, text } = update.message;
        const payload = text.startsWith('/start') ? text.split(/\s+/)[1] : undefined;

        return payload && QUESTS[payload] ? deliver(chat.id, from.id, payload) : sendMenu(chat.id);
    }

    if (update.callback_query) {
        const { id, data, from, message } = update.callback_query;
        const [action, slug] = (data ?? '').split(':');

        if (!QUESTS[slug] || !message || !['get', 'chk'].includes(action)) {
            return callApi('answerCallbackQuery', { callback_query_id: id });
        }

        const delivered = await deliver(message.chat.id, from.id, slug, { prompt: action === 'get' });

        return callApi('answerCallbackQuery', {
            callback_query_id: id,
            ...(delivered || action === 'get' ? {} : { text: 'Подписка пока не видна — подпишитесь на канал и нажмите ещё раз', show_alert: true }),
        });
    }
}

module.exports.handler = async (event) => {
    const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));

    if (headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
        return { statusCode: 403, body: 'forbidden' };
    }

    try {
        const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
        await handleUpdate(JSON.parse(body));
    } catch (error) {
        // Отвечаем 200, чтобы Telegram не повторял апдейт бесконечно; ошибка остаётся в логах функции
        console.error(error.message);
    }

    return { statusCode: 200, body: '' };
};
