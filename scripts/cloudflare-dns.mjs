// Usage: node --use-system-ca --env-file=.env scripts/cloudflare-dns.mjs [--apply]
// Показывает зону kvestovichok.ru в Cloudflare; с --apply приводит записи к схеме GitHub Pages (только DNS, без прокси).
// Env: CLOUDFLARE_API_TOKEN (шаблон «Edit zone DNS»)

const ZONE = 'kvestovichok.ru';
const GITHUB_IPS = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];
const WWW_TARGET = 'bigbadbloo.github.io';
const API = 'https://api.cloudflare.com/client/v4';

const { CLOUDFLARE_API_TOKEN } = process.env;

if (!CLOUDFLARE_API_TOKEN) {
    console.error('Set CLOUDFLARE_API_TOKEN in .env');
    process.exit(1);
}

async function callApi(path, { method = 'GET', body } = {}) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();

    if (!data.success) {
        throw new Error(`${method} ${path}: ${JSON.stringify(data.errors)}`);
    }

    return data.result;
}

const [zone] = await callApi(`/zones?name=${ZONE}`);

if (!zone) {
    throw new Error(`Зона ${ZONE} не найдена — токен не видит домен`);
}

console.log(`Зона ${zone.name}: статус ${zone.status}, NS ${zone.name_servers.join(', ')}`);

const records = await callApi(`/zones/${zone.id}/dns_records?per_page=100`);
console.table(records.map(({ type, name, content, proxied }) => ({ type, name, content, proxied })));

if (process.argv.includes('--apply')) {
    const desired = [
        ...GITHUB_IPS.map((content) => ({ type: 'A', name: ZONE, content })),
        { type: 'CNAME', name: `www.${ZONE}`, content: WWW_TARGET },
    ];
    const isManaged = (record) =>
        (record.name === ZONE && ['A', 'AAAA', 'CNAME'].includes(record.type)) || record.name === `www.${ZONE}`;

    for (const record of records.filter(isManaged)) {
        const isWanted = desired.some((item) => item.type === record.type && item.name === record.name && item.content === record.content);

        if (!isWanted) {
            await callApi(`/zones/${zone.id}/dns_records/${record.id}`, { method: 'DELETE' });
            console.log(`- ${record.type} ${record.name} ${record.content}`);
        } else if (record.proxied) {
            await callApi(`/zones/${zone.id}/dns_records/${record.id}`, { method: 'PATCH', body: { proxied: false } });
            console.log(`~ ${record.type} ${record.name}: DNS only`);
        }
    }

    for (const item of desired) {
        const exists = records.some((record) => record.type === item.type && record.name === item.name && record.content === item.content);

        if (!exists) {
            await callApi(`/zones/${zone.id}/dns_records`, { method: 'POST', body: { ...item, ttl: 1, proxied: false } });
            console.log(`+ ${item.type} ${item.name} ${item.content}`);
        }
    }

    console.log('Готово.');
}
