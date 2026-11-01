// Home Reading band (components/ReadingBand.astro): fills the list with up to
// three "reading now" items and shows the band. With no items, or when the
// API fails, the band stays hidden. data-state records the outcome (shown,
// empty, error) for tests. Returns a clean-up function for the client router.

import {
  KIND_NAME,
  byline,
  fetchReading,
  field,
  fromTemplate,
  setText,
  type ReadingItem,
} from './reading';

const MAX_ITEMS = 3;

export function initReadingBand(band: HTMLElement): () => void {
  const abort = new AbortController();
  void load(band, abort.signal);
  return () => abort.abort();
}

async function load(band: HTMLElement, signal: AbortSignal) {
  let items: ReadingItem[];
  try {
    items = (await fetchReading(signal, 'reading')).items.slice(0, MAX_ITEMS);
  } catch {
    // No API, or it failed: the home page simply has no band.
    if (!signal.aborted) band.dataset.state = 'error';
    return;
  }
  if (!items.length) {
    band.dataset.state = 'empty';
    return;
  }
  band
    .querySelector('[data-list]')!
    .replaceChildren(...items.map((item) => row(band, item)));
  band.hidden = false;
  band.dataset.state = 'shown';
}

function row(band: HTMLElement, item: ReadingItem) {
  const li = fromTemplate(band, 'row');
  field(li, 'kind').textContent = KIND_NAME[item.kind];
  field(li, 'title').textContent = item.title;
  setText(field(li, 'by'), byline(item));
  setText(field(li, 'note'), item.note);
  return li;
}
