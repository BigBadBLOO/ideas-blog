export const SITE = {
    name: 'Квестовичок',
    tagline: 'Готовые квесты, конкурсы и игры для детского праздника дома',
    url: 'https://kvestovichok.ru',
    locale: 'ru_RU',
    telegramUrl: 'https://t.me/kvestovichok',
    // РСЯ: ID блоков из partner.yandex.ru. Пока null — рекламные слоты не рендерятся.
    yandexRtb: {
        top: null as string | null,
        inContent: null as string | null,
        bottom: null as string | null,
    },
    yandexMetrikaId: null as string | null,
    // Данные самозанятого для оферты и политики. Пока null — юридические страницы закрыты от индексации.
    owner: {
        name: null as string | null,
        inn: null as string | null,
        email: null as string | null,
    },
    inContentAdEvery: 4,
} as const;

export const CATEGORIES = {
    kvesty: { title: 'Квесты', description: 'Сценарии квестов для детей дома: задания, загадки, поиск подарка' },
    'konkursy-i-igry': { title: 'Конкурсы и игры', description: 'Конкурсы и игры на детский день рождения по возрастам' },
    prazdniki: { title: 'Праздники', description: 'Новый год, адвент-календарь и другие поводы: идеи и задания' },
} as const;

export type CategorySlug = keyof typeof CATEGORIES;

export const CATEGORY_SLUGS = Object.keys(CATEGORIES) as [CategorySlug, ...CategorySlug[]];
