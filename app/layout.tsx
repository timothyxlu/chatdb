import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PWAProvider } from '@/components/PWAProvider';

export const metadata: Metadata = {
  title: 'ChatDB',
  description: 'Browse and search your AI conversation history',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ChatDB',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#6366f1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PWAProvider />
      </body>
    </html>
  );
}
