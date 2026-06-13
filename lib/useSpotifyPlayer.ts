/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react';

// Web Playback SDK has been removed - we now only control the external Spotify app via REST API

type UseSpotifyPlayerOptions = {
  playerId: string;
  isHost: boolean;
  roomCode?: string;
  // Optional callback to suppress polling during critical transitions
  onStateTransition?: (isTransitioning: boolean) => void;
};

export function useSpotifyPlayer({ playerId, isHost, roomCode, onStateTransition }: UseSpotifyPlayerOptions) {
  const accessTokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // FIX: Track if polling should be suppressed
  const pollingSuppressedRef = useRef(false);
  
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
          setError('Spotify ist nicht aktiv. Bitte öffne die Spotify App und klicke erneut auf Play.');
          throw new Error('Spotify ist nicht aktiv. Bitte öffne die Spotify App.');
        }

        throw new Error(text || `Spotify API ${res.status}`);
      }
      return res;
    } catch (err: any) {
      setError(err.message ?? String(err));
      throw err;
    }
  }, [fetchToken, getBestDeviceId]);

// Refresh device list and get best device
  const refreshDevicesAndGetId = useCallback(async () => {
    // Force refresh devices by passing a flag to fetchDevices
    const devices = await fetchDevices();
    const activeDevice = devices.find((d: any) => d.is_active);
    if (activeDevice) return activeDevice.id;
    // Fall back to any available device
    if (devices.length > 0) return devices[0].id;
    return null;
  }, [fetchDevices]);

// Play a track via REST API - improved to handle no device case
  const play = useCallback(async (uri?: string) => {
    if (!isHost) throw new Error('Only host may control playback');
    
    // Get token first
    const token = await fetchToken();
    if (!token) {
      // Silently skip if no token - don't show error
      return;
    }

    // Try to get device with refresh
    let deviceId = await refreshDevicesAndGetId();
    
    // If no device found, try refreshing device list a few times (in case Spotify just opened)
    if (!deviceId) {
      console.log('[Spotify] No device found, retrying device detection...');
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        deviceId = await refreshDevicesAndGetId();
        if (deviceId) {
          console.log('[Spotify] Device found after retry', i + 1);
          break;
        }
      }
    }
    
    // If still no device, show clear error
    if (!deviceId) {
      const errorMsg = 'Spotify ist nicht aktiv. Bitte öffne die Spotify App und klicke erneut auf Play.';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('[Spotify] Using device:', deviceId, 'to play URI:', uri);
    
    try {
      // Transfer to device and play with the specific URI
      const transferRes = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: true })
      });
      
      // Small delay to ensure transfer completes
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Then play the specific track
      const body = uri ? { uris: [uri] } : {};
      await apiCall('PUT', '/me/player/play', body);
    } catch (e) {
      console.warn('[Spotify] Play warning:', e);
    }
    
    if (uri) {
      setCurrentTrackUri(uri);
      setIsSdkPlaying(true);
    }
  }, [apiCall, isHost, refreshDevicesAndGetId, fetchToken]);

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

// Resume via REST API - improved to handle no device case
  const resume = useCallback(async () => {
    if (!isHost) throw new Error('Only host may control playback');
    
    // Get token first
    const token = await fetchToken();
    if (!token) {
      // Silently skip if no token - don't show error
      return;
    }

    // Try to get device with refresh
    let deviceId = await refreshDevicesAndGetId();
    
    // If no device found, try refreshing device list a few times
    if (!deviceId) {
      console.log('[Spotify] Resume: No device found, retrying device detection...');
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        deviceId = await refreshDevicesAndGetId();
        if (deviceId) {
          console.log('[Spotify] Resume: Device found after retry', i + 1);
          break;
        }
      }
    }
    
    // If still no device, show clear error
    if (!deviceId) {
      const errorMsg = 'Spotify ist nicht aktiv. Bitte öffne die Spotify App und klicke erneut auf Play.';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log('[Spotify] Resume: Using device:', deviceId);
    
    try {
      // Transfer to device (but don't start playing yet)
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: false })
      });
      
      // Small delay to ensure transfer completes
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Then resume playback (without uris - continues from where it left off)
      await apiCall('PUT', '/me/player/play');
      setIsSdkPlaying(true);
    } catch (e) {
      console.warn('[Spotify] Resume warning:', e);
    }
  }, [isHost, fetchDevices, fetchToken, apiCall, refreshDevicesAndGetId]);

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
    // FIX: Skip polling if suppressed (during critical transitions)
    if (pollingSuppressedRef.current) {
      return null;
    }
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

  // FIX: Expose functions to control polling
  const suppressPolling = useCallback((suppress: boolean) => {
    pollingSuppressedRef.current = suppress;
    if (onStateTransition) {
      onStateTransition(suppress);
    }
  }, [onStateTransition]);

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
    suppressPolling, // FIX: Expose polling control
  };
}

export default useSpotifyPlayer;
