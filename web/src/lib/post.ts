// Post page behaviour (DESIGN.md §6, §7.3), loaded by layouts/Post.astro.
// Everything here is an enhancement: the post reads fine without JS.
// Returns a clean-up function for the client router.

export function initPost(article: HTMLElement): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  const timers: number[] = [];

  initToc(article, signal);
  initSidenotes(article, signal);
  initScrollables(article, signal);
  initCopyLink(article, signal, timers);
  void initStats(article, signal, timers);

  return () => {
    abort.abort();
    timers.forEach((t) => clearTimeout(t));
  };
}

/** Marks the section being read in both tables of contents. */
function initToc(article: HTMLElement, signal: AbortSignal) {
  const links = [
    ...article.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'),
  ];
  if (!links.length) return;
  const idOf = (a: HTMLAnchorElement) => decodeURIComponent(a.hash.slice(1));
  const ids = [...new Set(links.map(idOf))];
  const headings = ids
    .map((id) => document.getElementById(id))
    .filter((h): h is HTMLElement => !!h);

  let raf = 0;
  const update = () => {
    raf = 0;
    let current = headings[0];
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= 120) current = h;
    }
    for (const a of links) {
      if (idOf(a) === current?.id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };
  const schedule = () => (raf ||= requestAnimationFrame(update));
  addEventListener('scroll', schedule, { passive: true, signal });
  addEventListener('resize', schedule, { passive: true, signal });
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));
  update();
}

/** Narrow columns: each note collapses behind its numbered button. */
function initSidenotes(article: HTMLElement, signal: AbortSignal) {
  const prose = article.querySelector<HTMLElement>('.prose');
  const buttons = [
    ...article.querySelectorAll<HTMLButtonElement>('.sn-ref__btn'),
  ];
  if (!prose || !buttons.length) return;
  prose.dataset.sidenotes = '';
  for (const button of buttons) {
    const note = document.getElementById(button.getAttribute('aria-controls')!);
    if (!note) continue;
    button.hidden = false;
    button.addEventListener(
      'click',
      () => {
        const open = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute(
          'aria-label',
          `${open ? 'Hide' : 'Show'} note ${button.textContent}`,
        );
        note.classList.toggle('is-open', open);
      },
      { signal },
    );
  }
}

/** Display math that scrolls sideways must be reachable by keyboard. Shiki
 *  already gives every code block tabindex="0". */
function initScrollables(article: HTMLElement, signal: AbortSignal) {
  const boxes = [...article.querySelectorAll<HTMLElement>('.katex-display')];
  if (!boxes.length) return;
  const update = () => {
    for (const box of boxes) {
      if (box.scrollWidth > box.clientWidth) box.tabIndex = 0;
      else box.removeAttribute('tabindex');
    }
  };
  addEventListener('resize', update, { passive: true, signal });
  update();
}

function initCopyLink(
  article: HTMLElement,
  signal: AbortSignal,
  timers: number[],
) {
  const button = article.querySelector<HTMLButtonElement>('[data-copy-link]');
  const status = article.querySelector<HTMLElement>('[data-copy-status]');
  if (!button || !status || !navigator.clipboard) return;
  button.hidden = false;
  button.addEventListener(
    'click',
    async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copyLink!);
        status.textContent = 'Link copied';
        button.textContent = 'Link copied';
      } catch {
        status.textContent = 'Could not copy the link';
        return;
      }
      timers.push(
        window.setTimeout(() => {
          button.textContent = 'Copy link';
          status.textContent = '';
        }, 2500),
      );
    },
    { signal },
  );
}

interface Stats {
  views: number;
  useful: number;
  reacted: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Useful reaction and read count (API.md §4). Both stay hidden unless
 * /api/posts/{slug}/stats answers. A view is counted after 10 s on the
 * visible page or once half the post has been scrolled.
 */
async function initStats(
  article: HTMLElement,
  signal: AbortSignal,
  timers: number[],
) {
  const slug = article.dataset.slug!;
  const base = `/api/posts/${encodeURIComponent(slug)}`;
  const useful = article.querySelector<HTMLButtonElement>('[data-useful]')!;
  const count = article.querySelector<HTMLElement>('[data-useful-count]')!;
  const reads = article.querySelector<HTMLElement>('[data-reads]')!;
  const hintKey = `useful:${slug}`;

  let stats: Stats;
  try {
    const res = await fetch(`${base}/stats`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return;
    const body = (await res.json()) as Partial<Stats>;
    if (typeof body.views !== 'number' || typeof body.useful !== 'number')
      return;
    stats = { views: body.views, useful: body.useful, reacted: !!body.reacted };
  } catch {
    return; // No API (yet): Useful and the read count stay hidden.
  }

  // "n reads" only from 10 up, so a new post never says "1 read".
  if (stats.views >= 10) {
    reads.textContent = `${stats.views.toLocaleString('en-US')} reads`;
    reads.hidden = false;
  }

  let hint: string | null = null;
  try {
    hint = localStorage.getItem(hintKey);
  } catch {
    // Storage blocked: rely on the server's answer.
  }
  const show = (n: number, reacted: boolean) => {
    count.textContent = n.toLocaleString('en-US');
    useful.setAttribute('aria-pressed', String(reacted));
  };
  show(stats.useful, stats.reacted || hint === today());
  useful.hidden = false;

  useful.addEventListener(
    'click',
    async () => {
      if (useful.getAttribute('aria-pressed') === 'true') return;
      show(stats.useful + 1, true); // optimistic
      try {
        const res = await fetch(`${base}/useful`, { method: 'POST', signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { useful?: number };
        stats.useful = body.useful ?? stats.useful + 1;
        show(stats.useful, true);
        try {
          localStorage.setItem(hintKey, today());
        } catch {
          // ignore
        }
      } catch {
        if (!signal.aborted) show(stats.useful, false);
      }
    },
    { signal },
  );

  // ---------- View ----------
  let counted = false;
  const countView = () => {
    if (counted || signal.aborted) return;
    counted = true;
    void fetch(`${base}/view`, { method: 'POST', keepalive: true }).catch(
      () => {},
    );
  };
  const onScroll = () => {
    const r = article.getBoundingClientRect();
    if (innerHeight - r.top >= r.height / 2) countView();
  };
  addEventListener('scroll', onScroll, { passive: true, signal });
  const afterDelay = () => {
    if (document.hidden) {
      document.addEventListener('visibilitychange', afterDelay, {
        once: true,
        signal,
      });
    } else countView();
  };
  timers.push(window.setTimeout(afterDelay, 10_000));
}
