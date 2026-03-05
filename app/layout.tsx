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
      // iPhone 17 Pro / 16 Pro (402x874 @3x)
      {
        url: '/icons/splash-1206x2622.png',
        media: '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 16 Pro Max / 17 Pro Max (440x956 @3x)
      {
        url: '/icons/splash-1320x2868.png',
        media: '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 16 / 15 / 15 Pro / 14 Pro (393x852 @3x)
      {
        url: '/icons/splash-1179x2556.png',
        media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 16 Plus / 15 Plus / 14 Plus (430x932 @3x)
      {
        url: '/icons/splash-1290x2796.png',
        media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 14 / 13 / 13 Pro / 12 / 12 Pro (390x844 @3x)
      {
        url: '/icons/splash-1170x2532.png',
        media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 14 Pro Max / 13 Pro Max / 12 Pro Max (428x926 @3x)
      {
        url: '/icons/splash-1284x2778.png',
        media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone 13 mini / 12 mini (375x812 @3x)
      {
        url: '/icons/splash-1125x2436.png',
        media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)',
      },
      // iPhone SE 3rd / 8 / 7 / 6s (375x667 @2x)
      {
        url: '/icons/splash-750x1334.png',
        media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)',
      },
      // iPhone 11 / XR (414x896 @2x)
      {
        url: '/icons/splash-828x1792.png',
        media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)',
      },
      // iPhone 11 Pro Max / XS Max (414x896 @3x)
      {
        url: '/icons/splash-1242x2688.png',
        media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)',
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
