'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinRoomPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const response = await fetch('/api/rooms/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, name }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || 'Failed to join room');
      return;
    }

    router.push(`/room/${roomCode}?playerId=${data.playerId}`);
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Join a Room</h1>
        <p>Gib den Raumcode und deinen Namen ein, um dem Raum beizutreten.</p>
        <form onSubmit={handleSubmit} className="entry-form">
          <input
            name="roomCode"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            placeholder="Room code"
            aria-label="Room code"
            required
          />
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            required
          />
          <button type="submit" className="button">
            Join Room
          </button>
          {error ? <p className="error-message">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
