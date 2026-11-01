// /what-im-reading/ (DESIGN.md §7.4): fetches the whole list once, then
// renders "Reading now", "Finished" and "Up next" for the chosen type.
// Filtering is local; the counts come from the API. States: loading
// (skeleton), empty, error (one quiet line) and ready. Returns a clean-up
// function for the client router.

import {
  KIND_NAME,
  byline,
  fetchReading,
  field,
  fromTemplate,
  linkOrText,
  setText,
  type Kind,
  type ReadingItem,
  type ReadingList,
} from './reading';
import { monthAbbr } from './format';

type Filter = 'all' | Kind;
type State = 'loading' | 'empty' | 'error' | 'ready';

const PLURAL: Record<Kind, string> = {
  book: 'books',
  paper: 'papers',
  article: 'articles',
};

/**
 * One cover element per item id, reused across filter changes so images are
 * not re-requested and a fallback cover does not flash again.
 */
let covers = new Map<number, HTMLElement>();

export function initReadingPage(
  body: HTMLElement,
  filter: HTMLElement,
): () => void {
  covers = new Map();
  const abort = new AbortController();
  void load(body, filter, abort.signal);
  return () => abort.abort();
}

async function load(
  body: HTMLElement,
  filter: HTMLElement,
  signal: AbortSignal,
) {
  let list: ReadingList;
  try {
    list = await fetchReading(signal);
  } catch {
    if (!signal.aborted) show(body, 'error');
    return;
  }
  if (!list.items.length) {
    show(body, 'empty');
    return;
  }
  initFilter(body, filter, list, signal);
  render(body, list.items);
  show(body, 'ready');
}

function show(body: HTMLElement, state: State) {
  for (const el of body.querySelectorAll<HTMLElement>('[data-show]')) {
    el.hidden = el.dataset.show !== state;
  }
  body.setAttribute('aria-busy', String(state === 'loading'));
}

function initFilter(
  body: HTMLElement,
  filter: HTMLElement,
  list: ReadingList,
  signal: AbortSignal,
) {
  const pills = [
    ...filter.querySelectorAll<HTMLButtonElement>('button[data-kind]'),
  ];
  const status = body.querySelector<HTMLElement>('[data-reading-status]')!;
  for (const pill of pills) {
    const count = list.counts[pill.dataset.kind as Filter] ?? 0;
    pill.querySelector('[data-count]')!.textContent = String(count);
    pill.hidden = count === 0;
    pill.addEventListener(
      'click',
      () => {
        if (pill.getAttribute('aria-pressed') === 'true') return;
        const kind = pill.dataset.kind as Filter;
        for (const p of pills) {
          p.setAttribute('aria-pressed', String(p === pill));
        }
        render(
          body,
          list.items.filter((i) => kind === 'all' || i.kind === kind),
        );
        status.textContent =
          kind === 'all'
            ? `Showing all ${count} ${count === 1 ? 'item' : 'items'}.`
            : `Showing ${count} ${count === 1 ? kind : PLURAL[kind]}.`;
      },
      { signal },
    );
  }
  filter.dataset.ready = '';
}

function render(body: HTMLElement, items: ReadingItem[]) {
  const by = (s: ReadingItem['status']) => items.filter((i) => i.status === s);
  renderNow(body, by('reading'));
  renderFinished(body, by('finished'));
  renderQueue(body, by('queued'));
}

function section(body: HTMLElement, status: ReadingItem['status']) {
  return body.querySelector<HTMLElement>(`[data-section="${status}"]`)!;
}

function renderNow(body: HTMLElement, items: ReadingItem[]) {
  const el = section(body, 'reading');
  el.hidden = !items.length;
  const [lead, ...others] = items;
  field(el, 'lead').replaceChildren(
    ...(lead ? [nowItem(body, lead, 'lead')] : []),
  );
  const rest = field(el, 'others');
  rest.replaceChildren(...others.map((i) => nowItem(body, i, 'item')));
  rest.hidden = !others.length;
}

function nowItem(body: HTMLElement, item: ReadingItem, tpl: 'lead' | 'item') {
  const el = fromTemplate(body, tpl);
  field(el, 'cover').append(cover(body, item, tpl === 'lead'));
  field(el, 'label').textContent = item.label;
  linkOrText(field<HTMLAnchorElement>(el, 'title'), item.url).textContent =
    item.title;
  setText(field(el, 'by'), byline(item));
  setText(field(el, 'note'), item.note);
  return el;
}

function renderFinished(body: HTMLElement, items: ReadingItem[]) {
  const el = section(body, 'finished');
  el.hidden = !items.length;
  // The API orders finished items by finished_on, newest first.
  const years = new Map<string, ReadingItem[]>();
  for (const item of items) {
    const year = item.finished_on?.slice(0, 4) || 'Undated';
    const group = years.get(year);
    if (group) group.push(item);
    else years.set(year, [item]);
  }
  field(el, 'years').replaceChildren(
    ...[...years].map(([year, rows]) => {
      const group = fromTemplate(body, 'year');
      field(group, 'year').textContent = year;
      field(group, 'rows').replaceChildren(
        ...rows.map((i) => finishedRow(body, i)),
      );
      return group;
    }),
  );
}

function finishedRow(body: HTMLElement, item: ReadingItem) {
  const li = fromTemplate(body, 'row');
  const row = linkOrText(field<HTMLAnchorElement>(li, 'row'), item.url);
  if (!item.url) row.classList.remove('row-link');
  const month = item.finished_on
    ? monthAbbr(new Date(`${item.finished_on}T00:00:00Z`))
    : '';
  setText(field(li, 'month'), month);
  field(li, 'title').textContent = item.title;
  setText(field(li, 'by'), byline(item));
  setText(field(li, 'note'), item.note);
  field(li, 'type').textContent = KIND_NAME[item.kind];
  return li;
}

function renderQueue(body: HTMLElement, items: ReadingItem[]) {
  const el = section(body, 'queued');
  el.hidden = !items.length;
  field(el, 'queue').replaceChildren(
    ...items.map((item) => {
      const li = fromTemplate(body, 'queued');
      field(li, 'type').textContent = KIND_NAME[item.kind];
      linkOrText(field<HTMLAnchorElement>(li, 'title'), item.url).textContent =
        item.title;
      setText(field(li, 'by'), byline(item));
      return li;
    }),
  );
}

/** The real cover when there is one that loads; otherwise a typographic cover. */
function cover(body: HTMLElement, item: ReadingItem, lead: boolean) {
  let el = covers.get(item.id);
  if (!el) {
    el = item.cover_url
      ? image(body, item, item.cover_url, lead)
      : typographic(body, item);
    covers.set(item.id, el);
  }
  el.classList.toggle('cover--lead', lead);
  return el;
}

function image(
  body: HTMLElement,
  item: ReadingItem,
  url: string,
  lead: boolean,
) {
  const img = fromTemplate<HTMLImageElement>(body, 'cover-img');
  img.dataset.shape = item.kind === 'book' ? 'book' : 'doc';
  if (lead) {
    // Above the fold and the largest image: likely the LCP element.
    img.loading = 'eager';
    img.fetchPriority = 'high';
  }
  const fallback = () => {
    const el = typographic(body, item);
    el.classList.toggle('cover--lead', img.classList.contains('cover--lead'));
    img.replaceWith(el);
    covers.set(item.id, el);
  };
  img.addEventListener('error', fallback, { once: true });
  // Open Library answers a missing cover with a 1×1 image.
  img.addEventListener(
    'load',
    () => {
      if (img.naturalWidth <= 1) fallback();
    },
    { once: true },
  );
  img.src = url;
  return img;
}

/** components/ReadingCover.astro, filled in. */
function typographic(body: HTMLElement, item: ReadingItem) {
  const book = item.kind === 'book';
  const el = fromTemplate(body, book ? 'cover-book' : 'cover-doc');
  setText(field(el, 'top'), coverTop(item));
  field(el, 'name').textContent = book ? item.title : shortTitle(item.title);
  return el;
}

/** Book: the authors. Paper or article: arXiv ID, source, or the site's domain. */
function coverTop(item: ReadingItem): string {
  if (item.kind === 'book') return item.authors;
  if (item.identifier && /^arxiv$/i.test(item.source ?? '')) {
    return `arXiv ${item.identifier}`;
  }
  if (item.source) return item.source;
  if (item.url) {
    try {
      return new URL(item.url).hostname.replace(/^www\./, '');
    } catch {
      // fall through
    }
  }
  return item.identifier ?? '';
}

/** "MACE: Higher order …" -> "MACE". */
function shortTitle(title: string): string {
  return title.split(':')[0].trim() || title;
}
