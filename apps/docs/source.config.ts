import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export default defineConfig({});

const docsConfig = defineDocs({
  dir: 'content/docs',
});

export const docs = docsConfig.docs as any;
export const meta = docsConfig.meta as any;