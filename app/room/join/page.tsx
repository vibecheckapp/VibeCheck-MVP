'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinRoomPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isJoining) return;
    setError('');
    setIsJoining(true);

    const normalizedRoomCode = roomCode.trim().toUpperCase();
    const joinTokenKey = `vibecheck-join-token-${normalizedRoomCode}`;
    const clientJoinToken = window.crypto.randomUUID();
    window.sessionStorage.setItem(joinTokenKey, clientJoinToken);

    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: normalizedRoomCode, name, clientJoinToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to join room');
        window.sessionStorage.removeItem(joinTokenKey);
        setIsJoining(false);
        return;
      }

      window.sessionStorage.removeItem(joinTokenKey);
      router.push(`/room/${normalizedRoomCode}?playerId=${data.playerId}`);
    } catch {
      setError('Failed to join room');
      window.sessionStorage.removeItem(joinTokenKey);
      setIsJoining(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Join a Room</h1>
        <p>Enter room code and name to join your friends.</p>
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
          <button type="submit" className="button" disabled={isJoining}>
            {isJoining ? 'Joining…' : 'Join Room'}
          </button>
          {error ? <p className="error-message">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
