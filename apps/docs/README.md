# muxa Documentation

This is the documentation site for muxa, built with [Fumadocs](https://fumadocs.vercel.app/) on Next.js and deployed to Cloudflare Workers. Bun installs and runs it, as in the rest of the repo.

## URLs

- **Production**: <https://docs.den.ai/muxa>
- **Local**: <http://localhost:3000/muxa> (`bun run dev`; the root path `/` returns 404)

## Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Preview production build locally
bun run preview
```

## Deployment

This documentation site is deployed to Cloudflare Workers using [OpenNext](https://opennext.js.org/cloudflare), which adapts Next.js applications for edge runtime environments.

### Configuration

The deployment requires three main configuration files:

1. **`wrangler.jsonc`** - Cloudflare Worker configuration
   - Defines the worker name, entry point, and compatibility settings
   - Configures static assets serving via the `assets` binding
   - Sets up environment-specific variables

2. **`open-next.config.ts`** - OpenNext adapter configuration
   - Specifies the wrapper and converter for Cloudflare edge runtime
   - Configures incremental cache and external modules
   - Handles middleware settings

3. **`next.config.mjs`** - Next.js configuration
   - Sets `basePath` and `assetPrefix` for subpath deployments (e.g., `/muxa`)
   - Configures standalone output mode required by OpenNext
   - Integrates Fumadocs MDX processing

### Dependencies

The following packages are required in `dependencies` (not devDependencies):

```json
{
  "dependencies": {
    "@opennextjs/cloudflare": "^1.6.3",
    "next": "~15.3.0" // Note: Check OpenNext compatibility
  }
}
```

### Build & Deploy Commands

```bash
# Build Next.js application with basePath
bun run build  # Runs: NEXT_PUBLIC_BASE_PATH=/muxa next build

# Preview locally with Cloudflare Workers
bun run preview  # Builds and runs preview server

# Deploy to production
bun run deploy  # Builds and deploys to Cloudflare
```

### Environment Variables

- **`NEXT_PUBLIC_BASE_PATH`** - Set during build for subpath deployments (e.g., `/muxa`). It is compiled into the client bundle, so a Worker var cannot set it.
- **`NODE_ENV`** - `wrangler.jsonc` sets it to `production` only under `env.production`, which applies to `wrangler deploy --env production`. `bun run deploy` and the `deploy-docs` workflow deploy without `--env`.

### Base Path

The site is served under `/muxa`, and every link, asset, and API route must carry that prefix.

- `next.config.mjs` takes `basePath` and `assetPrefix` from `NEXT_PUBLIC_BASE_PATH`.
- The Fumadocs source in `lib/source.ts` uses `baseUrl: "/"`, because Next.js adds the `/muxa` prefix itself.
- Client code that builds a URL by hand prefixes it with `withBasePath()` from `lib/base-path.ts`.

### Search

Search uses Orama over a static index that Next.js builds at build time.

- `app/api/search/route.ts` exports `staticGET` with `dynamic = "force-static"` and `revalidate = false`.
- `components/search.tsx` fetches it with `useDocsSearch({ type: "static", from: withBasePath("/api/search") })`.

### CI/CD

The `deploy-docs` workflow (`.github/workflows/deploy-docs.yml`) runs when a change touches `apps/docs/` or the workflow itself:

- A push to `main` builds the site and deploys it with `wrangler deploy`.
- A pull request into `dev` or `main`, and a manual run, build the site and do not deploy it.

The deploy step reads two GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Workers permissions
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID

### Hosting

- The worker is named `muxa-docs`.
- `wrangler.jsonc` defines no route. The route that serves `docs.den.ai/muxa` is set outside this repo.
- The `workers.dev` URL of the worker does not answer.
- Static assets are served using Cloudflare Workers Static Assets.
- The worker handles all Next.js server-side rendering and API routes.

## Structure

- `/app` - Next.js app directory
- `/content/docs` - MDX documentation files
- `/content/docs/meta.json` - sidebar navigation order
- `next.config.mjs` - Next.js configuration
- `wrangler.jsonc` - Cloudflare Workers configuration

## Adding Documentation

1. Create a new `.mdx` file in `/content/docs/`
2. Add frontmatter with title and description
3. Add the page name to `pages` in `/content/docs/meta.json`
4. The page will be automatically available at the corresponding URL

## Troubleshooting

### CSS/Static Assets Not Loading

If CSS or other static assets return 404 errors:

1. Ensure `wrangler.jsonc` uses the `assets` configuration (not the deprecated `site` config):

   ```jsonc
   "assets": {
     "directory": ".open-next/assets",
     "binding": "ASSETS"
   }
   ```

2. Verify `@opennextjs/cloudflare` is in `dependencies`, not `devDependencies`

3. Check Next.js version compatibility with OpenNext (e.g., OpenNext 1.6.3 supports up to Next.js 15.3)

### Build Loops

If the build runs multiple times:

- Ensure scripts follow the Cloudflare template pattern
- `build` script should only run `next build` (check for circular dependencies)
- `deploy` and `preview` scripts handle OpenNext build
