import { SITE } from '@/site.config';

export const getBreadcrumbJsonLd = (items: { name: string; path: string }[]) => ({
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Главная', path: '/' }, ...items].map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: new URL(item.path, SITE.url).href,
    })),
});

export const PUBLISHER = {
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url,
    logo: { '@type': 'ImageObject', url: new URL('/icon-512.png', SITE.url).href },
};
