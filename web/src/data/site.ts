// Site-wide facts used by the layout, nav, footer and JSON-LD.
// Links carried over from the Jekyll site's _config.yml and _data/contact.yml (on `main`).

export const site = {
  name: 'Sagar Pal',
  url: 'https://sagar-pal.dev',
  city: 'Paris',
  email: 'sagar2204pal@gmail.com',
  cv: '/assets/pdfs/Sagar_Pal_CV_2025.pdf',
  description:
    'Sagar Pal works at the intersection of scientific computing, AI for science and high-performance ML systems. Writing, reading notes, simulations and papers.',
  social: {
    github: 'https://github.com/palsagar',
    linkedin: 'https://linkedin.com/in/spal220493',
    scholar: 'https://scholar.google.com/citations?user=PtMicc0AAAAJ',
  },
} as const;

/** Primary navigation (DESIGN.md §10: Writing · Reading · Projects · Papers · CV). */
export const primaryNav = [
  { label: 'Writing', href: '/blog/' },
  { label: 'Reading', href: '/what-im-reading/' },
  { label: 'Projects', href: '/#work' },
  { label: 'Papers', href: '/#papers' },
] as const;

/** Footer "Elsewhere" links. */
export const elsewhere = [
  { label: 'GitHub', href: site.social.github },
  { label: 'LinkedIn', href: site.social.linkedin },
  { label: 'Google Scholar', href: site.social.scholar },
  { label: 'Email', href: `mailto:${site.email}` },
  { label: 'RSS', href: '/feed.xml' },
] as const;

/** JSON-LD Person, carried over from the Jekyll index.html. */
export const personJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: site.name,
  url: site.url,
  image: `${site.url}/assets/img/prof_pic.jpg`,
  jobTitle: 'Senior ML & HPC Engineer',
  worksFor: {
    '@type': 'Organization',
    name: 'Entalpic',
    url: 'https://www.entalpic.ai/',
  },
  alumniOf: [
    { '@type': 'CollegeOrUniversity', name: 'Sorbonne Université' },
    { '@type': 'CollegeOrUniversity', name: 'École Polytechnique' },
    { '@type': 'CollegeOrUniversity', name: 'Indian Institute of Technology' },
  ],
  knowsAbout: [
    'Computational Physics',
    'Scientific Machine Learning',
    'High-Performance Computing',
    'Numerical Methods',
    'Materials Discovery',
    'Fluid Dynamics',
  ],
  sameAs: [site.social.github, site.social.linkedin, site.social.scholar],
} as const;
