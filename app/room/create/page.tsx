'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateRoomPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const response = await fetch('/api/rooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || 'Failed to create room');
      return;
    }

    router.push(`/room/${data.roomCode}?playerId=${data.playerId}`);
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Create Room</h1>
        <p>Enter your name and start a game lobby.</p>
        <form onSubmit={handleSubmit} className="entry-form">
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            required
          />
          <button type="submit" className="button">
            Create Room
          </button>
          {error ? <p className="error-message">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
