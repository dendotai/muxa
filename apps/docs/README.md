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

The documentation is automatically deployed to Cloudflare Workers when changes are pushed to the main branch.

### Manual Deployment

```bash
# Deploy to production
bun run deploy

# Deploy to preview environment
wrangler deploy --env preview
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

- **Production**: https://docs.den.ai/muxa
- **Preview**: https://muxa-docs.workers.dev
- **Local**: http://localhost:3000