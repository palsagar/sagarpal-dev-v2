// Blog posts for pages, the home Writing section and content-manifest.json.
// Drafts are included only under `astro dev` (REDESIGN_PLAN.md Phase 4).
import { getCollection, render, type CollectionEntry } from 'astro:content';

export interface Post {
  entry: CollectionEntry<'blog'>;
  slug: string;
  url: string;
  readingMinutes: number;
  /** Body as plain text (no code, math or JSX), for the manifest. */
  plainText: string;
}

let cached: Promise<Post[]> | undefined;

/** Rendering is needed only for the plugin front matter, so a build loads the
 *  list once. Dev reloads it on each call, so edits show at once. */
export function getPosts(): Promise<Post[]> {
  if (import.meta.env.DEV) return loadPosts();
  return (cached ??= loadPosts());
}

async function loadPosts(): Promise<Post[]> {
  const entries = await getCollection(
    'blog',
    ({ data }) => import.meta.env.DEV || !data.draft,
  );
  const posts = await Promise.all(
    entries.map(async (entry) => {
      const { remarkPluginFrontmatter: meta } = await render(entry);
      return {
        entry,
        slug: entry.id,
        url: `/blog/${entry.id}/`,
        readingMinutes: Number(meta.readingMinutes) || 1,
        plainText: String(meta.plainText ?? ''),
      };
    }),
  );
  // Newest first. getCollection() does not keep any order.
  return posts.sort(
    (a, b) =>
      b.entry.data.date.getTime() - a.entry.data.date.getTime() ||
      a.slug.localeCompare(b.slug),
  );
}

/** "2026-10-12" (UTC, as written in the front matter). */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

/** "12 October 2026" */
export const longDate = (d: Date) =>
  fmt(d, { day: 'numeric', month: 'long', year: 'numeric' });

/** "12 Oct 2026" (en-GB writes "Sept"; the design uses three letters). */
export const shortDate = (d: Date) =>
  `${d.getUTCDate()} ${monthAbbr(d)} ${d.getUTCFullYear()}`;

/** "12 Oct" */
export const dayMonth = (d: Date) => `${d.getUTCDate()} ${monthAbbr(d)}`;

/** "Oct" (en-US: en-GB writes "Sept"). */
export const monthAbbr = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
