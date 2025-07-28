import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { pageTree } from '@/lib/source';
import { baseOptions } from '@/app/layout.config';

export default function DocsLayoutWrapper({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      {...baseOptions}
      tree={pageTree}
    >
      {children}
    </DocsLayout>
  );
}