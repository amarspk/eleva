'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadSession } from '../lib/auth';
import { VisualExplanationRenderer, type VisualExplanationInput } from './components/VisualExplanationRenderer';
import PersonaAvatar from './components/PersonaAvatar';
import { ElevaPersonaBadge } from './components/PersonaAvatar';

type VoiceState = 'IDLE' | 'WAKE_DETECTED' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'STOPPED' | 'MUTED';

interface AdvisoryLabelGroup {
  facts: string[];
  evidence: string[];
  assumptions: string[];
  recommendations: string[];
  unknowns: string[];
}

interface AdvisoryResponse {
  message: string;
  labels: AdvisoryLabelGroup;
  alternatives?: string[];
  decisionRequired?: string;
  presentation?: {
    problem: string;
    currentState?: string;
    options?: {
      options: Array<{
        name: string;
        benefits: string[];
        costsEffort: string;
        risks: string[];
        operationalImpact: string;
      }>;
    };
    benefits?: string[];
    costs?: string[];
    risks?: string[];
    technicalImpact?: string;
    recommendation?: string;
    implementationPlan?: {
      objective: string;
      affectedComponents: string[];
      phases: { name: string }[];
      dependencies: string[];
      verificationRequirements: string[];
      rollbackOrAbortCriteria: string[];
    };
    decisionRequired?: string;
  };
  visualExplanation?: VisualExplanationInput;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'eleva';
  content: string;
  evidenceClassification?: string;
  reasoning?: string;
  alternatives?: string[];
  createdAt?: string;
}

interface OfficeStatus {
  officeContext: string;
  persona: string;
  status: string;
  activeCapability: string | null;
  updatedAt: string;
  voice?: {
    supported: boolean;
    state: VoiceState;
  };
  research?: {
    supported: boolean;
    description: string;
  };
}

const WAKE_PHRASES = ['eleva', 'hey eleva'];

function classifyLocalMessage(text: string): AdvisoryLabelGroup {
  const lower = text.toLowerCase();
  const recommendations: string[] = [];
  const assumptions: string[] = [];
  const unknowns: string[] = [];
  const facts: string[] = [];
  const evidence: string[] = [];

  if (/\b(do|execute|run|apply|make|build|deploy)\b/i.test(lower)) {
    recommendations.push('This request appears to require execution through the existing M2 authorization model.');
    assumptions.push('Assuming the requested action is within approved capabilities and available tools.');
  }

  if (/\b(current|latest|active|production)\b/i.test(lower)) {
    assumptions.push('Assessment assumes the current repository/runtime context reflects the requested state.');
  }

  if (!text.trim()) {
    unknowns.push('No input was provided.');
  }

  if (!recommendations.length && !assumptions.length && !unknowns.length) {
    facts.push(text);
    evidence.push(`User input: ${text}`);
  }

  return { facts, evidence, assumptions, recommendations, unknowns };
}

function buildLocalResponse(message: string): AdvisoryResponse {
  const labels = classifyLocalMessage(message);
  const recommendation = labels.recommendations[0] || labels.facts[0] || labels.evidence[0] || 'I do not have enough evidence to answer that yet.';
  const decisionRequired = labels.recommendations.length > 0 ? 'User approval required before execution.' : 'No approval required for advisory output.';

  return {
    message: recommendation,
    labels,
    alternatives: labels.recommendations.length ? ['Proceed with advisory review first.', 'Request additional repository context before acting.'] : undefined,
    decisionRequired,
    presentation: {
      problem: message,
      currentState: 'Awaiting repository-backed research and M3 advisory analysis.',
      options: {
        options: [
          { name: 'Continue with current request', benefits: ['Fast'], costsEffort: 'Low', risks: ['May rely on assumptions'], operationalImpact: 'Low' },
          { name: 'Request repository-backed analysis first', benefits: ['Evidence-based'], costsEffort: 'Medium', risks: ['Longer turnaround'], operationalImpact: 'Medium' },
        ],
      },
      recommendation: labels.recommendations[0] || 'Gather additional evidence before proceeding.',
      decisionRequired,
    },
    visualExplanation: {
      type: 'workflow',
      description: 'ELEVA local advisory workflow for the current request.',
      inputs: ['request', 'repositoryFacts'],
      outputs: ['advisory-response', 'evidence'],
      nodes: [
        { id: 'request', label: 'Request', detail: message.slice(0, 120) },
        { id: 'classify', label: 'Classify intent' },
        { id: 'context', label: 'Retrieve context' },
        { id: 'advise', label: 'Advise' },
      ],
      edges: [
        { from: 'request', to: 'classify', label: 'input' },
        { from: 'classify', to: 'context', label: 'context' },
        { from: 'context', to: 'advise', label: 'evidence' },
      ],
    },
  };
}

interface SpeechRecognitionLike {
  start: () => void;
  stop: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function isSpeechRecognitionAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const globalAny = window as unknown as Record<string, unknown>;
  const SpeechRecognition = globalAny.SpeechRecognition ?? globalAny.webkitSpeechRecognition;
  return typeof SpeechRecognition === 'function';
}

function createSpeechRecognition(): SpeechRecognitionLike {
  const globalAny = window as unknown as Record<string, unknown>;
  const SpeechRecognition = globalAny.SpeechRecognition ?? globalAny.webkitSpeechRecognition;
  if (typeof SpeechRecognition !== 'function') {
    throw new Error('SpeechRecognition is not available in this environment.');
  }

  return new (SpeechRecognition as new () => SpeechRecognitionLike)();
}

export default function ElevaOfficePage(): React.ReactNode {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<OfficeStatus | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [researchBoundary, setResearchBoundary] = useState<{ supported: boolean; description: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiBase = useMemo(() => {
    const configured = process.env.NEXT_PUBLIC_API_URL;
    return configured ? configured.replace(/\/$/, '') : '';
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const session = loadSession();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
    }
    return headers;
  }, []);

  useEffect(() => {
    const session = loadSession();
    const isAuthed = !!session?.accessToken;
    setAuthed(isAuthed);
    if (!isAuthed) {
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    if (authed !== true) {
      return;
    }

    let cancelled = false;
    async function loadOffice(): Promise<void> {
      try {
        const [statusRes, researchRes] = await Promise.all([
          fetch(`${apiBase}/api/v1/eleva-office/status`, { headers: getAuthHeaders() }),
          fetch(`${apiBase}/api/v1/eleva-office/research/boundary`, { headers: getAuthHeaders() }),
        ]);

        if (!statusRes.ok) {
          throw new Error(`Failed to load office status: ${statusRes.status}`);
        }

        const statusData = (await statusRes.json()) as OfficeStatus;
        if (!cancelled) {
          setStatus(statusData);
          setVoiceState((statusData.voice?.state as VoiceState) || 'IDLE');
          setVoiceSupported(statusData.voice?.supported || false);
        }

        if (researchRes.ok) {
          const researchData = (await researchRes.json()) as { supported: boolean; description: string };
          if (!cancelled) {
            setResearchBoundary(researchData);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load executive office.');
        }
      }
    }

    void loadOffice();
    return (): void => {
      cancelled = true;
    };
  }, [authed, apiBase, getAuthHeaders]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) {
      return conversationId;
    }

    const res = await fetch(`${apiBase}/api/v1/eleva-office/conversations`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialMemoryKeys: [] }),
    });

    if (!res.ok) {
      throw new Error(`Failed to start conversation: ${res.status}`);
    }

    const data = (await res.json()) as { conversationId: string };
    setConversationId(data.conversationId);
    return data.conversationId;
  }, [apiBase, conversationId, getAuthHeaders]);

  const sendMessage = useCallback(async (): Promise<void> => {
    const trimmed = input.trim();
    if (!trimmed || sending) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const id = await ensureConversation();
      const optimisticMessage: ConversationMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setInput('');

      const res = await fetch(`${apiBase}/api/v1/eleva-office/conversations/${id}/message`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, forceResearch: false }),
      });

      if (!res.ok) {
        throw new Error(`Advisory request failed: ${res.status}`);
      }

      const data = (await res.json()) as AdvisoryResponse;
      const assistantMessage: ConversationMessage = {
        id: `temp-${Date.now()}-assistant`,
        role: 'eleva',
        content: data.message,
        evidenceClassification: data.labels?.evidence?.[0] || 'unknown',
        reasoning: data.labels?.evidence?.join('\n') || undefined,
        alternatives: data.alternatives,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [apiBase, ensureConversation, getAuthHeaders, input, sending]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }, [sendMessage]);

  const startLocalListening = useCallback((): void => {
    setVoiceState('LISTENING');
    setListening(true);
    inputRef.current?.focus();
  }, []);

  const stopLocalListening = useCallback((): void => {
    setVoiceState('IDLE');
    setListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore browser speech cleanup errors
      }
      recognitionRef.current = null;
    }
  }, []);

  const toggleMute = useCallback(async (): Promise<void> => {
    if (voiceState === 'MUTED') {
      setVoiceState('IDLE');
      try {
        await fetch(`${apiBase}/api/v1/eleva-office/voice/transition`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'RESUME' }),
        });
      } catch {
        // best-effort backend state sync
      }
      return;
    }

    setVoiceState('MUTED');
    setListening(false);
    try {
      await fetch(`${apiBase}/api/v1/eleva-office/voice/transition`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'MUTED' }),
      });
    } catch {
      // best-effort backend state sync
    }
  }, [apiBase, getAuthHeaders, voiceState]);

  const activateWakeWord = useCallback(async (): Promise<void> => {
    setVoiceState('WAKE_DETECTED');
    try {
      await fetch(`${apiBase}/api/v1/eleva-office/voice/transition`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'WAKE_DETECTED' }),
      });
    } catch {
      // best-effort
    }
    startLocalListening();
  }, [apiBase, getAuthHeaders, startLocalListening]);

  useEffect(() => {
    if (typeof window === 'undefined' || !voiceSupported || !isSpeechRecognitionAvailable()) {
      return;
    }

    const recognition: SpeechRecognitionLike = createSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }): void => {
      const transcript = event?.results?.[0]?.[0]?.transcript?.toLowerCase() || '';
      if (WAKE_PHRASES.some((phrase) => transcript.includes(phrase))) {
        void activateWakeWord();
      }
    };
    recognition.onerror = (): void => {
      setVoiceState('IDLE');
      setListening(false);
    };
    recognition.onend = (): void => {
      if (listening) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
        return;
      }
      setVoiceState('IDLE');
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setListening(false);
    }

    return (): void => {
      try {
        recognition.stop();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [activateWakeWord, listening, voiceSupported]);

  const lastElevaMessage = useMemo(() => [...messages].reverse().find((message) => message.role === 'eleva'), [messages]);

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!authed) {
    return <></>;
  }

  const voiceLabel: Record<VoiceState, string> = {
    IDLE: 'Idle',
    WAKE_DETECTED: 'Wake word detected',
    LISTENING: 'Listening',
    THINKING: 'Thinking',
    SPEAKING: 'Speaking',
    STOPPED: 'Stopped',
    MUTED: 'Muted',
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 antialiased">
      <header className="flex items-center justify-between bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <PersonaAvatar persona={status?.persona ?? 'ELEVA'} size="md" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">ELEVA Executive Office</h1>
            <p className="text-xs text-gray-500">{status?.persona ?? 'ELEVA'} • {status?.officeContext ?? 'Executive Office'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <ElevaPersonaBadge persona={status?.persona ?? 'ELEVA'} />
          <span className="rounded border border-gray-200 bg-white px-2 py-1">{voiceLabel[voiceState]}</span>
          <span className="rounded border border-gray-200 bg-white px-2 py-1">{researchBoundary?.supported ? 'Research: available' : 'Research: unavailable'}</span>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="rounded border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Conversation</h2>
                <p className="text-xs text-gray-500">Multi-turn advisory with evidence labels and alternatives.</p>
              </div>
              <div className="flex items-center gap-2">
                {!voiceSupported ? (
                  <span className="text-xs text-gray-500">Voice boundary unavailable</span>
                ) : (
                  <button
                    type="button"
                    onClick={listening ? stopLocalListening : activateWakeWord}
                    className={`rounded px-3 py-1.5 text-xs font-semibold ${
                      listening ? 'border border-red-300 bg-red-50 text-red-700' : 'border border-blue-300 bg-blue-50 text-blue-700'
                    }`}
                  >
                    {listening ? 'Stop listening' : 'Say ELEVA / Hey ELEVA'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleMute}
                  className={`rounded px-3 py-1.5 text-xs font-semibold ${
                    voiceState === 'MUTED' ? 'border border-gray-300 bg-gray-100 text-gray-700' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {voiceState === 'MUTED' ? 'Unmute' : 'Mute'}
                </button>
              </div>
            </div>

            <div className="h-96 space-y-4 overflow-y-auto p-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded border px-3 py-2 text-sm ${
                    message.role === 'user' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-900'
                  }`}>
                    <div className="text-xs text-gray-500">{message.role === 'user' ? 'You' : status?.persona ?? 'ELEVA'}</div>
                    <div className="mt-1">{message.content}</div>
                    {message.reasoning ? (
                      <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
                        <div className="font-semibold text-gray-700">Evidence</div>
                        <div className="mt-1 whitespace-pre-line">{message.reasoning}</div>
                      </div>
                    ) : null}
                    {message.alternatives?.length ? (
                      <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
                        <div className="font-semibold text-gray-700">Alternatives</div>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {message.alternatives.map((alt) => (
                            <li key={alt}>{alt}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-100 p-4">
              {error ? <div className="mb-2 text-xs text-red-600">{error}</div> : null}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask ELEVA..."
                  className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={sending}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Voice interaction uses wake-word activation where available. No push-to-talk recording button is required.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Advisory detail</h2>
            </div>
            <div className="space-y-3 p-4 text-sm">
              {lastElevaMessage ? (
                <>
                  <div>
                    <div className="text-xs font-semibold text-gray-500">Latest response</div>
                    <div className="mt-1 text-gray-900">{lastElevaMessage.content}</div>
                  </div>
                  {lastElevaMessage.reasoning ? (
                    <div>
                      <div className="text-xs font-semibold text-gray-500">Evidence</div>
                      <div className="mt-1 whitespace-pre-line text-gray-700">{lastElevaMessage.reasoning}</div>
                    </div>
                  ) : null}
                  {lastElevaMessage.alternatives?.length ? (
                    <div>
                      <div className="text-xs font-semibold text-gray-500">Alternatives</div>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-gray-700">
                        {lastElevaMessage.alternatives.map((alt) => (
                          <li key={alt}>{alt}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-gray-500">Send a message to see evidence, assumptions, and recommendations.</p>
              )}
            </div>
          </div>

          {lastElevaMessage?.evidenceClassification ? (
            <div className="rounded border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Evidence classification</h2>
              </div>
              <div className="p-4 text-xs text-gray-700">
                <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">{lastElevaMessage.evidenceClassification}</span>
              </div>
            </div>
          ) : null}

          {lastElevaMessage ? renderAdvisoryPanel(lastElevaMessage) : null}

          <div className="rounded border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Research boundary</h2>
            </div>
            <div className="p-4 text-xs text-gray-700">
              {researchBoundary ? (
                <>
                  <div className={`rounded border px-2 py-1 ${researchBoundary.supported ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                    {researchBoundary.supported ? 'External research available' : 'External research unavailable'}
                  </div>
                  <div className="mt-2 text-gray-600">{researchBoundary.description}</div>
                </>
              ) : (
                <p className="text-gray-500">Loading research boundary…</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function renderAdvisoryPanel(message: ConversationMessage): React.ReactElement {
  const advisory = buildLocalResponse(message.content);
  return (
    <div className="rounded border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Presentation</h2>
      </div>
      <div className="space-y-3 p-4 text-sm">
        <div>
          <div className="text-xs font-semibold text-gray-500">Problem</div>
          <div className="mt-1 text-gray-900">{advisory.presentation?.problem}</div>
        </div>
        {advisory.presentation?.recommendation ? (
          <div>
            <div className="text-xs font-semibold text-gray-500">Recommendation</div>
            <div className="mt-1 text-gray-900">{advisory.presentation.recommendation}</div>
          </div>
        ) : null}
        {advisory.presentation?.decisionRequired ? (
          <div>
            <div className="text-xs font-semibold text-gray-500">Decision required</div>
            <div className="mt-1 text-gray-900">{advisory.presentation.decisionRequired}</div>
          </div>
        ) : null}
        {advisory.visualExplanation ? (
          <div>
            <div className="text-xs font-semibold text-gray-500">Visual explanation</div>
            <div className="mt-2">
              <VisualExplanationRenderer explanation={advisory.visualExplanation} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
