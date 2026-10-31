// <LiveField>: wires a Gray–Scott field to its F and k sliders. Loaded on
// demand by LiveField.astro; the loop, brush and pausing live in field-runner.ts.
import { fmt } from './field-presets';
import { runField } from './field-runner';

export async function mountLiveField(
  root: HTMLElement,
  { focusControls = false } = {},
): Promise<() => void> {
  const figure = root.closest('figure')!;
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const controls = figure.querySelector<HTMLElement>('.live-field__controls')!;
  const input = (p: string) =>
    figure.querySelector<HTMLInputElement>(`[data-param="${p}"]`)!;
  const readout = (p: string) =>
    figure.querySelector<HTMLOutputElement>(`[data-readout="${p}"]`)!;
  const [inF, inK] = [input('F'), input('k')];

  const phone = matchMedia('(max-width: 719.98px)').matches;
  const field = await runField(root, canvas, {
    shortSide: phone ? 192 : 256,
    substeps: phone ? 8 : 12,
    F: inF.valueAsNumber,
    k: inK.valueAsNumber,
    onReady() {
      controls.hidden = false;
      // After "Play" (now hidden), keep keyboard users in the figure.
      if (focusControls) inF.focus();
    },
  });
  if (!field) return () => {};

  const onInput = () => {
    readout('F').textContent = fmt(inF.valueAsNumber);
    readout('k').textContent = fmt(inK.valueAsNumber);
    field.engine.setParams(inF.valueAsNumber, inK.valueAsNumber);
  };
  inF.addEventListener('input', onInput);
  inK.addEventListener('input', onInput);

  return () => {
    inF.removeEventListener('input', onInput);
    inK.removeEventListener('input', onInput);
    field.destroy();
  };
}
