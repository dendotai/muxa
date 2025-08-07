import { baseOptions } from "@/app/layout.config";
import { pageTree } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions}
      tree={pageTree}
      nav={{
        ...baseOptions.nav,
        title: (
          <>
            <span className="font-medium max-md:hidden">muxa</span>
          </>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
