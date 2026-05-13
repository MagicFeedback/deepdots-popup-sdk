import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const vercelSite =
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined;
const githubPagesSite =
  process.env.GITHUB_PAGES === 'true' && process.env.GITHUB_REPOSITORY_OWNER
    ? `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io`
    : undefined;
const site = process.env.SITE_URL || vercelSite || githubPagesSite;
const base = process.env.BASE_PATH;

export default defineConfig({
  site,
  base,
  integrations: [
    starlight({
      title: 'MagicFeedback SDK',
      description: 'Official documentation for the MagicFeedback browser SDK.',
      logo: {
        light: './src/assets/logo-dark-long.svg',
        dark: './src/assets/logo-light-long.svg',
        replacesTitle: true,
      },
      favicon: '/favicon.ico',
      disable404Route: true,
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        es: {
          label: 'Español',
          lang: 'es',
        },
        da: {
          label: 'Dansk',
          lang: 'da',
        },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/MagicFeedback/magicfeedback-sdk',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
});
