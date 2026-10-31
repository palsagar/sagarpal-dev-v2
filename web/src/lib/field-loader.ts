// Decides when a Gray–Scott field starts. Kept apart from the engine so the
// page loads only this small module up front; the engine is imported on start.

/**
 * Decides when a field starts (DESIGN.md §5): once it is on screen, its
 * visible poster has decoded and the browser is idle, so the poster stays the
 * LCP element. Under reduced motion or Save-Data it shows the Play button and
 * waits for a click. Without WebGL2 the root is marked unsupported.
 * Returns a function that stops watching.
 */
export function watchField(
  root: HTMLElement,
  play: HTMLButtonElement,
  start: (fromPlay: boolean) => void,
): () => void {
  if (!('WebGL2RenderingContext' in window)) {
    root.dataset.state = 'unsupported';
    return () => {};
  }
  const saveData = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection?.saveData;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || saveData) {
    root.dataset.state = 'play';
    play.hidden = false;
    const onPlay = () => {
      play.hidden = true;
      start(true);
    };
    play.addEventListener('click', onPlay, { once: true });
    return () => play.removeEventListener('click', onPlay);
  }
  let cancelled = false;
  const io = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return;
    io.disconnect();
    // Lazy images do not hold back the load event: wait for the visible
    // poster itself, so the warm-up never competes with the LCP image.
    const poster = [...root.querySelectorAll('img')].find(
      (img) => img.offsetParent !== null,
    );
    const decoded = poster ? poster.decode().catch(() => {}) : null;
    void Promise.resolve(decoded).then(() =>
      whenIdle(() => {
        if (!cancelled) start(false);
      }),
    );
  });
  io.observe(root);
  return () => {
    cancelled = true;
    io.disconnect();
  };
}

function whenIdle(fn: () => void) {
  const idle = () =>
    'requestIdleCallback' in window
      ? requestIdleCallback(fn, { timeout: 2000 })
      : setTimeout(fn, 200);
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}
