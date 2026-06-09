/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react';

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

let sdkLoadingPromise: Promise<void> | null = null;

function loadSpotifySdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).Spotify) return Promise.resolve();
  if (sdkLoadingPromise) return sdkLoadingPromise;

  sdkLoadingPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      if ((window as any).onSpotifyWebPlaybackSDKReady === readyCallback) {
        delete (window as any).onSpotifyWebPlaybackSDKReady;
      }
    };

    const readyCallback = () => {
      cleanup();
      resolve();
    };

    // The Spotify SDK calls this callback once the global Spotify object is ready.
    (window as any).onSpotifyWebPlaybackSDKReady = readyCallback;

    // First probe the URL to detect 404 quickly and provide clearer message
    fetch(SDK_URL, { method: 'HEAD' }).then((probe) => {
      if (!probe.ok) {
        cleanup();
        reject(new Error(`Spotify SDK not available at ${SDK_URL} (status ${probe.status})`));
        return;
      }
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load Spotify SDK script from ${SDK_URL}`));
      };
      document.head.appendChild(script);
    }).catch((err) => {
      cleanup();
      reject(new Error(`Failed to fetch Spotify SDK at ${SDK_URL}: ${err?.message ?? err}`));
    });
  });

  return sdkLoadingPromise;
}

type UseSpotifyPlayerOptions = {
  playerId: string; // app's player/user id
  isHost: boolean;
  roomCode?: string;
};

export function useSpotifyPlayer({ playerId, isHost, roomCode }: UseSpotifyPlayerOptions) {
  const playerRef = useRef<any | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumRequired, setPremiumRequired] = useState(false);

  // fetch a fresh access token from server
  const fetchToken = useCallback(async () => {
    const res = await fetch(`/api/spotify/player-token?playerId=${playerId}`);
    if (!res.ok) throw new Error('Failed to fetch spotify token');
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    accessTokenRef.current = json.access_token;
    return json.access_token;
  }, [playerId]);

  // Transfer playback to our device
  const transferPlaybackToDevice = useCallback(async (token: string, device_id: string) => {
    const url = `https://api.spotify.com/v1/me/player`;
    await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [device_id], play: false }),
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Only initialize for host
    if (!isHost) return;
    if (!playerId) return;

    let localPlayer: any = null;
    let cancelled = false;

    const init = async () => {
      try {
        await loadSpotifySdk();
        if (cancelled || !mountedRef.current) return;
        const token = await fetchToken();

        // Prevent multiple inits
        if ((window as any).__vibecheck_spotify_player_instance && (window as any).__vibecheck_spotify_player_instance.player) {
          playerRef.current = (window as any).__vibecheck_spotify_player_instance.player;
          deviceIdRef.current = (window as any).__vibecheck_spotify_player_instance.deviceId || null;
          setReady(!!deviceIdRef.current);
          return;
        }

        const PlayerConstructor = (window as any).Spotify.Player;
        if (!PlayerConstructor) throw new Error('Spotify SDK not available');

        localPlayer = new PlayerConstructor({
          name: `VibeCheck — ${roomCode ?? 'Host'}`,
          getOAuthToken: (cb: (token: string) => void) => {
            // ensure latest token
            cb(accessTokenRef.current ?? token);
          },
          volume: 1.0,
        });

        // Attach listeners
        localPlayer.addListener('initialization_error', ({ message }: any) => {
          console.error('spotify init error', message);
          setError(message);
        });
        localPlayer.addListener('authentication_error', ({ message }: any) => {
          console.warn('spotify auth error', message);
          setError(message);
        });
        localPlayer.addListener('account_error', ({ message }: any) => {
          console.warn('spotify account error', message);
          setError(message);
          if (message && message.toLowerCase().includes('premium')) setPremiumRequired(true);
        });
        localPlayer.addListener('playback_error', ({ message }: any) => {
          console.warn('spotify playback error', message);
          setError(message);
        });

        localPlayer.addListener('ready', async ({ device_id }: any) => {
          console.log('[Spotify] Player ready with device id', device_id);
          deviceIdRef.current = device_id;
          // persist singleton
          (window as any).__vibecheck_spotify_player_instance = { player: localPlayer, deviceId: device_id };
          // Transfer playback to this device
          try {
            await transferPlaybackToDevice(accessTokenRef.current ?? token, device_id);
            setReady(true);
          } catch (e) {
            console.warn('transfer playback failed', e);
          }
        });

        localPlayer.addListener('not_ready', ({ device_id }: any) => {
          console.log('[Spotify] Device went offline', device_id);
          if (deviceIdRef.current === device_id) deviceIdRef.current = null;
          setReady(false);
        });

        await localPlayer.connect();
        playerRef.current = localPlayer;
        // store global reference to avoid duplicates
        (window as any).__vibecheck_spotify_player_instance = { player: localPlayer, deviceId: deviceIdRef.current };
      } catch (err: any) {
        console.error('Failed to init spotify player', err);
        setError(err.message ?? String(err));
      }
    };

    init();

    return () => {
      cancelled = true;
      // cleanup: do not disconnect if we want persistence across navigations, but ensure no duplicate
      // If this is the global instance, disconnect only if unmounting fully
      if (localPlayer && (window as any).__vibecheck_spotify_player_instance?.player === localPlayer) {
        try {
          localPlayer.disconnect();
        } catch {}
        (window as any).__vibecheck_spotify_player_instance = null;
      }
    };
  }, [isHost, playerId, fetchToken, roomCode, transferPlaybackToDevice]);

  // Playback control helpers - always use Web API routed to our device id
  const apiCall = useCallback(async (method: string, path: string, body?: any) => {
    // ensure token
    try {
      const token = await fetchToken();
      const deviceId = deviceIdRef.current;
      const url = new URL(`https://api.spotify.com/v1${path}`);
      if (deviceId) url.searchParams.set('device_id', deviceId);
      const res = await fetch(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text();

        if (res.status === 403) {
          let spotifyMessage = 'Playback forbidden (Spotify restriction).';
          try {
            const parsed = text ? JSON.parse(text) : null;
            const apiMessage = parsed?.error?.message as string | undefined;
            const apiReason = parsed?.error?.reason as string | undefined;

            if (apiMessage?.toLowerCase().includes('premium')) {
              setPremiumRequired(true);
              spotifyMessage = 'Spotify Premium wird für Web Playback benötigt.';
            } else if (apiMessage?.toLowerCase().includes('restriction violated')) {
              spotifyMessage = 'Spotify blockiert diesen Player-Befehl gerade (Restriction violated). Öffne Spotify auf einem aktiven Gerät und versuche es erneut.';
            } else if (apiReason) {
              spotifyMessage = `Spotify playback blocked: ${apiReason}`;
            } else if (apiMessage) {
              spotifyMessage = apiMessage;
            }
          } catch {
            // keep fallback message
          }

          setError(spotifyMessage);
          throw new Error(spotifyMessage);
        }

        throw new Error(text || `Spotify API ${res.status}`);
      }
      return res;
    } catch (err: any) {
      setError(err.message ?? String(err));
      throw err;
    }
  }, [fetchToken]);

  const play = useCallback(async (uri?: string) => {
    if (!isHost) throw new Error('Only host may control playback');
    if (!deviceIdRef.current) throw new Error('Device not ready');
    const body = uri ? { uris: [uri] } : {};
    await apiCall('PUT', '/me/player/play', body);
  }, [apiCall, isHost]);

  const pause = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    await apiCall('PUT', '/me/player/pause');
  }, [apiCall, isHost]);

  const resume = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    await apiCall('PUT', '/me/player/play');
  }, [apiCall, isHost]);

  const seek = useCallback(async (positionMs: number) => {
    if (!isHost) throw new Error('Only host may control playback');
    await apiCall('PUT', `/me/player/seek?position_ms=${Math.max(0, Math.floor(positionMs))}`);
  }, [apiCall, isHost]);

  const nextTrack = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    await apiCall('POST', '/me/player/next');
  }, [apiCall, isHost]);

  return {
    ready,
    error,
    premiumRequired,
    deviceId: deviceIdRef.current,
    play,
    pause,
    resume,
    seek,
    nextTrack,
    fetchToken, // exposed for debug / reinit
  };
}

export default useSpotifyPlayer;
