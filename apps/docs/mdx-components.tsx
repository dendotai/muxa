import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import defaultComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import * as React from "react";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    pre: ({ ...props }) => (
      <CodeBlock {...props} className="text-sm">
        <Pre className="py-4 overflow-x-auto">{props.children}</Pre>
      </CodeBlock>
    ),
    ...components,
  };
}
