// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/site.config';
import { obsidianLinks } from './src/plugins/obsidian-links';
import { katexBlock, katexInline } from './src/plugins/katex';

export default defineConfig({
  site: SITE.url,
  trailingSlash: 'always',
  integrations: [sitemap()],
  markdown: {
    processor: satteri({
      features: { wikilinks: true, math: true },
      mdastPlugins: [obsidianLinks, katexBlock],
      hastPlugins: [katexInline],
    }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
