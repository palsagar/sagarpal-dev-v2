// Profile collections in display order, shared by the home page and the
// /projects/ and /publications/ pages. getCollection() does not keep file
// order, so sort explicitly.
import { getCollection } from 'astro:content';

/** Projects by their `order` field. */
export async function getProjects() {
  return (await getCollection('projects')).sort(
    (a, b) => a.data.order - b.data.order,
  );
}

/** Newest first; within a year, featured papers first, then by id. */
export async function getPapers() {
  return (await getCollection('publications')).sort(
    (a, b) =>
      b.data.year - a.data.year ||
      Number(b.data.featured) - Number(a.data.featured) ||
      a.id.localeCompare(b.id),
  );
}
