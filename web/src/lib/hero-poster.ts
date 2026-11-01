// Hero poster images (DESIGN.md §5 "Fallbacks", §11). Both theme posters are in
// the page and CSS hides one, so both <img> are lazy: a hidden lazy image is never
// fetched. The home page head preloads the active theme's AVIF with high priority,
// which keeps it the fast LCP element. Hero.astro and the preload share these URLs.
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';
import day from '../assets/field-hero-day.jpg';
import night from '../assets/field-hero-night.jpg';

const WIDTHS = [480, 800, 1100];

/** Two columns from ~1160px (54% of the row, capped by the 1440px container). */
export const POSTER_SIZES =
  '(max-width: 1159.98px) 100vw, (max-width: 1440px) 54vw, 780px';

async function variants(src: ImageMetadata) {
  const [avif, webp] = await Promise.all(
    (['avif', 'webp'] as const).map((format) =>
      getImage({ src, widths: WIDTHS, format }),
    ),
  );
  return {
    avif: avif.srcSet.attribute,
    webp: webp.srcSet.attribute,
    src: webp.src,
    width: src.width,
    height: src.height,
  };
}

export async function heroPosters() {
  const [n, d] = await Promise.all([variants(night), variants(day)]);
  return { night: n, day: d };
}
