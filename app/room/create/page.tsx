'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateRoomPage() {
  const router = useRouter();
  const [name, setName] = useState('');
    const [profileId, setProfileId] = useState('');
    const [profileName, setProfileName] = useState('');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const id = window.localStorage.getItem('vibecheck-user-id');
    if (!id) return;
    setProfileId(id);
    fetch(`/api/profile?userId=${encodeURIComponent(id)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data?.user && setProfileName(data.user.display_name))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setProfileUserId(window.localStorage.getItem('vibecheck-user-id'));
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const response = await fetch('/api/rooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: profileId ? undefined : name, userId: profileId || undefined }),
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
        <p>{profileUserId ? 'Your profile will be used for this room.' : 'Enter your name and start a game lobby.'}</p>
          <p>{profileId ? `Playing as ${profileName || 'your profile'}.` : 'Enter your name and start a game lobby.'}</p>
        <form onSubmit={handleSubmit} className="entry-form">
          {!profileUserId ? <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            required
          /> : null}
          <button type="submit" className="button">
            Create Room
          </button>
          {error ? <p className="error-message">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
