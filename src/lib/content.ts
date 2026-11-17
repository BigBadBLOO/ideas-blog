import { getCollection } from 'astro:content';
import { SITE } from '@/site.config';

const LISTED_STATUSES = new Set(['published', 'evergreen']);

const byDateDesc = (a: { data: { publishedAt: Date } }, b: { data: { publishedAt: Date } }) =>
    b.data.publishedAt.getTime() - a.data.publishedAt.getTime();

// Архивные статьи не попадают в списки, но их страницы продолжают собираться — на них ведут пины.
export const getBuildableArticles = () => getCollection('articles', ({ data }) => data.status !== 'draft');

export const getListedArticles = async () =>
    (await getCollection('articles', ({ data }) => LISTED_STATUSES.has(data.status))).sort(byDateDesc);

export const getListedProducts = () => getCollection('products', ({ data }) => !data.isDraft);

export const isProductFree = (product: { data: { isFree: boolean } }) => !SITE.isSalesEnabled || product.data.isFree;

const monthDay = (date: Date) => date.toISOString().slice(5, 10);

// Статья «в сезоне» от promoteFrom до недели после пика; окно может переходить через Новый год.
export const isInSeason = (season: { promoteFrom: string; peak: string } | undefined, now = new Date()) => {
    if (!season) {
        return false;
    }
    const end = new Date(`2001-${season.peak}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 7);
    const [from, to, today] = [season.promoteFrom, monthDay(end), monthDay(now)];

    return from <= to ? from <= today && today <= to : today >= from || today <= to;
};
