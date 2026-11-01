// Runs a Gray–Scott field on a canvas (DESIGN.md §5): warm-up, animation loop,
// pointer/touch seeding, theme LUT swaps, pausing off-screen or in a hidden
// tab, and resizing. Shared by the home hero (hero-field.ts) and the in-post
// <LiveField> (live-field.ts). The root's data-state is one of
// warming → running ⇄ paused, or unsupported (the poster stays).
import type { FieldTheme } from './field-presets';
import { createEngine, type Engine, type Grid } from './gray-scott';

declare global {
  interface Window {
    /** Set only by tests (headless Chromium renders WebGL in software, which
     *  the field otherwise refuses). Also enables the freeze/step hooks. */
    __heroFieldTest?: { shortSide: number };
  }
}

const WARMUP_STEPS = 2000;
const WARMUP_PER_FRAME = 100;
const DPR_CAP = 1.5;

export interface FieldOptions {
  /** Grid cells on the canvas's short side. */
  shortSide: number;
  substeps: number;
  F: number;
  k: number;
  /** Called once, when the warm-up has finished and the first frame shows. */
  onReady?: () => void;
}

export interface RunningField {
  engine: Engine;
  destroy: () => void;
}

/** Returns null (and marks the root unsupported) without usable WebGL2. */
export async function runField(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  options: FieldOptions,
): Promise<RunningField | null> {
  const testing = window.__heroFieldTest;
  const shortSide = testing?.shortSide ?? options.shortSide;
  const { substeps } = options;

  const box = () => canvas.getBoundingClientRect();
  const gridFor = (r: DOMRect): Grid => {
    const s = shortSide / Math.min(r.width, r.height);
    return {
      w: Math.max(1, Math.round(r.width * s)),
      h: Math.max(1, Math.round(r.height * s)),
    };
  };
  const sizeCanvas = (r: DOMRect) => {
    const dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  };

  let rect = box();
  sizeCanvas(rect);
  const engine = await createEngine(canvas, gridFor(rect), {
    allowSoftware: !!testing,
  });
  // The page may have been swapped by the client router while compiling.
  if (engine && !root.isConnected) {
    engine.destroy();
    return null;
  }
  if (!engine) {
    root.dataset.state = 'unsupported';
    return null;
  }
  engine.setParams(options.F, options.k);

  // ---------- Theme ----------
  const theme = (): FieldTheme =>
    document.documentElement.dataset.theme === 'day' ? 'day' : 'night';
  const applyTheme = () => {
    const t = theme();
    engine.setTheme(t);
    root.dataset.themeLut = t;
    if (warmed) engine.render();
  };
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // ---------- Brush (pointer and touch) ----------
  // Mouse and pen seed at once. Touch seeds on a horizontal-dominant drag or
  // after a 150ms press; vertical drags scroll the page (touch-action: pan-y).
  let pointer: {
    id: number;
    x0: number;
    y0: number;
    seeding: boolean;
    timer: number;
  } | null = null;
  let last: [number, number] | null = null;
  let current: [number, number] | null = null;

  const toGrid = (e: PointerEvent): [number, number] => {
    const g = engine.grid;
    return [
      ((e.clientX - rect.left) / rect.width) * g.w,
      (1 - (e.clientY - rect.top) / rect.height) * g.h,
    ];
  };
  const startSeeding = (e: PointerEvent) => {
    if (!pointer) return;
    pointer.seeding = true;
    current = toGrid(e);
    last ??= current;
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || pointer) return;
    rect = box();
    pointer = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      seeding: false,
      timer: 0,
    };
    if (e.pointerType === 'touch') {
      pointer.timer = window.setTimeout(() => startSeeding(e), 150);
    } else {
      canvas.setPointerCapture(e.pointerId);
      startSeeding(e);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (!pointer.seeding) {
      const dx = Math.abs(e.clientX - pointer.x0);
      const dy = Math.abs(e.clientY - pointer.y0);
      if (dx > 8 && dx > dy) {
        clearTimeout(pointer.timer);
        startSeeding(e);
      }
      return;
    }
    current = toGrid(e);
  };
  const onUp = (e: PointerEvent) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    clearTimeout(pointer.timer);
    pointer = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  /** Hand the stroke since the last frame to the engine. */
  const queueBrush = () => {
    if (!current) return;
    const g = engine.grid;
    const radius = Math.max(2, 0.015 * Math.min(g.w, g.h));
    const from = last ?? current;
    engine.brush(from[0], from[1], current[0], current[1], radius);
    last = current;
    if (!pointer) current = last = null;
  };

  // ---------- Loop ----------
  let warmed = false;
  let warmSteps = 0;
  let onScreen = true;
  let frozen = false; // test hook, see below
  let ready = false;
  let raf = 0;

  const setState = () => {
    root.dataset.state = !warmed
      ? 'warming'
      : onScreen && !document.hidden
        ? 'running'
        : 'paused';
  };
  const frame = () => {
    raf = 0;
    if (!onScreen || document.hidden) return setState();
    if (!warmed) {
      engine.step(Math.min(WARMUP_PER_FRAME, WARMUP_STEPS - warmSteps));
      warmSteps += WARMUP_PER_FRAME;
      if (warmSteps >= WARMUP_STEPS) {
        warmed = true;
        engine.render();
        root.dataset.ready = '';
        if (!ready) {
          ready = true;
          options.onReady?.();
        }
      }
    } else if (!frozen) {
      queueBrush();
      engine.step(substeps);
      engine.render();
    }
    setState();
    raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    setState();
    if (!raf && onScreen && !document.hidden)
      raf = requestAnimationFrame(frame);
  };

  const io = new IntersectionObserver(([entry]) => {
    onScreen = !!entry?.isIntersecting;
    wake();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', wake);

  // Resizes stretch the field; a big change of shape re-seeds it.
  const ro = new ResizeObserver(() => {
    const next = box();
    if (!next.width || !next.height) return;
    const ratio = next.width / next.height / (rect.width / rect.height);
    rect = next;
    sizeCanvas(next);
    if (Math.abs(ratio - 1) > 0.15) {
      engine.reset(gridFor(next));
      warmed = false;
      warmSteps = 0;
      delete root.dataset.ready;
    } else if (warmed) {
      engine.render();
    }
    wake();
  });
  ro.observe(canvas);

  // Test hooks, registered only under tests: freeze the loop, then apply the
  // pending brush stroke with a single step.
  const onFreeze = () => (frozen = true);
  const onTestStep = () => {
    queueBrush();
    engine.step(1);
    engine.render();
  };
  if (testing) {
    document.addEventListener('hero-field:test-freeze', onFreeze);
    document.addEventListener('hero-field:test-step', onTestStep);
  }

  applyTheme();
  wake();

  return {
    engine,
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', wake);
      document.removeEventListener('hero-field:test-freeze', onFreeze);
      document.removeEventListener('hero-field:test-step', onTestStep);
      if (pointer) clearTimeout(pointer.timer);
      engine.destroy();
    },
  };
}
