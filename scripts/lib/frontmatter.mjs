// Разбор frontmatter статей без зависимостей: только поля, которые используют скрипты.

const unquote = (value) => value.trim().replace(/^['"]|['"]$/g, '');

const parseInlineList = (value) =>
    value
        .trim()
        .replace(/^\[|\]$/g, '')
        .match(/'[^']*'|"[^"]*"|[^,]+/g)
        ?.map(unquote)
        .filter(Boolean) ?? [];

function parseInlineObject(value) {
    const result = {};

    for (const [, key, raw] of value.matchAll(/(\w+):\s*('[^']*'|"[^"]*"|[^,}]+)/g)) {
        result[key] = unquote(raw);
    }

    return result;
}

export function parseArticle(source) {
    const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!match) {
        throw new Error('frontmatter не найден');
    }

    const [, head, body] = match;
    const lines = head.split('\n');
    const data = {};

    for (let i = 0; i < lines.length; i += 1) {
        const field = lines[i].match(/^(\w+):\s*(.*)$/);

        if (!field) {
            continue;
        }

        const [, key, value] = field;

        if (value.startsWith('[')) {
            data[key] = parseInlineList(value);
        } else if (value.startsWith('{')) {
            data[key] = parseInlineObject(value);
        } else if (value === '') {
            const items = [];

            while (lines[i + 1]?.match(/^\s+-\s+/)) {
                i += 1;
                items.push(unquote(lines[i].replace(/^\s+-\s+/, '')));
            }

            data[key] = items;
        } else {
            data[key] = unquote(value);
        }
    }

    return { data, body };
}
