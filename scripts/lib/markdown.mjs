// Минимальный markdown → HTML для PDF-листов: заголовки, абзацы, списки, чекбоксы, таблицы, **жирный**, *курсив*.

const escapeHtml = (value) =>
    String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (value) =>
    escapeHtml(value)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');

const splitRow = (line) =>
    line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim());

export function markdownToHtml(source = '') {
    const lines = String(source).replace(/\r/g, '').split('\n');
    const html = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];

        if (!line.trim()) {
            index += 1;
            continue;
        }

        const heading = line.match(/^(#{1,4})\s+(.*)$/);

        if (heading) {
            const level = Math.min(heading[1].length + 1, 4);
            html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            index += 1;
            continue;
        }

        if (line.trim().startsWith('|')) {
            const rows = [];

            while (index < lines.length && lines[index].trim().startsWith('|')) {
                rows.push(lines[index]);
                index += 1;
            }

            const [header, maybeDivider, ...rest] = rows;
            const hasDivider = maybeDivider && /^\s*\|?[\s:-]+\|/.test(maybeDivider) && !/[^\s|:-]/.test(maybeDivider);
            const body = hasDivider ? rest : [maybeDivider, ...rest].filter(Boolean);
            html.push(
                '<table>',
                `<thead><tr>${splitRow(header)
                    .map((cell) => `<th>${inline(cell)}</th>`)
                    .join('')}</tr></thead>`,
                `<tbody>${body
                    .map((row) => `<tr>${splitRow(row)
                        .map((cell) => `<td>${inline(cell)}</td>`)
                        .join('')}</tr>`)
                    .join('')}</tbody>`,
                '</table>',
            );
            continue;
        }

        if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
            const isOrdered = /^\s*\d+\./.test(line);
            const items = [];

            while (index < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^\s*([-*]|\d+\.)\s+/, ''));
                index += 1;
            }

            const tag = isOrdered ? 'ol' : 'ul';
            const rendered = items.map((item) => {
                const checkbox = item.match(/^\[( |x)\]\s*(.*)$/i);

                return checkbox
                    ? `<li class="check"><span class="box"></span>${inline(checkbox[2])}</li>`
                    : `<li>${inline(item)}</li>`;
            });
            html.push(`<${tag}>${rendered.join('')}</${tag}>`);
            continue;
        }

        const paragraph = [];

        while (
            index < lines.length &&
            lines[index].trim() &&
            !/^(#{1,4})\s/.test(lines[index]) &&
            !lines[index].trim().startsWith('|') &&
            !/^\s*([-*]|\d+\.)\s+/.test(lines[index])
        ) {
            paragraph.push(lines[index].trim());
            index += 1;
        }

        html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }

    return html.join('\n');
}

export { escapeHtml };
