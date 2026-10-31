// Small display formatters for the profile data.

/** "Mar 2025 - Present" -> "2025 – now"; "Sep 2021 - Feb 2025" -> "2021 – 2025". */
export function yearRange(period: string): string {
  const years = period.match(/\d{4}/g) ?? [];
  const start = years[0] ?? period;
  const end = /present/i.test(period) ? 'now' : (years[1] ?? start);
  return `${start} – ${end}`;
}

/** First year in a period string, for sorting newest first. */
export function startYear(period: string): number {
  return Number(period.match(/\d{4}/)?.[0] ?? 0);
}

/** Pill label for a paper link: arXiv DOIs (10.48550/arXiv.*) read "arXiv". */
export function doiLabel(doi: string): 'arXiv' | 'DOI' {
  return /10\.48550\/arXiv\./i.test(doi) ? 'arXiv' : 'DOI';
}
