import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const diary = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/diary' }),
  schema: z.object({
    date: z.string(),
    title: z.string(),
    mood: z.number().optional(),
    hunger: z.number().optional(),
    energy: z.number().optional(),
  }),
});

export const collections = { diary };
