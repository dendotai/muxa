/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";

// Use require to bypass TypeScript's module resolution for generated files
const { docs, meta } = require("@/.source");

const _source = loader({
  baseUrl: "/", // Use root since Next.js basePath handles /muxa prefix
  source: createMDXSource(docs, meta),
});

// Export with explicit any types due to fumadocs' missing type exports
export const source: any = _source;
export const getPage: any = _source.getPage;
export const getPages: any = _source.getPages;
export const pageTree: any = _source.pageTree;
