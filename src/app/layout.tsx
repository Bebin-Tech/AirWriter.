import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-face', display: 'swap' });

export const metadata: Metadata = {
  title: 'AirWrite — write in the air, get a PDF',
  description:
    'AirWrite turns a blank sheet of paper and your finger into a notebook. An overhead camera maps the fingertip onto a page, a side camera decides when the pen is down, and it all exports as a vector PDF.',
  applicationName: 'AirWrite',
};

export const viewport: Viewport = { themeColor: '#08090d' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
