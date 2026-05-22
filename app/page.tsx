import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Vibecheck</h1>
        <p>Spotify Multiplayer-Partygame.</p>
        <div className="actions">
          <Link href="/room/enter" className="button">
            Play
          </Link>
        </div>
      </section>

    </main>
  );
}
