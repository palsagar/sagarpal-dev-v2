// Blog Markdown pipeline helpers (REDESIGN_PLAN.md Phase 4), used by astro.config.mjs.
//
// remarkPostMeta adds three things to each post's remarkPluginFrontmatter:
//   - plainText: the body as plain text, without code, math, imports or JSX
//     expressions (content-manifest.json `text`, API.md §3);
//   - readingMinutes: from plainText at 230 words per minute;
// and it numbers <Sidenote> (from 1) and captioned <Figure>/<LiveField> (from
// 1, or from 2 when the post's hero image has a caption, which is Figure 1)
// by adding an `n` attribute in document order.
//
// shikiFilename turns a code fence's `title="step.wgsl"` meta into a caption.
import type { ElementContent } from 'hast';
import type { ShikiTransformer } from 'shiki';

interface Node {
  type: string;
  name?: string | null;
  value?: unknown;
  children?: Node[];
  attributes?: { type: string; name?: string; value?: unknown }[];
}

interface AstroVFile {
  data: { astro?: { frontmatter?: Record<string, unknown> } };
}

const WORDS_PER_MINUTE = 230;

/** Nodes whose content is not prose. */
const SKIP = new Set([
  'code',
  'math',
  'inlineMath',
  'html',
  'yaml',
  'toml',
  'mdxjsEsm',
  'mdxFlowExpression',
  'mdxTextExpression',
]);

/** Children of these are joined with a line break, not run together. */
const BLOCK = new Set([
  'root',
  'paragraph',
  'heading',
  'blockquote',
  'list',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'mdxJsxFlowElement',
]);

/** String props that hold prose (figure captions, callout titles). */
const TEXT_PROPS = new Set(['caption', 'title']);

function toText(node: Node): string {
  if (SKIP.has(node.type)) return '';
  if (node.type === 'text' || node.type === 'inlineCode') {
    return String(node.value ?? '');
  }
  const props = (node.attributes ?? [])
    .filter((a) => a.name && TEXT_PROPS.has(a.name))
    .map((a) => (typeof a.value === 'string' ? a.value : ''));
  const parts = [...props, ...(node.children ?? []).map(toText)];
  if (BLOCK.has(node.type)) return parts.join('\n');
  if (node.type === 'mdxJsxTextElement') return ` ${parts.join(' ')} `;
  return parts.join('');
}

function walk(node: Node, visit: (n: Node) => void) {
  visit(node);
  node.children?.forEach((c) => walk(c, visit));
}

export function remarkPostMeta() {
  return (tree: Node, file: AstroVFile) => {
    const frontmatter = (file.data.astro ??= {}).frontmatter ?? {};
    file.data.astro.frontmatter = frontmatter;

    const plainText = toText(tree).replace(/\s+/g, ' ').trim();
    const words = plainText ? plainText.split(' ').length : 0;
    frontmatter.plainText = plainText;
    frontmatter.readingMinutes = Math.max(
      1,
      Math.round(words / WORDS_PER_MINUTE),
    );

    const hero = frontmatter.hero as { caption?: string } | undefined;
    let figure = hero?.caption ? 1 : 0;
    let note = 0;
    walk(tree, (n) => {
      if (!n.type.startsWith('mdxJsx')) return;
      // Figures print "Figure n." only with a caption, so only those count.
      const captioned =
        (n.attributes ?? []).some((a) => a.name === 'caption') ||
        (n.name === 'Figure' && !!n.children?.length);
      const count =
        n.name === 'Sidenote'
          ? ++note
          : (n.name === 'Figure' || n.name === 'LiveField') && captioned
            ? ++figure
            : 0;
      if (count) {
        (n.attributes ??= []).push({
          type: 'mdxJsxAttribute',
          name: 'n',
          value: String(count),
        });
      }
    });
  };
}

/** Shiki transformer: ```lang title="file.ext" → <figure> with a caption. */
export const shikiFilename: ShikiTransformer = {
  name: 'filename-caption',
  root(root) {
    const raw = (this.options.meta as { __raw?: string } | undefined)?.__raw;
    const title = raw?.match(/title="([^"]+)"/)?.[1];
    if (!title) return;
    root.children = [
      {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['code-figure'] },
        children: [
          {
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [{ type: 'text', value: title }],
          },
          ...(root.children as ElementContent[]),
        ],
      },
    ];
  },
};
