import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChatDB',
  description: 'Browse and search your AI conversation history',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
