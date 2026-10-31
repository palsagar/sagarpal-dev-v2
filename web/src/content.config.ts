// Data collections (REDESIGN_PLAN.md Phase 2). Fields follow the YAML migrated
// from Jekyll's _data/, plus `id` (the file loader needs one) and the home-page
// fields noted in each file. The blog collection holds the MDX posts (Phase 4).
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const publications = defineCollection({
  loader: file('src/data/publications.yml'),
  schema: z.object({
    title: z.string(),
    /** Author list; Sagar's name is wrapped in <strong>. Trusted HTML from this repo. */
    authors: z.string(),
    journal: z.string(),
    year: z.number().int(),
    description: z.string(),
    pdf: z.string().nullable(),
    doi: z.url(),
    featured: z.boolean(),
  }),
});

const projects = defineCollection({
  loader: file('src/data/projects.yml'),
  schema: ({ image }) =>
    z
      .object({
        order: z.number().int(),
        title: z.string(),
        tagline: z.string(),
        summary: z.string(),
        tech: z.string(),
        description: z.string(),
        image: image().optional(),
        image_alt: z.string().optional(),
        image_position: z.string().optional(),
        terminal: z
          .object({
            label: z.string(),
            command: z.string(),
            output: z.string(),
            status: z.string(),
          })
          .optional(),
        demo: z.url().optional(),
        pypi: z.url().optional(),
        github: z.url(),
        tags: z.array(z.string()),
      })
      .refine((p) => (p.image ? !!p.image_alt : !!p.terminal), {
        message: 'A project needs an image with image_alt, or a terminal',
      }),
});

const experience = defineCollection({
  loader: file('src/data/experience.yml'),
  schema: z.object({
    role: z.string(),
    company: z.string(),
    url: z.url(),
    period: z.string(),
    location: z.string(),
    description: z.string(),
  }),
});

const education = defineCollection({
  loader: file('src/data/education.yml'),
  schema: z.object({
    degree: z.string(),
    label: z.string().optional(),
    institution: z.string(),
    org: z.string().optional(),
    period: z.string(),
    location: z.string(),
  }),
});

/** Fixed topic list. The blog index shows a pill only for topics with posts. */
export const TOPICS = [
  'Numerics',
  'HPC',
  'Scientific ML',
  'GPU',
  'Notes',
] as const;

const blog = defineCollection({
  // One file per post; the file name is the slug (src/content/blog/<slug>.mdx).
  loader: glob({ pattern: '**/*.mdx', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      dek: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.enum(TOPICS)).min(1),
      /** Drafts render in `astro dev` only: never in the build, sitemap, RSS or manifest. */
      draft: z.boolean().default(true),
      /** Full-width figure under the header. `imageDay` swaps in on the day theme. */
      hero: z
        .object({
          image: image(),
          imageDay: image().optional(),
          alt: z.string(),
          /** With a caption, the hero is Figure 1. */
          caption: z.string().optional(),
        })
        .optional(),
      toc: z.boolean().default(true),
    }),
});

export const collections = {
  publications,
  projects,
  experience,
  education,
  blog,
};
