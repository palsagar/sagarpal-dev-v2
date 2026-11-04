// Creates a draft post: make post title="My title" (docs/WRITING.md).
import { writeFileSync } from 'node:fs';

const title = process.argv[2]?.trim();
if (!title) {
  console.error('Usage: make post title="My title"');
  process.exit(1);
}

const slug = title
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '') // accents
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
if (!slug) {
  console.error(`The title "${title}" gives no ASCII letters for the URL.`);
  process.exit(1);
}

const path = `src/content/blog/${slug}.md`;
const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
const post = `---
title: '${title.replaceAll("'", "''")}'
dek: 'TODO: one sentence that appears under the title.'
date: ${date}
tags: [Notes]
draft: true
---

Write the post here.
`;

try {
  writeFileSync(path, post, { flag: 'wx' }); // never overwrite a post
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error(`${path} already exists.`);
  process.exit(1);
}

console.log(`Created web/${path}
Preview:  make dev-web, then http://localhost:4321/blog/${slug}/
Images:   web/src/assets/blog/${slug}/, written as
          ![Description](../../assets/blog/${slug}/image.jpg)`);
