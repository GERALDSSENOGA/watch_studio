/**
 * Audio device management for WatchStudio.
 * 
 * Provides microphone and speaker enumeration, switching, and monitoring
 * inspired by Zoom Video SDK's audio device management.
 */

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

/**
 * Get all available audio input devices (microphones).
 */
export async function getMicrophoneList(): Promise<AudioDevice[]> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === 'audioinput')
    .map(d => ({ deviceId: d.deviceId, label: d.label || 'Unknown Microphone', kind: 'audioinput' as const }));
}

/**
 * Get all available audio output devices (speakers/headphones).
 */
export async function getSpeakerList(): Promise<AudioDevice[]> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === 'audiooutput')
    .map(d => ({ deviceId: d.deviceId, label: d.label || 'Unknown Speaker', kind: 'audiooutput' as const }));
}

/**
 * Get the currently active microphone device ID from a MediaStream track.
 */
export function getActiveMicrophone(stream: MediaStream | null): string | null {
  if (!stream) return null;
  const track = stream.getAudioTracks()[0];
  return track ? track.getSettings().deviceId || track.id : null;
}

/**
 * Get the currently active speaker device ID from an HTMLMediaElement.
 * Requires setSinkId support (Chrome/Edge). Safari returns null.
 */
export function getActiveSpeaker(videoEl: HTMLVideoElement | null): string | null {
  if (!videoEl || typeof (videoEl as HTMLVideoElement & { setSinkId?: (deviceId: string) => Promise<void> }).setSinkId === 'undefined') {
    return null;
  }
  // Note: There's no direct getter for current sinkId in the spec.
  // We return the current media stream's audio track deviceId as a hint.
  const stream = videoEl.srcObject as MediaStream | null;
  if (!stream) return null;
  const track = stream.getAudioTracks()[0];
  return track ? track.getSettings().deviceId || track.id : null;
}

/**
 * Switch the microphone device for a given MediaStream.
 * Creates a new stream with the selected microphone track.
 */
export async function switchMicrophone(
  currentStream: MediaStream | null,
  deviceId: string
): Promise<MediaStream | null> {
  if (!currentStream) return null;
  
  // Get the new microphone track
  const newStream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: deviceId } }
  });
  
  const newMicTrack = newStream.getAudioTracks()[0];
  if (!newMicTrack) return currentStream;
  
  // Create a new stream combining existing tracks with new mic
  const resultStream = new MediaStream();
  
  // Copy existing video tracks
  for (const track of currentStream.getVideoTracks()) {
    resultStream.addTrack(track.clone());
  }
  
  // Copy existing non-mic audio tracks (if any)
  for (const track of currentStream.getAudioTracks()) {
    // Skip - we're replacing the mic
  }
  
  // Add new mic track
  resultStream.addTrack(newMicTrack);
  
  // Stop old mic track
  for (const track of currentStream.getAudioTracks()) {
    track.stop();
  }
  
  return resultStream;
}

/**
 * Switch the speaker (output device) for a video element.
 * Requires setSinkId support (Chrome/Edge).
 */
export async function switchSpeaker(
  videoEl: HTMLVideoElement | null,
  deviceId: string
): Promise<void> {
  if (!videoEl) return;
  const el = videoEl as HTMLVideoElement & { setSinkId?: (deviceId: string) => Promise<void> };
  if (!el.setSinkId) {
    console.warn('setSinkId not supported in this browser');
    return;
  }
  try {
    await el.setSinkId(deviceId);
  } catch (err) {
    console.error('Failed to switch speaker:', err);
  }
}

/**
 * Get audio level (0.0 to 1.0) from an AudioTrack.
 * Uses the Web Audio API to analyze the track's volume.
 */
export function getAudioLevel(track: MediaStreamTrack | null): number {
  if (!track || track.kind !== 'audio') return 0;
  
  // We can't directly get the audio level from a MediaStreamTrack.
  // This requires a Web Audio API analyser node connected to the track.
  // Returning 0 as placeholder - real implementation needs AudioContext.
  return 0;
}

/**
 * Create an AudioContext analyser for measuring audio levels from a track.
 */
export function createAudioLevelMonitor(track: MediaStreamTrack | null): {
  getLevel: () => number;
  destroy: () => void;
} {
  if (!track || track.kind !== 'audio') {
    return {
      getLevel: () => 0,
      destroy: () => {},
    };
  }
  
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let dataArray: Uint8Array | null = null;
  try {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) {
      return {
        getLevel: () => 0,
        destroy: () => {},
      };
    }
    
    audioContext = new AudioContext();
    analyser = audioContext!.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount) as unknown as Uint8Array;
    
    const stream = new MediaStream([track]);
    source = audioContext!.createMediaStreamSource(stream);
    source.connect(analyser);
  } catch (err) {
    console.error('Failed to create audio level monitor:', err);
    return {
      getLevel: () => 0,
      destroy: () => {},
    };
  }
  
  return {
    getLevel: () => {
      if (!analyser || !dataArray) return 0;
      analyser.getByteFrequencyData(dataArray! as Uint8Array<ArrayBuffer>);
      // Get the average volume (RMS approximation)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      return average / 255; // Normalize to 0-1
    },
    destroy: () => {
      try {
        source?.disconnect();
        analyser?.disconnect();
        audioContext?.close();
      } catch {
        // Ignore cleanup errors
      }
      source = null;
      analyser = null;
      audioContext = null;
      dataArray = null;
    },
  };
}
