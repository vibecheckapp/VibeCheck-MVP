import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Vibecheck</h1>
        <p>Ein kurzes Multiplayer-Partyspiel mit Spotify für dich und deine Freunde.</p>
        <div className="actions">
          <Link href="/room/enter" className="button">
            Play
          </Link>
        </div>
      </section>

      <section className="overview">
        <h2>So funktioniert das Spiel</h2>
        <ol>
          <li>Auf „Play“ klicken, um zum nächsten Bildschirm zu gelangen.</li>
          <li>„Create Room“ wählen, um einen Raum mit einem zufälligen Code zu starten.</li>
          <li>Andere Spieler geben den Code unter „Join Room“ ein, um mitzumachen.</li>
          <li>Im Raum könnt ihr später Spotify verbinden und die Runde starten.</li>
        </ol>
      </section>
    </main>
  );
}
