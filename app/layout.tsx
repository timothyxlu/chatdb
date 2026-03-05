import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PWAProvider } from '@/components/PWAProvider';
import { DesktopModeViewport } from '@/components/DesktopModeViewport';

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
    statusBarStyle: 'black-translucent',
    title: 'ChatDB',
    startupImage: [
      // iPhone 16 Pro Max (440x956)
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 16 Pro / 15 Pro / 15 / 14 Pro (393x852)
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 16 Plus / 15 Plus / 14 Plus (430x932)
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 14 / 13 / 13 Pro / 12 / 12 Pro (390x844)
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone SE 3rd / 8 / 7 / 6s (375x667)
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)',
      },
      // iPhone 14 Pro Max / 13 Pro Max / 12 Pro Max (428x926)
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 13 mini / 12 mini (375x812)
      {
        url: '/icons/icon-512.png',
        media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)',
      },
    ],
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
        <DesktopModeViewport />
      </body>
    </html>
  );
}
