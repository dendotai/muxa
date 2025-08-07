# muxa Documentation

This is the documentation site for muxa, built with [Fumadocs](https://fumadocs.vercel.app/) and deployed to Cloudflare Workers.

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

- **`NEXT_PUBLIC_BASE_PATH`** - Set during build for subpath deployments (e.g., `/muxa`)
- **`NODE_ENV`** - Set to `production` in wrangler.jsonc for production deployments

### Deployment Architecture

1. The site is deployed as a private Cloudflare Worker without public routes (you need to disable it in the settings, since it adds it even if you don't specify routes in the `wrangler.jsonc`)
2. It's accessed via service bindings through a router at docs.den.ai
3. Static assets are served using Cloudflare Workers Static Assets
4. The worker handles all Next.js server-side rendering and API routes

### Manual Deployment

```bash
# Deploy to production
bun run deploy

# Deploy with specific environment
wrangler deploy --env production
```

## Structure

- `/app` - Next.js app directory
- `/content/docs` - MDX documentation files
- `/public` - Static assets
- `next.config.mjs` - Next.js configuration
- `wrangler.toml` - Cloudflare Workers configuration

## Adding Documentation

1. Create a new `.mdx` file in `/content/docs/`
2. Add frontmatter with title and description
3. Update the navigation in `/app/docs/layout.tsx`
4. The page will be automatically available at the corresponding URL

## Environment Variables

Required for deployment:

- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with Workers permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

## URLs

- **Production**: <https://docs.den.ai/muxa>
- **Preview**: <https://muxa-docs.workers.dev>
- **Local**: <http://localhost:3000>

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
