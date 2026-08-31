import { VoiceInteractionState, DEFAULT_VOICE_BOUNDARY } from './eleva.voice';

describe('eleva.voice', () => {
  it('should expose all required voice interaction states', () => {
    const states = Object.values(VoiceInteractionState);
    expect(states).toEqual([
      'IDLE',
      'WAKE_DETECTED',
      'LISTENING',
      'THINKING',
      'SPEAKING',
      'STOPPED',
      'MUTED',
    ]);
  });

  it('should create a voice state snapshot', () => {
    const snapshot = {
      state: VoiceInteractionState.IDLE,
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    };
    expect(snapshot.state).toBe(VoiceInteractionState.IDLE);
    expect(snapshot.updatedAt.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('should create a voice state snapshot with reason', () => {
    const snapshot = {
      state: VoiceInteractionState.MUTED,
      updatedAt: new Date(),
      reason: 'User requested mute.',
    };
    expect(snapshot.state).toBe(VoiceInteractionState.MUTED);
    expect(snapshot.reason).toBe('User requested mute.');
  });

  it('should export a default voice provider boundary with supported=false', () => {
    expect(DEFAULT_VOICE_BOUNDARY.supported).toBe(false);
    expect(DEFAULT_VOICE_BOUNDARY.inputContract.audioBlob.type).toBe('blob');
    expect(DEFAULT_VOICE_BOUNDARY.outputContract.transcript.type).toBe('string');
  });
});
