// Blog index search and topic filter (DESIGN.md §7.2, REDESIGN_PLAN.md
// Phase 4). Title and dek match instantly in the page. Body text comes from
// /api/search (Phase 5), debounced 200 ms; without the API, title and dek
// matching still works. Returns a clean-up function for the client router.

const DEBOUNCE_MS = 200;

export function initBlogFilter(tools: HTMLElement): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  const form = tools.querySelector<HTMLFormElement>('[data-blog-search]')!;
  const input = form.querySelector<HTMLInputElement>('input')!;
  const pills = [...tools.querySelectorAll<HTMLButtonElement>('[data-topic]')];
  const items = [...document.querySelectorAll<HTMLElement>('[data-post-item]')];
  const groups = [
    ...document.querySelectorAll<HTMLElement>('[data-year-group]'),
  ];
  const none = document.querySelector<HTMLElement>('[data-blog-none]')!;
  const noneText = none.querySelector<HTMLElement>('[data-blog-none-text]')!;
  const reset = none.querySelector<HTMLButtonElement>('[data-blog-reset]')!;

  let topic = 'All';
  /** Slugs whose body matched the current query, from the API. */
  let bodyMatches = new Set<string>();
  let timer = 0;
  let request = 0;

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const el of items) {
      const inTopic =
        topic === 'All' || el.dataset.tags!.split('|').includes(topic);
      const matches =
        !q || el.dataset.text!.includes(q) || bodyMatches.has(el.dataset.slug!);
      el.hidden = !(inTopic && matches);
      if (!el.hidden) shown++;
    }
    for (const g of groups) {
      g.hidden = !g.querySelector('[data-post-item]:not([hidden])');
    }
    none.hidden = shown > 0;
    noneText.textContent = shown
      ? ''
      : `Nothing matches “${input.value.trim()}” in that topic.`;
  };

  const searchBody = async (q: string) => {
    const id = ++request;
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=50`,
        { headers: { Accept: 'application/json' }, signal },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { results?: { slug?: string }[] };
      if (id !== request) return; // a newer query is on its way
      bodyMatches = new Set(
        (body.results ?? []).map((r) => r.slug).filter((s): s is string => !!s),
      );
      apply();
    } catch {
      // No API (yet): title and dek matching only.
    }
  };

  input.addEventListener(
    'input',
    () => {
      bodyMatches = new Set();
      request++;
      apply();
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length >= 2) {
        timer = window.setTimeout(() => void searchBody(q), DEBOUNCE_MS);
      }
    },
    { signal },
  );
  form.addEventListener('submit', (e) => e.preventDefault(), { signal });

  const choose = (next: string) => {
    topic = next;
    for (const p of pills) {
      p.setAttribute('aria-pressed', String(p.dataset.topic === topic));
    }
    apply();
  };
  for (const p of pills) {
    p.addEventListener('click', () => choose(p.dataset.topic!), { signal });
  }
  reset.addEventListener(
    'click',
    () => {
      input.value = '';
      bodyMatches = new Set();
      request++;
      choose('All');
      input.focus();
    },
    { signal },
  );

  tools.hidden = false;
  apply();

  return () => {
    abort.abort();
    clearTimeout(timer);
  };
}
