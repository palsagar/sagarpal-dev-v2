import type { Page, Route } from '@playwright/test';

// Mocked GET /api/reading responses for the reading page and the home band.
// `astro preview` has no API, so every test routes the endpoint itself.
// These items are test data only; the real list launches empty.

type Kind = 'book' | 'paper' | 'article';
type Status = 'reading' | 'finished' | 'queued';

export interface Item {
  id: number;
  kind: Kind;
  title: string;
  authors: string;
  year: number | null;
  source: string | null;
  url: string | null;
  identifier: string | null;
  cover_url: string | null;
  status: Status;
  started_on: string | null;
  finished_on: string | null;
  note: string | null;
  label: string;
}

export function item(
  fields: Partial<Item> & Pick<Item, 'id' | 'kind' | 'title' | 'status'>,
): Item {
  return {
    authors: '',
    year: null,
    source: null,
    url: null,
    identifier: null,
    cover_url: null,
    started_on: null,
    finished_on: null,
    note: null,
    label: fields.kind[0].toUpperCase() + fields.kind.slice(1),
    ...fields,
  };
}

/** Same shape and order as the API (reading, finished, queued; newest first). */
export const ITEMS: Item[] = [
  item({
    id: 1,
    kind: 'book',
    status: 'reading',
    title: 'Test Book Being Read',
    authors: 'Ada Author',
    year: 1997,
    url: 'https://example.org/book',
    started_on: '2026-10-02',
    label: 'Book, started October 2026',
    note: 'Test note for the book on the desk.',
  }),
  item({
    id: 2,
    kind: 'paper',
    status: 'reading',
    title: 'TESTNET: a test paper with a long subtitle',
    authors: 'Bea, Cid',
    year: 2022,
    source: 'arXiv',
    identifier: '2206.07697',
    url: 'https://arxiv.org/abs/2206.07697',
    started_on: '2026-09-10',
    label: 'Paper, started September 2026',
    note: 'Test note for the paper.',
  }),
  item({
    id: 3,
    kind: 'article',
    status: 'reading',
    title: 'Test Article Without a Link',
    authors: 'Dee',
    year: 2019,
    started_on: '2026-08-01',
    label: 'Article, reread August 2026',
  }),
  item({
    id: 4,
    kind: 'paper',
    status: 'finished',
    title: 'Test Paper Finished in 2026',
    authors: 'Eve et al.',
    year: 2021,
    source: 'Journal of Tests',
    identifier: '10.1000/test',
    url: 'https://doi.org/10.1000/test',
    finished_on: '2026-09-14',
    label: 'Paper, finished September 2026',
    note: 'Test note for the finished paper.',
  }),
  item({
    id: 5,
    kind: 'book',
    status: 'finished',
    title: 'Test Book Finished in 2026',
    authors: 'Fay',
    finished_on: '2026-08-03',
    label: 'Book, finished August 2026',
  }),
  item({
    id: 6,
    kind: 'book',
    status: 'finished',
    title: 'Test Book Finished in 2025',
    authors: 'Gus',
    year: 2006,
    url: 'https://example.org/book-2025',
    finished_on: '2025-11-20',
    label: 'Book, finished November 2025',
  }),
  item({
    id: 7,
    kind: 'book',
    status: 'queued',
    title: 'Test Queued Book',
    authors: 'Hal',
    label: 'Book, added October 2026',
  }),
  item({
    id: 8,
    kind: 'paper',
    status: 'queued',
    title: 'Test Queued Paper',
    authors: 'Ida et al.',
    year: 2024,
    url: 'https://example.org/queued-paper',
    label: 'Paper, added September 2026',
  }),
];

export function body(items: Item[]) {
  const count = (k: Kind) => items.filter((i) => i.kind === k).length;
  return {
    items,
    counts: {
      all: items.length,
      book: count('book'),
      paper: count('paper'),
      article: count('article'),
    },
  };
}

/** Answer GET /api/reading (any query) the way the real API would. */
export async function mockReading(
  page: Page,
  items: Item[],
  opts: { delayMs?: number; requests?: string[] } = {},
) {
  await page.route('**/api/reading**', async (route: Route) => {
    const url = new URL(route.request().url());
    opts.requests?.push(url.pathname + url.search);
    const status = url.searchParams.get('status');
    const kind = url.searchParams.get('kind');
    const byStatus = status ? items.filter((i) => i.status === status) : items;
    const counts = body(byStatus).counts;
    const shown = kind ? byStatus.filter((i) => i.kind === kind) : byStatus;
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    await route.fulfill({
      json: { items: shown, counts },
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
