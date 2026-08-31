import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { VoiceInteractionState, VoiceStateSnapshot, DEFAULT_VOICE_BOUNDARY, VoiceInteractionStateMachineEvent } from './eleva.voice';

export interface VoicePersonaAddress {
  greeting: string;
  thinking: string;
  speaking: string;
  stopped: string;
  muted: string;
}

const DEFAULT_VOICE_PERSONA: VoicePersonaAddress = {
  greeting: 'ELEVA is ready.',
  thinking: 'ELEVA is analyzing your request.',
  speaking: 'ELEVA is responding.',
  stopped: 'ELEVA has stopped.',
  muted: 'ELEVA is muted.',
};

@Injectable()
export class ElevaVoiceService {
  private readonly logger = new Logger(ElevaVoiceService.name);
  private state: VoiceInteractionState = VoiceInteractionState.IDLE;
  private updatedAt = new Date();
  private readonly history: VoiceStateSnapshot[] = [];
  private persona: VoicePersonaAddress = DEFAULT_VOICE_PERSONA;
  private readonly wakePhrases = ['ELEVA', 'Hey ELEVA'];

  constructor(@Optional() private readonly auditService?: AuditService) {}

  getStateSnapshot(): VoiceStateSnapshot {
    return { state: this.state, updatedAt: this.updatedAt };
  }

  isVoiceSupported(): boolean {
    return DEFAULT_VOICE_BOUNDARY.supported;
  }

  getPersona(): VoicePersonaAddress {
    return { ...this.persona };
  }

  getWakePhrases(): string[] {
    return [...this.wakePhrases];
  }

  transition(event: VoiceInteractionStateMachineEvent): VoiceStateSnapshot {
    const previous = this.state;

    switch (event) {
      case VoiceInteractionStateMachineEvent.WAKE_DETECTED:
        this.state = this.state === VoiceInteractionState.MUTED ? VoiceInteractionState.MUTED : VoiceInteractionState.LISTENING;
        break;
      case VoiceInteractionStateMachineEvent.STOPPED:
        this.state = VoiceInteractionState.STOPPED;
        break;
      case VoiceInteractionStateMachineEvent.MUTED:
        this.state = VoiceInteractionState.MUTED;
        break;
      case VoiceInteractionStateMachineEvent.RESUME:
        this.state = VoiceInteractionState.IDLE;
        break;
      default:
        this.state = VoiceInteractionState.IDLE;
    }

    this.updatedAt = new Date();
    this.history.push({ state: previous, updatedAt: this.updatedAt, reason: event });
    this.logger.log(`ELEVA voice transition: ${previous} -> ${this.state} event=${event}`);
    this.emitAudit('AGENT.VOICE.TRANSITION', 'ElevaVoice', undefined, {
      previous,
      current: this.state,
      event,
    });

    return this.getStateSnapshot();
  }

  detectWakeWord(phrase: string): { detected: boolean; confidence?: number } {
    const normalized = phrase.trim();
    const detected = this.wakePhrases.some((wakePhrase) => normalized.toLowerCase() === wakePhrase.toLowerCase());
    if (detected) {
      this.transition(VoiceInteractionStateMachineEvent.WAKE_DETECTED);
    }
    return { detected, confidence: detected ? 0.9 : 0 };
  }

  async speak(_text: string): Promise<void> {
    if (!DEFAULT_VOICE_BOUNDARY.supported) {
      this.logger.warn('Voice provider is not supported in the current environment.');
      return;
    }

    this.state = VoiceInteractionState.SPEAKING;
    this.updatedAt = new Date();
    this.emitAudit('AGENT.VOICE.SPEAK', 'ElevaVoice', undefined, {
      textLength: _text.length,
    });
  }

  getHistory(): VoiceStateSnapshot[] {
    return [...this.history];
  }

  private emitAudit(action: string, entityName: string, entityId: string | undefined, values: Record<string, unknown>): void {
    if (!this.auditService?.log) {
      return;
    }

    this.auditService
      .log({
        tenantId: null,
        userId: null,
        action,
        entityName,
        entityId: entityId ?? null,
        oldValues: null,
        newValues: values,
        ipAddress: 'system',
        userAgent: 'eleva-voice',
      })
      .catch((error: unknown) =>
        this.logger.error(`Failed to emit ELEVA voice audit log: ${error instanceof Error ? error.message : 'unknown'}`),
      );
  }
}
