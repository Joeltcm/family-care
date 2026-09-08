import type { Metadata } from 'next';
import './globals.css';
import PwaRegister from './pwa-register';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://family-care-pa.joelbmx22.chatgpt.site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Family Care · Salud en familia',
  description: 'Tu expediente médico familiar, organizado, privado y siempre contigo.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/app-icon.png', apple: '/app-icon.png' },
  openGraph: {
    title: 'Family Care',
    description: 'Salud en familia',
    images: [{ url: '/og.png', width: 1733, height: 909, alt: 'Family Care · Salud en familia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Family Care',
    description: 'Salud en familia',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}<PwaRegister /></body></html>;
}
