'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RoomEntryPage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async () => {
    if (isCreating) return;
    setError('');

    const profileId = window.localStorage.getItem('vibecheck-user-id');
    if (!profileId) {
      router.push('/profile');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profileId }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to create room.');
        return;
      }

      router.push(`/room/${data.roomCode}?playerId=${data.playerId}`);
    } catch {
      setError('Failed to create room.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Play Vibecheck</h1>
        <p>Create or join a room.</p>
        <div className="actions">
          <button type="button" className="button" onClick={handleCreateRoom} disabled={isCreating}>
            {isCreating ? 'Creating…' : 'Create Room'}
          </button>
          <Link href="/room/join" className="button secondary">
            Join Room
          </Link>
        </div>
        {error ? <p className="error-message">{error}</p> : null}
      </section>
    </main>
  );
}
