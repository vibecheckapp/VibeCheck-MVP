import { supabase } from './supabase-client';

type Handlers = {
  onSnapshot: (snapshot: any) => void;
  onEvent?: (event: any) => void;
  getLocalStateVersion?: () => number | null;
  playerId?: string;
  roomCode?: string;
};

export function startRoomSync(roomId: string, handlers: Handlers) {
  const channel = supabase.channel(`room:${roomId}`);

  // subscribe to room_events inserts
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_events', filter: `room_id=eq.${roomId}` }, (payload: any) => {
    try {
      const ev = payload.record;
      handlers.onEvent?.(ev);

      // if event carries a server state_version, compare and request full snapshot on mismatch
      const serverVersion = ev?.payload?.state_version ?? null;
      const localVersion = handlers.getLocalStateVersion ? handlers.getLocalStateVersion() : null;
      if (serverVersion && localVersion !== null && serverVersion !== localVersion) {
        fetchSnapshot();
      }
    } catch (err) {
      console.error('room event handler error', err);
    }
  });

  channel.subscribe();

  // Heartbeat: inform server we're alive using the dedicated heartbeat API route.
  const heartbeatInterval = setInterval(async () => {
    if (!handlers.playerId || !handlers.roomCode) return;
    try {
      await fetch('/api/rooms/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: handlers.roomCode, playerId: handlers.playerId }),
      });
    } catch {
      // ignore heartbeat failures
    }
  }, 8000);

  // Safety sync interval
  const safetyInterval = setInterval(() => {
    fetchSnapshot();
  }, 15000);

  // Focus / visibility handlers
  function onFocus() {
    fetchSnapshot();
  }
  function onVisibility() {
    if (document.visibilityState === 'visible') fetchSnapshot();
  }
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibility);

  // Network reconnect
  function onOnline() {
    fetchSnapshot();
  }
  window.addEventListener('online', onOnline);

  let pending = false;
  async function fetchSnapshot() {
    if (pending) return;
    pending = true;
    try {
      const params = new URLSearchParams();
      params.set('roomId', roomId);
      if (handlers.roomCode) params.set('roomCode', handlers.roomCode);
      
      const response = await fetch(`/api/rooms/snapshot?${params.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        console.warn('snapshot fetch failed', response.status, text);
      } else {
        const data = await response.json();
        handlers.onSnapshot(data);
      }
    } catch (err) {
      console.error('fetchSnapshot error', err);
    } finally {
      pending = false;
    }
  }

  // initial full snapshot on start
  fetchSnapshot();

  return function stop() {
    clearInterval(heartbeatInterval);
    clearInterval(safetyInterval);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    channel.unsubscribe();
  };
}

export default startRoomSync;
