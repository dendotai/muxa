// source.config.ts
import { rehypeCode } from "fumadocs-core/mdx-plugins";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
var source_config_default = defineConfig({
  mdxOptions: {
    rehypePlugins: [
      [
        rehypeCode,
        {
          themes: {
            light: "github-light",
            dark: "github-dark"
          }
        }
      ]
    ]
  }
});
var { docs, meta } = defineDocs({
  dir: "content/docs"
});
export {
  source_config_default as default,
  docs,
  meta
};
