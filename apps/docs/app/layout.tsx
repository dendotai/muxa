import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Provider } from './provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'muxa - Multiple Process Manager',
    template: '%s | muxa',
  },
  description: 'Run your entire dev stack in multiple virtual terminals with one concise command instead of long config files.',
  metadataBase: new URL('https://docs.den.ai/muxa'),
  openGraph: {
    title: 'muxa Documentation',
    description: 'Run your entire dev stack in multiple virtual terminals with one concise command.',
    url: 'https://docs.den.ai/muxa',
    siteName: 'muxa',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.className}>
      <body className="flex flex-col min-h-screen">
        <Provider>
          {children}
        </Provider>
      </body>
    </html>
  );
}