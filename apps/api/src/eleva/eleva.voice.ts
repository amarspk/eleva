export enum VoiceInteractionState {
  IDLE = 'IDLE',
  WAKE_DETECTED = 'WAKE_DETECTED',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  STOPPED = 'STOPPED',
  MUTED = 'MUTED',
}

export interface VoiceStateSnapshot {
  state: VoiceInteractionState;
  updatedAt: Date;
  reason?: string;
}

export interface WakeWordResult {
  detected: boolean;
  phrase?: string;
  confidence?: number;
}

export interface VoiceTranscriptSegment {
  text: string;
  confidence: number;
  isFinal: boolean;
}

export interface VoiceProviderBoundary {
  supported: boolean;
  description: string;
  inputContract: Record<string, { type: string }>;
  outputContract: Record<string, { type: string }>;
}

export const DEFAULT_VOICE_BOUNDARY: VoiceProviderBoundary = {
  supported: false,
  description:
    'No repository voice provider is currently wired into the ELEVA module. M5 defines the state/contract boundary only.',
  inputContract: {
    audioBlob: { type: 'blob' },
    sampleRateHertz: { type: 'number' },
  },
  outputContract: {
    transcript: { type: 'string' },
    confidence: { type: 'number' },
    isFinal: { type: 'boolean' },
  },
};

export enum VoiceInteractionStateMachineEvent {
  WAKE_DETECTED = 'WAKE_DETECTED',
  STOPPED = 'STOPPED',
  MUTED = 'MUTED',
  RESUME = 'RESUME',
}
