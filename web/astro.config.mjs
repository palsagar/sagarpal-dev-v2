// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

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

export default defineConfig({
  site: 'https://sagar-pal.dev',
  // Keeps the old Chirpy URLs (/projects/, /publications/) unchanged.
  trailingSlash: 'always',
  output: 'static',
  integrations: [mdx(), react(), sitemap()],
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
