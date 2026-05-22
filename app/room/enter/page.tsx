'use client';

import Link from 'next/link';

export default function RoomEntryPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Play Vibecheck</h1>
        <p>Create or join a room.</p>
        <div className="actions">
          <Link href="/room/create" className="button">
            Create Room
          </Link>
          <Link href="/room/join" className="button secondary">
            Join Room
          </Link>
        </div>
      </section>
    </main>
  );
}
