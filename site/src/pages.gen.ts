// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages } from 'waku/router'

// prettier-ignore
type Page =
  | { path: '/docs/cli'; render: 'static' }
  | { path: '/docs/devtools'; render: 'static' }
  | { path: '/docs/hot-reload'; render: 'static' }
  | { path: '/docs/how-it-works'; render: 'static' }
  | { path: '/docs'; render: 'static' }
  | { path: '/docs/installation'; render: 'static' }
  | { path: '/docs/plugin-api'; render: 'static' }
  | { path: '/docs/quick-start'; render: 'static' }
  | { path: '/docs/security'; render: 'static' }
  | { path: '/docs/troubleshooting'; render: 'static' }
  | { path: '/docs/ui-contributions'; render: 'static' }
  | { path: '/docs/your-first-plugin'; render: 'static' }
  | { path: '/'; render: 'static' }

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>
  }
  interface CreatePagesConfig {
    pages: Page
  }
}
