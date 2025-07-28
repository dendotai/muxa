import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";
import { docs, meta } from "@/.source";

export const source = loader({
  baseUrl: "/", // Use root since Next.js basePath handles /muxa prefix
  // @ts-expect-error - Type mismatch with fumadocs internal types
  source: createMDXSource(docs, meta),
});

export const { getPage, getPages, pageTree } = source as {
  getPage: typeof source.getPage;
  getPages: typeof source.getPages;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageTree: any;
};
