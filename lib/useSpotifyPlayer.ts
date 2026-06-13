/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react';

// Web Playback SDK has been removed - we now only control the external Spotify app via REST API

type UseSpotifyPlayerOptions = {
  playerId: string;
  isHost: boolean;
  roomCode?: string;
};

export function useSpotifyPlayer({ playerId, isHost, roomCode }: UseSpotifyPlayerOptions) {
  const accessTokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSdkPlaying, setIsSdkPlaying] = useState(false);
  const [currentTrackUri, setCurrentTrackUri] = useState<string | null>(null);

// Fetch a fresh access token from server
  const fetchToken = useCallback(async () => {
    const res = await fetch(`/api/spotify/player-token?playerId=${playerId}`);
    if (!res.ok) {
      // Silently return null instead of showing error - token refresh will retry
      return null;
    }
    const json = await res.json();
    if (json.error) {
      // Silently return null for token errors
      return null;
    }
    accessTokenRef.current = json.access_token;
    return json.access_token;
  }, [playerId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

// Initialize - just verify we can get a token (no SDK initialization needed)
  useEffect(() => {
    if (!isHost) return;
    if (!playerId) return;

    const init = async () => {
      try {
        const token = await fetchToken();
        // Only set ready if we got a valid token
        if (token) {
          setReady(true);
        }
        // Silently ignore token fetch failures - will retry on next operation
      } catch (err: any) {
        console.error('Failed to init spotify player', err);
        // Silently ignore errors - don't show error message to user
      }
    };

    init();
  }, [isHost, playerId, fetchToken]);

// Fetch available devices and use any active device
  const fetchDevices = useCallback(async () => {
    try {
      const token = await fetchToken();
      if (!token) return []; // Silently skip if no token
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

  // Helper to find best available device (any active device)
  const getBestDeviceId = useCallback(async () => {
    const devices = await fetchDevices();
    const activeDevice = devices.find((d: any) => d.is_active);
    if (activeDevice) return activeDevice.id;
    // Fall back to any available device
    if (devices.length > 0) return devices[0].id;
    return null;
  }, [fetchDevices]);

// REST API call helper
  const apiCall = useCallback(async (method: string, path: string, body?: any, retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 500;

    try {
      const token = await fetchToken();
      if (!token) return null; // Silently skip if no token available
      let deviceId = await getBestDeviceId();
      
      const url = new URL(`https://api.spotify.com/v1${path}`);
      if (deviceId) url.searchParams.set('device_id', deviceId);
      
      const res = await fetch(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text();

        if (res.status === 404 && retryCount < MAX_RETRIES) {
          console.log(`[Spotify] Device not found, retry ${retryCount + 1}/${MAX_RETRIES}...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          return apiCall(method, path, body, retryCount + 1);
        }

        if (res.status === 403) {
          let spotifyMessage = 'Playback forbidden.';
          try {
            const parsed = text ? JSON.parse(text) : null;
            const apiMessage = parsed?.error?.message as string | undefined;
            if (apiMessage?.toLowerCase().includes('restriction')) {
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
  }, [fetchToken, getBestDeviceId]);

// Play a track via REST API
  const play = useCallback(async (uri?: string) => {
    if (!isHost) throw new Error('Only host may control playback');
    
    // First ensure we have a device
    let deviceId = await getBestDeviceId();
    if (!deviceId) {
      throw new Error('No Spotify device found. Please open Spotify on a device.');
    }
    
    // Transfer to device first and play
    const token = await fetchToken();
    if (!token) {
      // Silently skip if no token - don't show error
      return;
    }
    try {
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: true, uris: uri ? [uri] : undefined })
      });
    } catch (e) {
      console.warn('[Spotify] Transfer warning:', e);
    }
    
    // Then play
    const body = uri ? { uris: [uri] } : {};
    await apiCall('PUT', '/me/player/play', body);
    
    if (uri) {
      setCurrentTrackUri(uri);
      setIsSdkPlaying(true);
    }
  }, [apiCall, isHost, getBestDeviceId, fetchToken]);

// Pause via REST API - use dedicated pause endpoint
  const pause = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    
    // First ensure we have a device
    let deviceId = await getBestDeviceId();
    if (!deviceId) {
      deviceId = await getBestDeviceId();
      if (!deviceId) {
        throw new Error('No Spotify device found. Please open Spotify on a device.');
      }
    }
    
    const token = await fetchToken();
    if (!token) {
      // Silently skip if no token - don't show error
      return;
    }
    try {
      // Use dedicated pause endpoint - this actually pauses playback
      await apiCall('PUT', '/me/player/pause');
      setIsSdkPlaying(false);
    } catch (e) {
      console.warn('[Spotify] Pause warning:', e);
    }
  }, [isHost, getBestDeviceId, fetchToken, apiCall]);

// Resume via REST API - use dedicated play endpoint
  const resume = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    
    // First ensure we have a device
    let deviceId = await getBestDeviceId();
    if (!deviceId) {
      // Try to get any available device (not just active ones)
      const devices = await fetchDevices();
      if (devices.length > 0) {
        deviceId = devices[0].id;
      }
    }
    if (!deviceId) {
      throw new Error('No Spotify device found. Please open Spotify on a device.');
    }
    
    const token = await fetchToken();
    if (!token) {
      // Silently skip if no token - don't show error
      return;
    }
    try {
      // First transfer playback to device (but don't start playing yet)
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: false })
      });
      
      // Then resume playback (without uris - continues from where it left off)
      await apiCall('PUT', '/me/player/play');
      setIsSdkPlaying(true);
    } catch (e) {
      console.warn('[Spotify] Resume warning:', e);
    }
  }, [isHost, getBestDeviceId, fetchDevices, fetchToken, apiCall]);

  const seek = useCallback(async (positionMs: number) => {
    if (!isHost) throw new Error('Only host may control playback');
    await apiCall('PUT', `/me/player/seek?position_ms=${Math.max(0, Math.floor(positionMs))}`);
  }, [apiCall, isHost]);

  const nextTrack = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    await apiCall('POST', '/me/player/next');
  }, [apiCall, isHost]);

// Check current playback state from external device
  const checkPlaybackState = useCallback(async () => {
    try {
      const token = await fetchToken();
      if (!token) return null; // Silently skip if no token
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        isPlaying: data?.is_playing ?? false,
        trackUri: data?.item?.uri ?? null,
        position: data?.progress_ms ?? 0,
      };
    } catch {
      return null;
    }
  }, [fetchToken]);

// Poll playback state every 2 seconds to keep UI in sync
  useEffect(() => {
    if (!isHost) return;
    
    const pollState = async () => {
      const state = await checkPlaybackState();
      if (state) {
        setIsSdkPlaying(state.isPlaying);
        setCurrentTrackUri(state.trackUri);
      }
      // Silently ignore if state is null (no token)
    };
    
    // Initial fetch
    pollState();
    
    // Poll every 2 seconds
    const interval = setInterval(pollState, 2000);
    
    return () => clearInterval(interval);
  }, [isHost, checkPlaybackState]);

  return {
    ready,
    error,
    premiumRequired: false, // No longer needed - we control external app
    deviceId: null, // No SDK device ID - we use REST API
    isSdkPlaying,
    currentTrackUri,
    play,
    pause,
    resume,
    seek,
    nextTrack,
    fetchToken,
  };
}

export default useSpotifyPlayer;
