"use client";

import { type ReactNode } from "react";

export function Body({ children }: { children: ReactNode }): React.ReactElement {
  return <body className="relative flex min-h-screen flex-col">{children}</body>;
}
