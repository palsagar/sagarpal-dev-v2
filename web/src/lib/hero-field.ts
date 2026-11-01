// HeroField: wires the Gray–Scott field to the hero (DESIGN.md §5): preset
// buttons and the F/k readout. Loaded on demand by Hero.astro; the loop,
// brush and pausing live in field-runner.ts.
import { PRESETS, fmt } from './field-presets';
import { runField } from './field-runner';

export async function mountHeroField(
  root: HTMLElement,
  { focusControls = false } = {},
): Promise<() => void> {
  const canvas = root.querySelector<HTMLCanvasElement>('.hero__canvas')!;
  const controls = root.querySelector<HTMLElement>('.hero__controls')!;
  const buttons = [
    ...root.querySelectorAll<HTMLButtonElement>('[data-preset]'),
  ];
  const readF = root.querySelector<HTMLElement>('[data-readout-f]')!;
  const readK = root.querySelector<HTMLElement>('[data-readout-k]')!;

  const presetFor = (id: string | undefined) =>
    PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  const initial = presetFor(
    buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset
      .preset,
  );

  const phone = matchMedia('(max-width: 719.98px)').matches;
  const field = await runField(root, canvas, {
    shortSide: phone ? 256 : 512,
    substeps: phone ? 8 : 12,
    F: initial.F,
    k: initial.k,
    onReady() {
      controls.hidden = false;
      if (focusControls) {
        buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.focus();
      }
    },
  });
  if (!field) return () => {};

  const choose = (id: string | undefined) => {
    const preset = presetFor(id);
    for (const b of buttons) {
      b.setAttribute('aria-pressed', String(b.dataset.preset === preset.id));
    }
    readF.textContent = fmt(preset.F);
    readK.textContent = fmt(preset.k);
    field.engine.setParams(preset.F, preset.k);
  };
  const onPreset = (event: Event) =>
    choose((event.currentTarget as HTMLButtonElement).dataset.preset);
  buttons.forEach((b) => b.addEventListener('click', onPreset));

  return () => {
    buttons.forEach((b) => b.removeEventListener('click', onPreset));
    field.destroy();
  };
}
