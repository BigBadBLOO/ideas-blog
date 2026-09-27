---
name: make-quest
description: Создать PDF-товар «Квестовичка» — квест-цепочку или набор карточек (адвент и т.п.) — из JSON по схеме, собрать PDF, превью и карточку товара.
---

## 1. Контент
- Прочитай `content-src/QUEST_SCHEMA.md` и `content-src/STYLE.md`; посмотри 1–2 существующих
  `content-src/quests/*.json` как образец уровня.
- Бесплатный товар — `content-src/quests/<slug>.json` (публичный репо). **Платный — только `private/quests/<slug>.json`**:
  это отдельный приватный репозиторий `BigBadBLOO/ideas-blog-products`, основной репо публичный. После создания —
  `git -C private add -A && git -C private commit -m "feat: квест <slug>" && git -C private push`.
- Для набора карточек (не цепочки) — формат `kind: "advent"`
  (см. `advent-kalendar-31-zadanie.json`: поле `days` вместо `stages`).
- Цена: мини/бесплатный — 0; квест 5–7 лет — 290; 8–12 лет с шифрами — 390; наборы карточек — 190.

## 2. Проверка цепочки
```bash
python3 - <<'EOF'
import json; q=json.load(open('private/quests/<slug>.json'))  # или content-src/quests для бесплатного
places=[s['answerPlace'] for s in q['stages']]
assert len(places)==len(set(places)), 'повторяются места'
for s in q['stages']:
    if s['type']=='acrostic': print(''.join(a['answer'][0] for a in s['acrostic']), '→', s['answerPlace'])
EOF
```
Ответ этапа N — место карточки N+1; ответ последнего — место приза. Загадки — однозначные.

## 3. Сборка и визуальная проверка
- `QUEST_DEBUG_DIR=/tmp/qdebug node scripts/quest-pdf.mjs <slug>` → `products-pdf/<slug>.pdf`,
  превью `public/products/<slug>/`, карточка `src/content/products/<slug>.md`.
- Открой (Read) PNG из `/tmp/qdebug/<slug>/`: ничего не обрезано, шифры читаются, у `picture`-этапов
  есть иконка (иначе добавь её в `scripts/lib/icons.mjs` или замени этап).
- `pnpm build`.

## 4. Подключение
- Добавь slug в `products` релевантных статей и в список товаров в `content-src/STYLE.md`.
- Ссылку на оплату (`buyUrl`) вписывает пользователь после создания товара в платёжном сервисе —
  до этого на сайте кнопка «скоро в продаже». PDF для загрузки в сервис — `products-pdf/<slug>.pdf`.
