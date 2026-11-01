// Reading list from GET /api/reading (API.md §4), shared by the reading page
// (lib/reading-page.ts) and the home band (lib/reading-band.ts). The list is
// fetched at run time (the endpoint is no-store), so items added in the admin
// show up without a rebuild. Item text is only ever set with textContent.

export type Kind = 'book' | 'paper' | 'article';
export type Status = 'reading' | 'finished' | 'queued';

export interface ReadingItem {
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
  /** Ready to display: "Book, started October 2026". */
  label: string;
}

export interface ReadingList {
  items: ReadingItem[];
  counts: Record<'all' | Kind, number>;
}

const TIMEOUT_MS = 10_000;

/** GET /api/reading. Rejects on a network error, a timeout, a non-2xx or a bad body. */
export async function fetchReading(
  signal: AbortSignal,
  status?: Status,
): Promise<ReadingList> {
  // AbortSignal.any() needs Safari 17.4, so combine the two signals by hand.
  const abort = new AbortController();
  const stop = () => abort.abort();
  const timer = setTimeout(stop, TIMEOUT_MS);
  signal.addEventListener('abort', stop, { once: true });
  let res: Response;
  try {
    res = await fetch(`/api/reading${status ? `?status=${status}` : ''}`, {
      headers: { Accept: 'application/json' },
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
  if (!res.ok) throw new Error(`GET /api/reading: ${res.status}`);
  const body = (await res.json()) as Partial<ReadingList> | null;
  if (!Array.isArray(body?.items) || typeof body.counts?.all !== 'number') {
    throw new Error('GET /api/reading: unexpected body');
  }
  return body as ReadingList;
}

export const KIND_NAME: Record<Kind, string> = {
  book: 'Book',
  paper: 'Paper',
  article: 'Article',
};

/** "Ada Author, 1997"; either part may be missing. */
export function byline(item: ReadingItem): string {
  return [item.authors, item.year].filter(Boolean).join(', ');
}

/**
 * Show `el` with `text`, or hide it when there is no text, so an empty
 * paragraph never takes space.
 */
export function setText(el: HTMLElement, text: string | null | undefined) {
  el.textContent = text ?? '';
  el.hidden = !text;
}

/**
 * Make `el` (an <a> from a template) link to `url`, or swap it for a <span>
 * with the same class and content when there is no url.
 */
export function linkOrText(el: HTMLAnchorElement, url: string | null) {
  if (url) {
    el.href = url;
    return el;
  }
  const span = document.createElement('span');
  span.className = el.className;
  for (const { name, value } of el.attributes) {
    if (name.startsWith('data-')) span.setAttribute(name, value);
  }
  span.append(...el.childNodes);
  el.replaceWith(span);
  return span;
}

/** First element matching `[data-f="name"]` inside `root`. */
export function field<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  name: string,
): T {
  return root.querySelector<T>(`[data-f="${name}"]`)!;
}

/** Clone the first element of `<template data-tpl="name">`. */
export function fromTemplate<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  name: string,
): T {
  const tpl = root.querySelector<HTMLTemplateElement>(
    `template[data-tpl="${name}"]`,
  )!;
  return tpl.content.firstElementChild!.cloneNode(true) as T;
}
