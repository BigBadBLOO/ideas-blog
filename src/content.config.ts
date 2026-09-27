import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORY_SLUGS } from './site.config';

const ages = z.array(z.enum(['3-4', '5-7', '8-10', '11-13', 'взрослые']));

const articles = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        keyword: z.string(),
        category: z.enum(CATEGORY_SLUGS),
        ages: ages.default([]),
        status: z.enum(['draft', 'published', 'evergreen', 'archived']).default('draft'),
        season: z
            .object({
                promoteFrom: z.string().regex(/^\d{2}-\d{2}$/),
                peak: z.string().regex(/^\d{2}-\d{2}$/),
            })
            .optional(),
        products: z.array(reference('products')).default([]),
        pinTitles: z.array(z.string()).default([]),
        publishedAt: z.coerce.date(),
        updatedAt: z.coerce.date().optional(),
    }),
});

const products = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        theme: z.string(),
        ages: ages,
        isFree: z.boolean().default(false),
        price: z.number().int().nonnegative().optional(),
        buyUrl: z.string().optional(),
        telegramUrl: z.string().optional(),
        pages: z.number().int().positive().optional(),
        coverColor: z.string().default('#ff8a3d'),
        previews: z.array(z.string()).default([]),
        isDraft: z.boolean().default(true),
    }),
});

export const collections = { articles, products };
