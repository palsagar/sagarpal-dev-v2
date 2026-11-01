// content-manifest.json (API.md §3): published posts for FastAPI's search,
// RSS, OG images and slug checks. Drafts never appear, not even in dev.
import type { APIRoute } from 'astro';
import { site } from '../data/site';
import { getPosts, isoDate } from '../lib/posts';

export const GET: APIRoute = async () => {
  const posts = (await getPosts()).filter((p) => !p.entry.data.draft);
  const manifest = {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    site: site.url,
    posts: posts.map(
      ({ entry: { data }, slug, url, readingMinutes, plainText }) => ({
        slug,
        url,
        title: data.title,
        dek: data.dek,
        date: isoDate(data.date),
        updated: data.updated ? isoDate(data.updated) : null,
        tags: data.tags,
        readingMinutes,
        text: plainText,
      }),
    ),
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};
