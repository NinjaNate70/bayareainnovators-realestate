import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deposit Defense | Your rental evidence vault',
  description: 'Organize move-in photos, property evidence, and rental leases in one place.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
