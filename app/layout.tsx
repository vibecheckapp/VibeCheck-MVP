import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vibecheck',
  description: 'A real-time multiplayer Spotify party game',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
