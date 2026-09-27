import { getCollection } from 'astro:content';

const LISTED_STATUSES = new Set(['published', 'evergreen']);

const byDateDesc = (a: { data: { publishedAt: Date } }, b: { data: { publishedAt: Date } }) =>
    b.data.publishedAt.getTime() - a.data.publishedAt.getTime();

// Архивные статьи не попадают в списки, но их страницы продолжают собираться — на них ведут пины.
export const getBuildableArticles = () => getCollection('articles', ({ data }) => data.status !== 'draft');

export const getListedArticles = async () =>
    (await getCollection('articles', ({ data }) => LISTED_STATUSES.has(data.status))).sort(byDateDesc);

export const getListedProducts = () => getCollection('products', ({ data }) => !data.isDraft);
