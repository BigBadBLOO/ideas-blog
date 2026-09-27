// Линейные иконки мест в квартире для карточек-картинок (дети, которые ещё не читают).

const svg = (body) =>
    `<svg viewBox="0 0 200 140" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = [
    {
        keys: ['ванн'],
        body: `<path d="M20 60H180V80Q180 115 145 115H55Q20 115 20 80Z"/><path d="M50 115L45 130M150 115L155 130"/>
            <path d="M160 60V28H134"/><circle cx="72" cy="46" r="8"/><circle cx="94" cy="36" r="6"/><circle cx="114" cy="46" r="7"/>`,
    },
    {
        keys: ['тап'],
        body: `<rect x="14" y="98" width="172" height="18" rx="9"/><path d="M84 98Q86 54 136 52Q184 52 184 98"/>
            <path d="M14 98Q14 80 34 78"/><circle cx="138" cy="44" r="11"/><path d="M104 98Q108 74 134 72"/>`,
    },
    {
        keys: ['варежк', 'рукавиц'],
        body: `<path d="M72 106V60Q72 20 106 20Q140 20 140 60V106"/><path d="M72 78Q46 74 48 54Q52 36 72 46"/>
            <rect x="64" y="106" width="84" height="24" rx="6"/><path d="M96 58L116 58M106 48L106 68M99 51L113 65M113 51L99 65"/>`,
    },
    {
        keys: ['холодильник'],
        body: `<rect x="60" y="8" width="80" height="126" rx="10"/><path d="M60 54H140M124 24V40M124 68V96"/>`,
    },
    {
        keys: ['подушк'],
        body: `<path d="M28 38Q100 22 172 38Q184 70 172 102Q100 118 28 102Q16 70 28 38Z"/><path d="M60 60Q100 70 140 60"/>`,
    },
    {
        keys: ['стол'],
        body: `<rect x="18" y="44" width="164" height="14" rx="4"/><path d="M36 58V128M164 58V128M60 58V96M140 58V96"/>`,
    },
    {
        keys: ['диван'],
        body: `<path d="M40 70V44Q40 30 54 30H146Q160 30 160 44V70"/><path d="M22 70Q22 60 32 60Q42 60 42 70V96H158V70Q158 60 168 60Q178 60 178 70V110H22Z"/>
            <path d="M34 110V124M166 110V124"/>`,
    },
    {
        keys: ['шкаф'],
        body: `<rect x="50" y="8" width="100" height="120" rx="6"/><path d="M100 8V128M88 60V76M112 60V76M58 128V134M142 128V134"/>`,
    },
    {
        keys: ['книг'],
        body: `<path d="M100 32Q70 18 30 24V116Q70 110 100 124Q130 110 170 116V24Q130 18 100 32Z"/><path d="M100 32V124"/>`,
    },
    {
        keys: ['окн', 'подоконник'],
        body: `<rect x="44" y="10" width="112" height="104" rx="6"/><path d="M100 10V114M44 62H156M30 124H170"/>`,
    },
    {
        keys: ['ёлк', 'елк'],
        body: `<path d="M100 10L70 50H86L56 88H76L42 120H158L124 88H144L114 50H130Z"/><path d="M100 120V134"/>`,
    },
    {
        keys: ['корзин'],
        body: `<path d="M34 50H166L150 128H50Z"/><path d="M60 50Q100 6 140 50M70 70V110M100 70V110M130 70V110"/>`,
    },
];

export function getPlaceIcon(...texts) {
    const haystack = texts.filter(Boolean).join(' ').toLowerCase();
    const icon = ICONS.find(({ keys }) => keys.some((key) => haystack.includes(key)));

    return icon ? svg(icon.body) : null;
}
