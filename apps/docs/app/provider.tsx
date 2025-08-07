"use client";

import { RootProvider } from "fumadocs-ui/provider";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const SearchDialog = dynamic(() => import("@/components/search"), {
  ssr: false,
});

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{
        enabled: true,
        SearchDialog,
      }}
    >
      {children}
    </RootProvider>
  );
}
