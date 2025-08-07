# Muxa Documentation Specification

## Overview

This document specifies the implementation of documentation for muxa using Fumadocs, deployed to `docs.den.ai/muxa` via Cloudflare Workers.

## Goals

- Deploy to `docs.den.ai/muxa` without interfering with other projects at `docs.den.ai/*`
- Use Cloudflare Workers instead of Pages
- Maintain documentation alongside code in the muxa repository

## Architecture

### Deployment URL

- **Production**: `https://docs.den.ai/muxa`
- **Preview**: `https://muxa-docs.workers.dev`
- **Local Development**: `http://localhost:3000`

### Technology Stack

- **Framework**: Fumadocs (Next.js-based documentation framework)
- **Deployment**: Cloudflare Workers with @opennextjs/cloudflare adapter
- **Build**: Static export for optimal performance
- **Package Manager**: Bun (consistent with muxa)

## Implementation Details

### 1. Example Documentation Structure (subject to change)

```text
muxa/
├── docs/                      # Documentation site
│   ├── app/                   # Next.js app directory
│   │   ├── layout.tsx         # Root layout with muxa branding
│   │   ├── page.tsx           # Landing page
│   │   └── docs/              # Documentation pages
│   │       ├── [[...slug]]/   # Dynamic routing
│   │       │   └── page.tsx
│   │       └── layout.tsx     # Docs layout with sidebar
│   ├── content/               # MDX content files
│   │   ├── docs/
│   │   │   ├── index.mdx      # Introduction
│   │   │   ├── getting-started.mdx
│   │   │   ├── installation.mdx
│   │   │   ├── usage.mdx
│   │   │   ├── cli-reference.mdx
│   │   │   ├── configuration.mdx
│   │   │   ├── comparison.mdx
│   │   │   ├── architecture.mdx
│   │   │   └── roadmap.mdx
│   │   └── meta.json          # Navigation structure
│   ├── public/                # Static assets
│   ├── next.config.js         # Next.js configuration
│   ├── wrangler.toml          # Cloudflare Workers config
│   └── package.json           # Dependencies
```

### 2. Content Migration

Map existing documentation to new structure (propsed, subject to change):

- **README.md** → Split into:
  - `index.mdx` (introduction with ASCII logo)
  - `getting-started.mdx` (quick start)
  - `installation.mdx` (detailed install instructions)
  - `usage.mdx` (examples and patterns)

- **SPEC.md** → Split into:
  - `architecture.mdx` (technical details)
  - `cli-reference.mdx` (command line options)
  - `configuration.mdx` (config file format)

- **ROADMAP.md** → `roadmap.mdx`

### 3. Configuration

#### next.config.js

```javascript
module.exports = {
  output: "export",
  basePath: "/muxa",
  assetPrefix: "/muxa",
  images: {
    unoptimized: true,
  },
};
```

#### wrangler.toml

```toml
name = "muxa-docs"
main = ".worker-next/index.mjs"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[site]
bucket = ".worker-next/public"

[build]
command = "bunx @opennextjs/cloudflare"

[[routes]]
pattern = "docs.den.ai/muxa/*"
zone_name = "den.ai"
```

### 4. Features

- **Search**: Full-text search across documentation using Orama
  - **Important**: For static export (`output: 'export'`), the search API route requires:
    ```typescript
    export const dynamic = "force-static";
    export const revalidate = false;
    ```
  - Search component must use `api` prop (not `url`) to specify endpoint:
    ```typescript
    useDocsSearch({ type: "fetch", api: "/muxa/api/search" });
    ```
  - The baseUrl in source configuration must match the basePath: `/muxa`
- **Dark Mode**: Automatic theme switching
- **Syntax Highlighting**: For shell commands and code blocks
- **Copy Button**: On all code blocks
- **Navigation**: Sidebar with collapsible sections
- **Mobile Responsive**: Optimized for all devices
- **SEO Optimized**: Proper meta tags and sitemap

### 5. Special Considerations

#### Base Path Configuration

Since the docs will be served at `/muxa`, all internal links and assets must respect this base path. Fumadocs handles this automatically when configured properly.

#### Worker Isolation

The Worker deployment is completely independent - it doesn't need to know about or route to other projects. The den.ai domain owner will configure DNS/routing to point `docs.den.ai/muxa/*` to this Worker.

#### Environment Variables

```env
# Set in Cloudflare Workers dashboard
NODE_ENV=production
NEXT_PUBLIC_BASE_URL=https://docs.den.ai
```

### 6. Build and Deployment

#### Local Development

```bash
cd docs
bun install
bun dev
```

#### Production Build

```bash
cd docs
bun run build
bunx wrangler deploy
```

#### CI/CD Pipeline

GitHub Actions workflow to automatically deploy on push to main:

- Build documentation
- Run tests (if any)
- Deploy to Cloudflare Workers
- No cross-repository triggers needed

### 7. Maintenance

- Documentation updates happen in the muxa repository
- Changes deploy automatically via GitHub Actions
- No coordination needed with other projects
- Version aligned with muxa releases

## Success Metrics

- [ ] Documentation accessible at docs.den.ai/muxa
- [ ] All existing documentation content migrated
- [ ] Search functionality operational
- [ ] Mobile responsive design working
- [ ] Build time under 2 minutes
- [ ] Page load time under 1 second
- [ ] Zero conflicts with other projects on docs.den.ai

## Notes

- This specification focuses solely on muxa documentation
- No routing configuration for other projects included
- Deployment is self-contained and independent
- Future projects can follow similar pattern without coordination

## Implementation Status

✅ **Completed**: The documentation has been implemented in `/apps/docs` with:

- Fumadocs framework setup
- All content migrated to MDX format
- Cloudflare Workers configuration
- GitHub Actions CI/CD workflow
- Full navigation and search support

To deploy:

1. Set up Cloudflare API credentials as GitHub secrets
2. Push to main branch or manually trigger the workflow
3. Access at https://docs.den.ai/muxa
