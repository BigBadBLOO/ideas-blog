#!/usr/bin/env bash
# Деплой бота @kvestovichok_bot (bot/index.js) в Yandex Cloud Functions и подключение вебхука Telegram.
# Нужно: установленный и авторизованный yc CLI (yc init), TELEGRAM_BOT_TOKEN в .env.
# Usage: bash scripts/bot-deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

FUNCTION=kvestovichok-bot
CHANNEL=@kvestovichok
RUNTIME=${RUNTIME:-nodejs22}
TOKEN=$(node --env-file=.env -e 'process.stdout.write(process.env.TELEGRAM_BOT_TOKEN ?? "")')

if [ -z "$TOKEN" ]; then
    echo 'В .env нет TELEGRAM_BOT_TOKEN' >&2
    exit 1
fi

# Тот же расчёт секрета, что в bot/index.js
SECRET=$(TOKEN="$TOKEN" node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update("webhook:" + process.env.TOKEN).digest("hex").slice(0, 32))')

yc serverless function get --name "$FUNCTION" >/dev/null 2>&1 || yc serverless function create --name "$FUNCTION"

yc serverless function version create \
    --function-name "$FUNCTION" \
    --runtime "$RUNTIME" \
    --entrypoint index.handler \
    --memory 128m \
    --execution-timeout 10s \
    --source-path bot \
    --environment "TELEGRAM_BOT_TOKEN=$TOKEN,TELEGRAM_CHANNEL=$CHANNEL" >/dev/null

yc serverless function allow-unauthenticated-invoke "$FUNCTION" >/dev/null

FUNCTION_ID=$(yc serverless function get --name "$FUNCTION" --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).id))')
URL="https://functions.yandexcloud.net/$FUNCTION_ID"

TOKEN="$TOKEN" URL="$URL" SECRET="$SECRET" node --use-system-ca -e '
fetch(`https://api.telegram.org/bot${process.env.TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: process.env.URL, secret_token: process.env.SECRET, allowed_updates: ["message", "callback_query"], drop_pending_updates: true }),
}).then((r) => r.json()).then((j) => { if (!j.ok) { console.error(j.description); process.exit(1); } });
'

echo "✓ Бот развёрнут: $URL"
echo "  Проверка: откройте https://t.me/kvestovichok_bot?start=mini-kvest-tajna-propavshego-podarka"
