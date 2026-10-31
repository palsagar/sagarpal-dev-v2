// Gray–Scott presets and field colormaps (DESIGN.md §2 "Field colormaps", §5).
// Keep the colormaps in sync with docs/redesign/scripts/make_assets.py.

export const PRESETS = [
  { id: 'coral', label: 'Coral', F: 0.0545, k: 0.062 },
  { id: 'mitosis', label: 'Mitosis', F: 0.0367, k: 0.0649 },
  { id: 'mazes', label: 'Mazes', F: 0.029, k: 0.057 },
  { id: 'loops', label: 'Spots & loops', F: 0.018, k: 0.051 },
] as const;

export type Preset = (typeof PRESETS)[number];

/** Readout text: four decimals, as in the mockup ("F = 0.0545"). */
export const fmt = (x: number) => x.toFixed(4);

/** Colour stops over normalised v (0–1). */
export const FIELD_COLORMAPS = {
  night: [
    [0.0, '#0A0E16'],
    [0.3, '#0C131E'],
    [0.42, '#11414D'],
    [0.57, '#2C9AA6'],
    [0.68, '#6FC0B6'],
    [0.8, '#E39A45'],
    [0.92, '#F7CC88'],
    [1.0, '#FFF4DE'],
  ],
  day: [
    [0.0, '#F3F4F6'],
    [0.4, '#E2EBEE'],
    [0.56, '#93C3CA'],
    [0.7, '#23707C'],
    [0.84, '#12404C'],
    [1.0, '#C9822F'],
  ],
} as const satisfies Record<string, readonly (readonly [number, string])[]>;

export type FieldTheme = keyof typeof FIELD_COLORMAPS;
