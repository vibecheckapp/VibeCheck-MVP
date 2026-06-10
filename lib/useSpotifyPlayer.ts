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

// Playback state machine - prevents race conditions
enum PlaybackState {
  IDLE = 'idle',
  LOADING = 'loading',
  PLAYING = 'playing',
  PAUSING = 'pausing',
  PAUSED = 'paused',
}

// Action queue to serialize playback operations
interface PlaybackAction {
  id: string;
  type: 'play' | 'pause' | 'resume' | 'seek' | 'next';
  uri?: string;
  positionMs?: number;
  resolve: () => void;
  reject: (err: Error) => void;
}

function createPlaybackActionQueue() {
  let currentAction: PlaybackAction | null = null;
  const queue: PlaybackAction[] = [];
  let actionCounter = 0;

  const processNext = async (
    player: any,
    executeAction: (action: PlaybackAction) => Promise<void>
  ) => {
    if (currentAction || queue.length === 0) return;

    currentAction = queue.shift()!;
    try {
      await executeAction(currentAction);
      currentAction.resolve();
    } catch (error) {
      currentAction.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      currentAction = null;
      // Process next in queue
      if (queue.length > 0) {
        setTimeout(() => processNext(player, executeAction), 50);
      }
    }
  };

  const enqueue = (
    type: PlaybackAction['type'],
    player: any,
    executeAction: (action: PlaybackAction) => Promise<void>,
    options?: { uri?: string; positionMs?: number }
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const action: PlaybackAction = {
        id: `action_${++actionCounter}`,
        type,
        uri: options?.uri,
        positionMs: options?.positionMs,
        resolve,
        reject,
      };
      queue.push(action);
      processNext(player, executeAction);
    });
  };

  const getQueueLength = () => queue.length;
  const isProcessing = () => currentAction !== null;

  return { enqueue, getQueueLength, isProcessing };
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
  const actionQueueRef = useRef<ReturnType<typeof createPlaybackActionQueue> | null>(null);
  
  // Playback state - authoritative based on SDK events
  const playbackStateRef = useRef<PlaybackState>(PlaybackState.IDLE);
  const actualPlayingRef = useRef<boolean>(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumRequired, setPremiumRequired] = useState(false);
  const [isSdkPlaying, setIsSdkPlaying] = useState(false);

  // fetch a fresh access token from server
  const fetchToken = useCallback(async () => {
    const res = await fetch(`/api/spotify/player-token?playerId=${playerId}`);
    if (!res.ok) throw new Error('Failed to fetch spotify token');
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    accessTokenRef.current = json.access_token;
    return json.access_token;
  }, [playerId]);

// Transfer playback to our device - MUST use play: true to make it the active device
  // FIX: Without play: true, Spotify doesn't activate the Web Playback SDK device
  const transferPlaybackToDevice = useCallback(async (token: string, device_id: string, playUri?: string) => {
    const url = `https://api.spotify.com/v1/me/player`;
    const body: any = { device_ids: [device_id], play: true };
    if (playUri) {
      body.uris = [playUri];
    }
    await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
          // Initialize action queue
          actionQueueRef.current = createPlaybackActionQueue();
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

        // FIX: Track actual playback state from SDK
        localPlayer.addListener('player_state_changed', (state: any) => {
          if (!state) return;
          const playing = !state.paused;
          actualPlayingRef.current = playing;
          setIsSdkPlaying(playing);
          console.log('[Spotify] SDK state changed:', playing ? 'playing' : 'paused', 'position:', state.position);
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

// PLAYBACK FIX: Fetch available devices and use any active device (not just Web Playback SDK)
  const fetchDevices = useCallback(async () => {
    try {
      const token = await fetchToken();
      const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.devices || [];
    } catch {
      return [];
    }
  }, [fetchToken]);

  // Helper to find best available device (prefers Web Playback SDK, falls back to any active device)
  const getBestDeviceId = useCallback(async () => {
    // First try the Web Playback SDK device
    if (deviceIdRef.current) return deviceIdRef.current;

    // If no SDK device, check for any active device
    const devices = await fetchDevices();
    const activeDevice = devices.find((d: any) => d.is_active);
    if (activeDevice) return activeDevice.id;

    // Fall back to any available device
    if (devices.length > 0) return devices[0].id;

    return null;
  }, [fetchDevices]);

// PLAYBACK FIX: Additional helper to ensure device is activated before playing
  // This is called before /me/player/play to transfer playback to our device
  const ensureDeviceActive = useCallback(async (token: string, deviceId: string, playUri?: string) => {
    try {
      // First try to transfer playback to make this the active device
      await transferPlaybackToDevice(token, deviceId, playUri);
      console.log('[Spotify] Device activated for playback');
    } catch (e) {
      // Transfer might fail silently, but we continue - the device should still be registered
      console.log('[Spotify] Transfer warning:', e);
    }
  }, [transferPlaybackToDevice]);

// PLAYBACK FIX: Use Spotify Web Playback SDK directly for play/pause
  // The SDK handles device registration automatically - no need for REST API!
  const playWithSdk = useCallback(async (uri?: string) => {
    const player = playerRef.current;
    if (!player) {
      throw new Error('Spotify player not initialized');
    }

    // FIX: Check if the player is ready (connected and has device_id)
    if (!deviceIdRef.current) {
      console.warn('[Spotify] SDK device not ready yet');
      throw new Error('Spotify device not ready. Please wait a moment.');
    }

    // FIX: Make sure the player has a play method
    if (typeof player.play !== 'function') {
      console.error('[Spotify] SDK player.play is not a function');
      throw new Error('Spotify player not ready');
    }

    try {
      if (uri) {
        // Play specific URI using SDK
        await player.play({ uris: [uri] });
      } else {
        // Resume using SDK
        await player.resume();
      }
      console.log('[Spotify] SDK play succeeded');
    } catch (error) {
      console.error('[Spotify] SDK play failed:', error);
      throw error;
    }
  }, []);

const pauseWithSdk = useCallback(async () => {
    const player = playerRef.current;
    if (!player) {
      throw new Error('Spotify player not initialized');
    }

    // FIX: Check if the player is ready
    if (!deviceIdRef.current) {
      console.warn('[Spotify] SDK device not ready yet');
      throw new Error('Spotify device not ready. Please wait a moment.');
    }

    // FIX: Make sure the player has a pause method
    if (typeof player.pause !== 'function') {
      console.error('[Spotify] SDK player.pause is not a function');
      throw new Error('Spotify player not ready');
    }

    try {
      await player.pause();
      console.log('[Spotify] SDK pause succeeded');
    } catch (error) {
      console.error('[Spotify] SDK pause failed:', error);
      throw error;
    }
  }, []);

  // Legacy REST API for non-SDK devices (mobile, etc.)
  const apiCall = useCallback(async (method: string, path: string, body?: any, retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 500;

    try {
      const token = await fetchToken();
      let deviceId = deviceIdRef.current;
      
      if (!deviceId && retryCount === 0) {
        const activeDeviceId = await getBestDeviceId();
        if (activeDeviceId) {
          console.log('[Spotify] Using device:', activeDeviceId);
          deviceId = activeDeviceId;
        }
      }

      const url = new URL(`https://api.spotify.com/v1${path}`);
      if (deviceId) url.searchParams.set('device_id', deviceId);
      
      if (method === 'PUT' && path === '/me/player/play' && deviceId) {
        await ensureDeviceActive(token, deviceId, body?.uris?.[0]);
      }
      
      const res = await fetch(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text();

        if (res.status === 404 && retryCount < MAX_RETRIES) {
          console.log(`[Spotify] Device not found, retry ${retryCount + 1}/${MAX_RETRIES}...`);
          
          if (retryCount === 0) {
            const devices = await fetchDevices();
            const alternativeDevice = devices.find((d: any) => d.id !== deviceId && d.is_active);
            if (alternativeDevice) {
              deviceIdRef.current = alternativeDevice.id;
              console.log('[Spotify] Trying alternative device:', alternativeDevice.id);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          return apiCall(method, path, body, retryCount + 1);
        }

        if (res.status === 403) {
          let spotifyMessage = 'Playback forbidden.';
          try {
            const parsed = text ? JSON.parse(text) : null;
            const apiMessage = parsed?.error?.message as string | undefined;

            if (apiMessage?.toLowerCase().includes('premium')) {
              setPremiumRequired(true);
              spotifyMessage = 'Spotify Premium wird benötigt.';
            } else if (apiMessage?.toLowerCase().includes('restriction')) {
              spotifyMessage = 'Spotify blockiert gerade. Öffne Spotify und versuche erneut.';
            }
          } catch { }

          setError(spotifyMessage);
          throw new Error(spotifyMessage);
        }

        if (res.status === 404) {
          setError('Device nicht gefunden. Bitte Spotify auf einem anderen Gerät öffnen.');
          throw new Error('Device nicht gefunden.');
        }

        throw new Error(text || `Spotify API ${res.status}`);
      }
      return res;
    } catch (err: any) {
      setError(err.message ?? String(err));
      throw err;
    }
  }, [fetchToken, getBestDeviceId, fetchDevices, ensureDeviceActive]);

// FIX: Use SDK directly for desktop playback - much more reliable!
  // Now uses action queue to prevent race conditions
  const play = useCallback(async (uri?: string) => {
    if (!isHost) throw new Error('Only host may control playback');
    
    const player = playerRef.current;
    
    // Use action queue if available
    if (player && actionQueueRef.current) {
      const queue = actionQueueRef.current;
      return queue.enqueue('play', player, async (action) => {
        playbackStateRef.current = PlaybackState.LOADING;
        try {
          await playWithSdk(action.uri);
          playbackStateRef.current = PlaybackState.PLAYING;
        } catch (e) {
          playbackStateRef.current = PlaybackState.IDLE;
          throw e;
        }
      }, { uri });
    }
    
    // Fallback: direct call without queue (for non-SDK devices)
    if (player && deviceIdRef.current) {
      try {
        await playWithSdk(uri);
        return;
      } catch (e) {
        console.warn('[Spotify] SDK play failed, trying REST API:', e);
        // Fall through to REST API
      }
    }
    
    // Fall back to REST API for non-SDK devices
    // First ensure we have a device
    let deviceId = deviceIdRef.current;
    if (!deviceId) {
      deviceId = await getBestDeviceId();
      if (!deviceId) {
        throw new Error('No Spotify device found. Please open Spotify on a device.');
      }
    }
    
    // FIX: First pause any current playback to ensure clean transition
    try {
      await apiCall('PUT', '/me/player/pause');
    } catch {
      // Ignore pause errors - might not be playing
    }
    
    // Now transfer to device and play new track
    const token = await fetchToken();
    try {
      await transferPlaybackToDevice(token, deviceId, uri);
      console.log('[Spotify] Transferred playback to device:', deviceId);
    } catch (e) {
      console.warn('[Spotify] Transfer warning:', e);
    }
    
    // Then play
    const body = uri ? { uris: [uri] } : {};
    await apiCall('PUT', '/me/player/play', body);
  }, [apiCall, isHost, playWithSdk, getBestDeviceId, transferPlaybackToDevice, fetchToken]);

// FIX: Pause now uses action queue to prevent race conditions
  const pause = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    
    const player = playerRef.current;
    
    // Use action queue if available
    if (player && actionQueueRef.current) {
      const queue = actionQueueRef.current;
      return queue.enqueue('pause', player, async () => {
        playbackStateRef.current = PlaybackState.PAUSING;
        try {
          await pauseWithSdk();
          playbackStateRef.current = PlaybackState.PAUSED;
        } catch (e) {
          playbackStateRef.current = PlaybackState.IDLE;
          throw e;
        }
      });
    }
    
    // Fallback: direct call without queue (for non-SDK devices)
    if (player && deviceIdRef.current) {
      try {
        await pauseWithSdk();
        return;
      } catch (e) {
        console.warn('[Spotify] SDK pause failed, trying REST API:', e);
      }
    }
    
    // Fall back to REST API
    // First ensure we have a device
    let deviceId = deviceIdRef.current;
    if (!deviceId) {
      deviceId = await getBestDeviceId();
      if (!deviceId) {
        throw new Error('No Spotify device found. Please open Spotify on a device.');
      }
    }
    
    // Transfer to device first
    const token = await fetchToken();
    try {
      await transferPlaybackToDevice(token, deviceId);
    } catch (e) {
      console.warn('[Spotify] Transfer warning:', e);
    }
    
    await apiCall('PUT', '/me/player/pause');
  }, [apiCall, isHost, pauseWithSdk, getBestDeviceId, transferPlaybackToDevice, fetchToken]);

const resume = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    
    // Try SDK first if device is ready
    if (playerRef.current && deviceIdRef.current) {
      try {
        await playerRef.current.resume();
        return;
      } catch (e) {
        console.warn('[Spotify] SDK resume failed, trying REST API:', e);
      }
    }
    
    // Fall back to REST API
    // First ensure we have a device
    let deviceId = deviceIdRef.current;
    if (!deviceId) {
      deviceId = await getBestDeviceId();
      if (!deviceId) {
        throw new Error('No Spotify device found. Please open Spotify on a device.');
      }
    }
    
    // Transfer to device first
    const token = await fetchToken();
    try {
      await transferPlaybackToDevice(token, deviceId);
    } catch (e) {
      console.warn('[Spotify] Transfer warning:', e);
    }
    
    await apiCall('PUT', '/me/player/play');
  }, [apiCall, isHost, getBestDeviceId, transferPlaybackToDevice, fetchToken]);

  const seek = useCallback(async (positionMs: number) => {
    if (!isHost) throw new Error('Only host may control playback');
    
    if (playerRef.current) {
      try {
        await playerRef.current.seek(positionMs);
        return;
      } catch (e) {
        console.warn('[Spotify] SDK seek failed, trying REST API:', e);
      }
    }
    
    await apiCall('PUT', `/me/player/seek?position_ms=${Math.max(0, Math.floor(positionMs))}`);
  }, [apiCall, isHost]);

  const nextTrack = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    
    if (playerRef.current) {
      try {
        await playerRef.current.nextTrack();
        return;
      } catch (e) {
        console.warn('[Spotify] SDK next failed, trying REST API:', e);
      }
    }
    
    await apiCall('POST', '/me/player/next');
  }, [apiCall, isHost]);

return {
    ready,
    error,
    premiumRequired,
    deviceId: deviceIdRef.current,
    isSdkPlaying, // Expose actual SDK playback state for frontend sync
    play,
    pause,
    resume,
    seek,
    nextTrack,
    fetchToken, // exposed for debug / reinit
  };
}

export default useSpotifyPlayer;
