# Квестовичок

Сайт готовых квестов, конкурсов и игр для детского праздника дома: статьи-подборки (трафик из Яндекса
и Pinterest) + PDF-квесты для печати (продажи) + Telegram-канал (подписчики).

## Команды

```bash
pnpm i
pnpm dev                      # сайт на http://localhost:4321
pnpm build                    # статическая сборка в dist/
pnpm cms  +  pnpm dev         # админка на http://localhost:4321/admin/

pnpm quests [slug]            # JSON-квесты → products-pdf/*.pdf, превью, карточки товаров
pnpm pins                     # пины статей → public/pins/, расписание → pins/queue.json
pnpm pinterest boards         # создать доски в Pinterest (нужен PINTEREST_TOKEN)
pnpm pinterest publish 3      # опубликовать наступившие по времени пины
pnpm wordstat top "запрос"    # частотности Wordstat (нужны WORDSTAT_API_KEY, YC_FOLDER_ID)
pnpm serp "запрос"            # топ-10 Яндекса
```

Секреты — только в `.env` (см. `.env.example`), файл в git не попадает.

## Структура

- `src/content/articles/` — статьи (Markdown + frontmatter), правила — `content-src/STYLE.md`
- `content-src/quests/` — исходники бесплатных PDF, формат — `content-src/QUEST_SCHEMA.md`
- `private/quests/` — исходники платных PDF; это отдельный **приватный** репозиторий
  `BigBadBLOO/ideas-blog-products` (основной репо публичный). После клона:
  `git clone https://github.com/BigBadBLOO/ideas-blog-products private`
- `src/content/products/` — карточки товаров (генерируются `pnpm quests`)
- `research/` — исследования ниш, выгрузки Wordstat и выдачи
- `pins/queue.json` — очередь публикации пинов
- `content-src/telegram/channel.md` — описание канала и первые посты
- `.claude/skills/` — скиллы: `/niche-research`, `/write-article`, `/make-quest`, `/promote`

## Статусы статей

`draft` — не публикуется · `published` / `evergreen` — на сайте и в пинах ·
`archived` — страница живёт (на неё ведут пины), но в списках и очереди её нет. Статьи не удаляем.

## Запуск: что нужно сделать владельцу

1. **Продавец — ИП** (патент + УСН для продаж PDF, уточнить у бухгалтера): ФИО, ИНН, ОГРНИП, email в `SITE.owner` (`src/site.config.ts`).
2. **Домен** kvestovichok.ru (≈200–300 ₽/год, любой регистратор .ru).
3. **Хостинг**: создать репозиторий на GitHub, запушить, включить Pages (Settings → Pages → GitHub Actions),
   в DNS домена — записи для GitHub Pages. Проверить, что сайт открывается из РФ без VPN.
4. **Telegram-канал** по `content-src/telegram/channel.md`, закрепить бесплатный PDF → ссылку в `SITE.telegramUrl`.
5. **Приём оплат** (Продамус / ЮKassa / Tribute): создать 4 товара, загрузить PDF из `products-pdf/`,
   вписать ссылки оплаты в `buyUrl` карточек `src/content/products/*.md`.
6. **Яндекс Вебмастер** и **Метрика**: подтвердить сайт, отправить sitemap, ID счётчика → `SITE.yandexMetrikaId`.
7. **Pinterest**: бизнес-аккаунт, подтвердить сайт, приложение в developers.pinterest.com → `PINTEREST_TOKEN`
   в `.env` и в Secrets репозитория, переменная `PINS_ENABLED=true` → пины публикуются по расписанию.
8. **РСЯ** — когда появится трафик: ID блоков в `SITE.yandexRtb`.
