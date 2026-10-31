// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { rehypeHeadingIds, unified } from '@astrojs/markdown-remark';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { createCssVariablesTheme } from 'shiki';
import { remarkPostMeta, shikiFilename } from './src/lib/markdown.ts';

// FastAPI dev server (api/). Only used by `astro dev`; the production build is static.
const API_ORIGIN = 'http://localhost:8000';

/**
 * Astro puts its dev trailing-slash check at the front of the middleware stack.
 * With `trailingSlash: 'always'` it answers 404 for slashless paths such as
 * `/api/health` before Vite's proxy runs. This moves the proxy ahead of it.
 * @returns {import('vite').Plugin}
 */
function proxyBeforeAstro() {
  return {
    name: 'proxy-before-astro',
    apply: 'serve',
    enforce: 'post',
    configureServer(server) {
      return () => {
        const stack = server.middlewares.stack;
        const i = stack.findIndex(
          (layer) =>
            typeof layer.handle === 'function' &&
            layer.handle.name === 'viteProxyMiddleware',
        );
        if (i === -1) {
          throw new Error(
            'proxy-before-astro: Vite proxy middleware not found',
          );
        }
        stack.unshift(...stack.splice(i, 1));
      };
    },
  };
}

/**
 * Serves the design-system styleguide at /styleguide/ during `astro dev` only.
 * It is never part of `astro build`, so it cannot ship or reach the sitemap.
 * @returns {import('astro').AstroIntegration}
 */
function devStyleguide() {
  return {
    name: 'dev-styleguide',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command !== 'dev') return;
        injectRoute({
          pattern: '/styleguide',
          entrypoint: './src/dev/styleguide.astro',
        });
      },
    },
  };
}

export default defineConfig({
  site: 'https://sagar-pal.dev',
  // Keeps the old Chirpy URLs (/projects/, /publications/) unchanged.
  trailingSlash: 'always',
  output: 'static',
  integrations: [mdx(), react(), sitemap(), devStyleguide()],
  markdown: {
    // Blog posts (Phase 4). The unified processor runs remark/rehype plugins;
    // Astro 7's default (Sätteri) does not run them.
    processor: unified({
      remarkPlugins: [remarkMath, remarkPostMeta],
      rehypePlugins: [
        // MathML too, for screen readers (DESIGN.md §9).
        [rehypeKatex, { output: 'htmlAndMathml' }],
        // Each heading links to itself. Astro adds heading ids after user
        // plugins, so run its id pass first.
        rehypeHeadingIds,
        [rehypeAutolinkHeadings, { behavior: 'wrap' }],
      ],
    }),
    shikiConfig: {
      // Token colours are CSS variables mapped to the theme tokens in
      // styles/prose.css, so code follows the theme toggle with no flash.
      theme: createCssVariablesTheme({
        name: 'css-variables',
        variablePrefix: '--shiki-',
        fontStyle: true,
      }),
      transformers: [shikiFilename],
    },
  },
  server: {
    port: 4321,
  },
  vite: {
    server: {
      proxy: {
        '/api': API_ORIGIN,
        '/admin': API_ORIGIN,
        '/feed.xml': API_ORIGIN,
        '/og': API_ORIGIN,
      },
    },
    plugins: [proxyBeforeAstro()],
  },
});
