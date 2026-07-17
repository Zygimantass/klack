import { defineConfig } from 'vocs/config'

export default defineConfig({
  srcDir: 'site/src',
  title: 'Klack',
  titleTemplate: (path) => path === '/' ? '%s' : '%s · Klack',
  description: 'Make Slack yours with focused plugins, complete themes, real tabs, and a calmer interface.',
  baseUrl: 'https://www.klack.sh',
  renderStrategy: 'full-static',
  colorScheme: 'dark',
  accentColor: '#deded7',
  iconUrl: '/icon.svg',
  logoUrl: '/logo.svg',
  topNav: [
    { text: 'Home', link: '/' },
    { text: 'Docs', link: '/docs', match: '/docs' },
    { text: 'Plugins', link: 'https://github.com/zygimantass/klack/tree/main/plugins', external: true },
  ],
  sidebar: {
    '/docs': [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/docs' },
          { text: 'Installation', link: '/docs/installation' },
          { text: 'Quick start', link: '/docs/quick-start' },
          { text: 'How it works', link: '/docs/how-it-works' },
        ],
      },
      {
        text: 'Plugins',
        items: [
          { text: 'Your first plugin', link: '/docs/your-first-plugin' },
          { text: 'UI contributions', link: '/docs/ui-contributions' },
          { text: 'Hot reload', link: '/docs/hot-reload' },
          { text: 'DevTools', link: '/docs/devtools' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'CLI', link: '/docs/cli' },
          { text: 'Plugin API', link: '/docs/plugin-api' },
          { text: 'Security', link: '/docs/security' },
          { text: 'Troubleshooting', link: '/docs/troubleshooting' },
        ],
      },
    ],
  },
  socials: [
    { icon: 'github', link: 'https://github.com/zygimantass/klack' },
  ],
  editLink: {
    link: 'https://github.com/zygimantass/klack/edit/main/site/src/pages/:path',
    text: 'Edit this page on GitHub',
  },
  codeHighlight: {
    themes: {
      light: 'github-dark-dimmed',
      dark: 'github-dark-dimmed',
    },
  },
  head: {
    meta: {
      themeColor: '#0a0a0a',
      twitterCard: 'summary_large_image',
    },
    script: [
      {
        key: 'homepage-refresh-scroll',
        textContent: `if (location.pathname === '/' && location.hash && performance.getEntriesByType('navigation')[0]?.type === 'reload') history.replaceState(history.state, '', location.pathname + location.search)`,
      },
    ],
  },
})
