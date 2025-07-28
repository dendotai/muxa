// source.config.ts
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
var source_config_default = defineConfig({});
var docsConfig = defineDocs({
  dir: "content/docs"
});
var docs = docsConfig.docs;
var meta = docsConfig.meta;
export {
  source_config_default as default,
  docs,
  meta
};
