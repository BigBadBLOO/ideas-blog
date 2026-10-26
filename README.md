# Квестовичок

Сайт https://kvestovichok.ru — готовые квесты, конкурсы и игры для детского праздника дома.
Статьи приводят трафик из Яндекса и Pinterest, квесты для печати бесплатно раздаются в Telegram
(@kvestovichok), подписчики канала — основная аудитория.

Все команды запускаются из папки проекта: `cd ~/WebstormProjects/ideas-blog`.

## Что работает само

| Что | Когда | Где настроено |
|---|---|---|
| Выкладка сайта | после каждого push в `main` | `.github/workflows/deploy.yml` |
| Публикация пинов в Pinterest | 3 раза в день: 9:15, 14:15, 20:15 МСК | `.github/workflows/publish-pins.yml`, очередь `pins/queue.json` |
| Посты в Telegram | раз в день в 19:05 МСК, если в очереди есть пост на сегодня | `.github/workflows/publish-telegram.yml`, очередь `content-src/telegram/posts.json` |

Каждая публикация отмечается в своей очереди коммитом от бота — перед работой делайте `git pull`.

## Что запускать и когда

### Раз в неделю — новый контент (через Claude Code)

1. `/niche-research` — исследование спроса на ближайшие недели (Wordstat, сезоны, выдача Яндекса).
   Результат — `research/weekly/ГГГГ-Wнн.md` со списком идей; отметить нужные.
2. `/write-article <идея>` — статья по выбранной идее (2–3 в неделю). Скилл сам проверит факты,
   соберёт сайт и нарисует пины.
3. `/make-quest <идея>` — новый PDF-квест, если в исследовании есть идея товара.
4. `/promote` — пины для новых статей, свежие пины для старых, расписание очереди.
5. `git push` — сайт выложится сам, новые пины встанут в автопубликацию.
6. Через пару минут после выкладки — `pnpm indexnow`: Яндекс узнает о новых страницах сразу, не дожидаясь обхода.

### Раз в неделю — проверить, как дела

```bash
pnpm stats metrika 7      # визиты, источники, страницы входа, переходы в Telegram за 7 дней
pnpm stats webmaster      # сколько страниц в поиске Яндекса и по каким запросам показываемся
pnpm pinterest list       # доски и опубликованные пины
```

### По сезону

- **За 1–2 недели до сезона** (Новый год, 23 февраля, 8 марта, выпускные, лето) — `/niche-research`
  подскажет, какие статьи освежить; у сезонных статей обновить год в тексте и добавить `pinTitles`,
  затем `/promote`.
- **Пост в Telegram** — добавить в `content-src/telegram/posts.json` запись со `status: "pending"` и датой
  `scheduledFor`; выйдет сам. Пост с файлом (PDF) публикуется только с ноутбука:
  `pnpm telegram publish 1` (файлов квестов нет в GitHub).

### Редко, но обязательно

| Когда | Что сделать |
|---|---|
| **до 21 декабря 2026**, затем каждые ~2 месяца | Перевыпустить доступ Pinterest (refresh-токен живёт 60 дней): `pnpm pinterest:auth` → «Дать доступ», затем `node -e "process.stdout.write(require('./.pinterest-oauth.json').refreshToken)" \| gh secret set PINTEREST_REFRESH_TOKEN`. Дата окончания — в `.pinterest-oauth.json` (`refreshTokenExpiresAt`). |
| **январь 2027** и каждые ~3 месяца | Проверить, что https://kvestovichok.ru открывается без ошибки сертификата. GitHub продлевает его сам; если продление зависнет — Settings → Pages → Remove домен, через 10 минут добавить снова. |
| **до 27 сентября 2027** | Продлить домен kvestovichok.ru в REG.RU. |
| при смене пароля / отзыве доступа Яндекса | Новый токен Яндекса (`YANDEX_OAUTH_TOKEN` в `.env`) для `pnpm stats`. |

**DNS только на REG.RU** (`ns1/ns2.reg.ru`). Cloudflare и другие зарубежные DNS-серверы из России не
резолвятся — сайт пропадает для всех посетителей и робота Яндекса.

## Все команды

```bash
pnpm i                         # установить зависимости
pnpm dev                       # сайт локально: http://localhost:4321
pnpm build                     # собрать сайт в dist/
pnpm cms  +  pnpm dev          # админка статей: http://localhost:4321/admin/

pnpm quests [slug]             # PDF-квесты → products-pdf/, превью, карточки товаров
pnpm pins                      # нарисовать пины статей и пересобрать расписание очереди
node scripts/pins-helper.mjs   # страница для ручной публикации пинов (pins/helper.html)

pnpm pinterest:auth            # авторизация Pinterest (раз в ~2 месяца, см. выше)
pnpm pinterest list            # доски и пины аккаунта
pnpm pinterest publish 3       # вручную опубликовать пины, чьё время наступило
pnpm pinterest boards          # создать недостающие доски
PINTEREST_ENV=sandbox pnpm pinterest demo|list|cleanup   # тесты в песочнице Pinterest

pnpm telegram check            # проверить бота и права в канале
pnpm telegram publish 1        # вручную опубликовать пост, чьё время наступило

pnpm stats metrika [дней]      # отчёт Яндекс Метрики
pnpm stats webmaster           # отчёт Яндекс Вебмастера
pnpm indexnow [путь ...]       # сообщить Яндексу о страницах (без аргументов — весь sitemap)
pnpm wordstat top "запрос"     # частотности Wordstat (до 2000 фраз)
pnpm wordstat dynamics "запрос"  # помесячная динамика за 2 года
pnpm serp "запрос"             # топ-10 выдачи Яндекса
```

Для Node на этом ноутбуке нужен `--use-system-ca` (корпоративный сертификат) — в `pnpm`-скриптах он уже стоит.

## Секреты

Только в `.env` (образец — `.env.example`), файл в git не попадает. Для GitHub Actions те же ключи лежат
в Settings → Secrets: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REFRESH_TOKEN`,
`TELEGRAM_BOT_TOKEN`; переменная `PINS_ENABLED=true` включает автопубликацию пинов.

## Структура

- `src/content/articles/` — статьи (Markdown + frontmatter), правила — `content-src/STYLE.md`
- `content-src/quests/` — исходники бесплатных PDF, формат — `content-src/QUEST_SCHEMA.md`
- `private/quests/` — исходники PDF, которые не публикуются в открытом репозитории; это отдельный
  **приватный** репозиторий `BigBadBLOO/ideas-blog-products`. После клона:
  `git clone https://github.com/BigBadBLOO/ideas-blog-products private`
- `src/content/products/` — карточки квестов (генерируются `pnpm quests`)
- `research/` — исследования ниш, выгрузки Wordstat и выдачи
- `pins/queue.json` — очередь пинов; `content-src/telegram/posts.json` — очередь постов
- `.claude/skills/` — скиллы: `/niche-research`, `/write-article`, `/make-quest`, `/promote`

## Статусы статей

`draft` — не публикуется · `published` / `evergreen` — на сайте и в пинах ·
`archived` — страница живёт (на неё ведут пины), но в списках и очереди её нет. Статьи не удаляем.

## Продажи

Сейчас выключены: `isSalesEnabled: false` в `src/site.config.ts`, все квесты бесплатно в Telegram.
Чтобы включить: оформить статус для приёма платежей, подключить Робокассу с Робочеками, вписать ссылки
оплаты в `buyUrl` карточек `src/content/products/*.md`, данные продавца в `SITE.owner` и поставить флаг в `true`.
