import { notFound } from 'next/navigation';
import { getPage, getPages } from '@/lib/source';
import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page({ params }: PageProps) {
  const { slug = [] } = await params;
  const page = getPage(slug);

  if (!page) {
    notFound();
  }

  const pageData = page.data as {
    body: React.ComponentType;
    toc: Array<{ title: string; url: string; depth: number }>;
    full?: boolean;
  };
  
  const MDXContent = pageData.body;
  const toc = pageData.toc || [];
  
  return (
    <DocsPage
      toc={toc}
      full={pageData.full}
    >
      <DocsBody>
        <MDXContent />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getPages().map((page: any) => ({
    slug: page.slugs,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.data.title,
    description: page.data.description,
  };
}