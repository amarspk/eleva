'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { clearSession, loadSession, logoutEleva } from '../lib/auth';
import { api } from '../lib/api-client';
import type { OfficeTab } from './components/OfficeShell';
import OfficeShell from './components/OfficeShell';

type VoiceState = 'IDLE' | 'WAKE_DETECTED' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'STOPPED' | 'MUTED';

interface OfficeStatus {
  officeContext: string;
  persona: string;
  status: string;
  activeCapability: string | null;
  updatedAt: string;
  voice?: { supported: boolean; state: string };
  research?: { supported: boolean; description: string };
}

export default function ElevaOfficePage(): React.ReactNode {
  const [activeTab, setActiveTab] = useState<OfficeTab>('dashboard');
  const [status, setStatus] = useState<OfficeStatus | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [researchBoundary, setResearchBoundary] = useState<{ supported: boolean; description: string } | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_URL || '', []);

  useEffect(() => {
    const session = loadSession();
    const isAuthed = !!session?.accessToken;
    setAuthed(isAuthed);
    if (!isAuthed) {
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    if (authed !== true) {
      return;
    }
    let cancelled = false;
    async function loadOffice(): Promise<void> {
      try {
        const [statusData, researchData] = await Promise.all([
          api.get<OfficeStatus>('/api/v1/eleva-office/status'),
          api
            .get<{ supported: boolean; description: string }>('/api/v1/eleva-office/research/boundary')
            .catch(() => ({
              supported: false,
              description: 'External research is unavailable from the current backend contract.',
            })),
        ]);

        if (!cancelled) {
          setStatus(statusData);
          setVoiceState((statusData.voice?.state as VoiceState) || 'IDLE');
          setResearchBoundary(researchData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load the Executive Office.');
        }
      }
    }
    void loadOffice();
    return (): void => {
      cancelled = true;
    };
  }, [authed]);

  const handleLogout = async (): Promise<void> => {
    await logoutEleva(loadSession());
    clearSession();
    window.location.href = '/login';
  };

  const session = loadSession();

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-luxury-black text-gold-200">Loading…</div>
    );
  }

  if (!authed) {
    return null;
  }

  return (
    <OfficeShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      status={status}
      voiceState={voiceState}
      researchBoundary={researchBoundary}
      user={{ email: session?.user?.email ?? '' }}
      onLogout={handleLogout}
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
      )}
      {activeTab === 'dashboard' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-5">
            <DashboardObjective status={status} apiBase={apiBase} />
            <DashboardActiveTask apiBase={apiBase} />
          </section>
          <section className="space-y-5">
            <PersonaPanel status={status} />
            <VoicePanel voiceState={voiceState} status={status} apiBase={apiBase} setVoiceState={setVoiceState} />
            <ResearchPanel boundary={researchBoundary} />
          </section>
        </div>
      )}
      {activeTab === 'chat' && <ChatTab apiBase={apiBase} />}
      {activeTab === 'approvals' && <ApprovalsTab apiBase={apiBase} />}
      {activeTab === 'situations' && <SituationsTab apiBase={apiBase} />}
      {activeTab === 'insights' && <InsightsTab apiBase={apiBase} />}
      {activeTab === 'memory' && <MemoryTab apiBase={apiBase} />}
      {activeTab === 'operations' && <OperationsTab apiBase={apiBase} />}
      {activeTab === 'system' && <SystemTab apiBase={apiBase} />}
    </OfficeShell>
  );
}

function DashboardObjective({
  status,
  apiBase,
}: {
  status: OfficeStatus | null;
  apiBase: string;
}): React.ReactElement {
  const [objective, setObjective] = useState('');
  const [saving, setSaving] = useState(false);
  const [objectiveResult, setObjectiveResult] = useState<{ objective: string } | null>(null);

  useEffect(() => {
    if (!status?.activeCapability) {
      return;
    }
    setObjective(status.activeCapability);
  }, [status?.activeCapability]);

  const saveObjective = async (): Promise<void> => {
    if (!objective.trim()) {
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ objective: string }>(`${apiBase}/api/v1/eleva-office/agent/objective`, {
        objective: objective.trim(),
      });
      setObjectiveResult(result);
    } catch {
      // objective update failed silently; UI error is not required here
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
      <h2 className="text-sm font-semibold text-gold-300">Current objective</h2>
      <p className="mt-1 text-xs text-luxury-muted">Sets the active objective for the ELEVA agent.</p>
      <div className="mt-3 flex items-center gap-3">
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          className="flex-1 rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 focus:border-gold-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void saveObjective()}
          disabled={saving}
          className="rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-luxury-black hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Updating…' : 'Update'}
        </button>
      </div>
      {objectiveResult && (
        <p className="mt-3 text-xs text-gold-200">Objective updated: {objectiveResult.objective}</p>
      )}
      <div className="mt-4 rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-xs text-luxury-muted">
        <div>
          <span className="text-gold-300">Status:</span> {status?.status ?? '—'}
        </div>
        <div>
          <span className="text-gold-300">Active capability:</span> {status?.activeCapability ?? '—'}
        </div>
        <div>
          <span className="text-gold-300">Updated at:</span> {status?.updatedAt ?? '—'}
        </div>
      </div>
    </section>
  );
}

function DashboardActiveTask({
  apiBase,
}: {
  apiBase: string;
}): React.ReactElement {
  const [taskAction, setTaskAction] = useState('read_state');
  const [taskResult, setTaskResult] = useState<Record<string, unknown> | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const runTask = async (): Promise<void> => {
    setTaskError(null);
    setTaskResult(null);
    try {
      const result = await api.post<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/agent/tasks`, {
        action: taskAction,
      });
      setTaskResult(result);
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Task failed');
    }
  };

  return (
    <section className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
      <h2 className="text-sm font-semibold text-gold-300">Active task</h2>
      <p className="mt-1 text-xs text-luxury-muted">Run an existing M9 agent task through the existing execution boundary.</p>
      <div className="mt-3 flex items-center gap-3">
        <input
          value={taskAction}
          onChange={(e) => setTaskAction(e.target.value)}
          className="flex-1 rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 focus:border-gold-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void runTask()}
          className="rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-luxury-black hover:bg-gold-300"
        >
          Run
        </button>
      </div>
      {taskError && <p className="mt-3 text-sm text-red-400">{taskError}</p>}
      {taskResult && (
        <pre className="mt-3 max-h-80 overflow-auto rounded-lg border border-luxury-border bg-luxury-black p-3 text-xs text-gold-200">
          {JSON.stringify(taskResult, null, 2)}
        </pre>
      )}
    </section>
  );
}

function PersonaPanel({ status }: { status: OfficeStatus | null }): React.ReactElement {
  return (
    <section className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
      <h2 className="text-sm font-semibold text-gold-300">Persona</h2>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gold-500/40 bg-luxury-elevated text-lg font-semibold text-gold-300">
          {(status?.persona ?? 'E').slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold text-gold-200">{status?.persona ?? 'ELEVA'}</div>
          <div className="text-xs text-luxury-muted">{status?.officeContext ?? 'Executive Office'}</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-luxury-muted">
        Avatar area is prepared for future avatar media. This release does not include an avatar backend.
      </p>
    </section>
  );
}

function VoicePanel({
  voiceState,
  status,
  apiBase,
  setVoiceState,
}: {
  voiceState: VoiceState;
  status: OfficeStatus | null;
  apiBase: string;
  setVoiceState: (state: VoiceState) => void;
}): React.ReactElement {
  const supported = !!status?.voice?.supported;
  const [listening, setListening] = useState(false);

  const transition = async (event: 'MUTED' | 'RESUME' | 'WAKE_DETECTED'): Promise<void> => {
    try {
      const response = await api.post<{ supported: boolean; state: string }>(`${apiBase}/api/v1/eleva-office/voice/transition`, {
        event,
      });
      setVoiceState((response.state as VoiceState) || 'IDLE');
      setListening(event !== 'MUTED');
    } catch {
      // best-effort voice state sync
    }
  };

  const toggleMute = async (): Promise<void> => {
    if (voiceState === 'MUTED') {
      await transition('RESUME');
      return;
    }
    setVoiceState('MUTED');
    setListening(false);
    await transition('MUTED');
  };

  const activateWakeWord = async (): Promise<void> => {
    setVoiceState('WAKE_DETECTED');
    try {
      const response = await api.post<{ supported: boolean; state: string }>(`${apiBase}/api/v1/eleva-office/voice/transition`, {
        event: 'WAKE_DETECTED',
      });
      setVoiceState((response.state as VoiceState) || 'LISTENING');
      setListening(true);
    } catch {
      setVoiceState('LISTENING');
      setListening(true);
    }
  };

  if (!supported) {
    return (
      <section className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
        <h2 className="text-sm font-semibold text-gold-300">Voice</h2>
        <p className="mt-2 text-xs text-luxury-muted">Voice interaction boundary is unavailable from the current backend contract.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
      <h2 className="text-sm font-semibold text-gold-300">Voice</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded border border-luxury-border bg-luxury-elevated px-2 py-1 text-xs text-gold-200">{voiceState}</span>
        <button
          type="button"
          onClick={listening ? ((): void => { setListening(false); setVoiceState('IDLE'); }) : activateWakeWord}
          className="rounded-lg border border-gold-500/40 bg-luxury-elevated px-3 py-1.5 text-xs font-semibold text-gold-200 hover:bg-luxury-border"
        >
          {listening ? 'Stop listening' : 'Say ELEVA / Hey ELEVA'}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          className="rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-1.5 text-xs font-semibold text-gold-200 hover:bg-luxury-border"
        >
          {voiceState === 'MUTED' ? 'Unmute' : 'Mute'}
        </button>
      </div>
      <p className="mt-2 text-xs text-luxury-muted">
        Controlled voice interaction only. This UI does not implement unsafe always-listening behavior.
      </p>
    </section>
  );
}

function ResearchPanel({
  boundary,
}: {
  boundary: { supported: boolean; description: string } | null;
}): React.ReactElement {
  return (
    <section className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
      <h2 className="text-sm font-semibold text-gold-300">Research boundary</h2>
      <div className="mt-3 rounded-lg border border-luxury-border bg-luxury-elevated p-3 text-xs text-gold-200">
        {boundary?.supported ? 'External research available' : 'External research unavailable'}
      </div>
      <p className="mt-2 text-xs text-luxury-muted">{boundary?.description ?? 'Loading…'}</p>
    </section>
  );
}

function ChatTab({ apiBase }: { apiBase: string }): React.ReactElement {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'eleva'; content: string; reasoning?: string; alternatives?: string[] }>>(
    [],
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const ensureConversation = async (): Promise<string> => {
    if (conversationId) {
      return conversationId;
    }
    const response = await api.post<{ conversationId: string }>(`${apiBase}/api/v1/eleva-office/conversations`, {
      initialMemoryKeys: [],
    });
    setConversationId(response.conversationId);
    return response.conversationId;
  };

  const sendMessage = async (): Promise<void> => {
    const trimmed = input.trim();
    if (!trimmed || sending) {
      return;
    }
    setSending(true);
    setError(null);
    const optimistic = { id: `temp-${Date.now()}`, role: 'user' as const, content: trimmed };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    try {
      const id = await ensureConversation();
      const response = await api.post<AdvisoryResponseShape>(`${apiBase}/api/v1/eleva-office/conversations/${id}/message`, {
        message: trimmed,
        forceResearch: false,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}-assistant`,
          role: 'eleva',
          content: response.message,
          reasoning: response.labels?.evidence?.join('\n') || undefined,
          alternatives: response.alternatives,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advisory request failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-luxury-border bg-luxury-panel/80 shadow-xl shadow-black/30">
      <div className="border-b border-luxury-border px-5 py-4">
        <h2 className="text-sm font-semibold text-gold-300">Conversation</h2>
        <p className="text-xs text-luxury-muted">Multi-turn advisory over the existing M5 conversation contract.</p>
      </div>
      <div className="h-96 space-y-4 overflow-y-auto p-5 luxury-scrollbar">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg border px-3 py-2 text-sm ${
              message.role === 'user' ? 'border-gold-500/40 bg-luxury-elevated text-gold-100' : 'border-luxury-border bg-luxury-black text-gold-100'
            }`}>
              <div className="text-xs text-luxury-muted">{message.role === 'user' ? 'You' : 'ELEVA'}</div>
              <div className="mt-1">{message.content}</div>
              {message.reasoning && (
                <div className="mt-2 border-t border-luxury-border pt-2 text-xs text-gold-200">
                  <div className="font-semibold text-gold-300">Evidence</div>
                  <div className="mt-1 whitespace-pre-line text-luxury-muted">{message.reasoning}</div>
                </div>
              )}
              {message.alternatives?.length && (
                <div className="mt-2 border-t border-luxury-border pt-2 text-xs text-gold-200">
                  <div className="font-semibold text-gold-300">Alternatives</div>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-luxury-muted">
                    {message.alternatives.map((alternative) => (
                      <li key={alternative}>{alternative}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-luxury-border p-5">
        {error && <div className="mb-2 text-xs text-red-400">{error}</div>}
        <div className="flex items-center gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            className="flex-1 rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 placeholder:text-luxury-muted focus:border-gold-400 focus:outline-none"
            placeholder="Ask ELEVA..."
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending}
            className="rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-luxury-black hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ApprovalsTab({ apiBase }: { apiBase: string }): React.ReactElement {
  const [approvals, setApprovals] = useState<Array<Record<string, unknown>>>([]);
  const [selectedActionId, setSelectedActionId] = useState('');
  const [capability, setCapability] = useState('');
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadApprovals = async (): Promise<void> => {
    try {
      const data = await api.get<Array<Record<string, unknown>>>(`${apiBase}/api/v1/eleva-office/approvals`);
      setApprovals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals');
    }
  };

  useEffect(() => {
    void loadApprovals();
  }, []);

  const approve = async (): Promise<void> => {
    if (!selectedActionId || !capability) {
      return;
    }
    setStatusNote(null);
    setError(null);
    try {
      const response = await api.post<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/approvals/approve`, {
        actionId: selectedActionId,
        capability,
      });
      setStatusNote(`Approved: ${selectedActionId}`);
      setApprovals((prev) =>
        prev.map((item) => (item.actionId === selectedActionId ? { ...item, ...response } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const execute = async (): Promise<void> => {
    if (!selectedActionId) {
      return;
    }
    setStatusNote(null);
    setError(null);
    try {
      const response = await api.post<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/approvals/execute`, {
        actionId: selectedActionId,
      });
      setStatusNote(`Executed: ${selectedActionId}`);
      setApprovals((prev) =>
        prev.map((item) => (item.actionId === selectedActionId ? { ...item, ...response } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gold-300">Approvals</h2>
          <button
            type="button"
            onClick={() => void loadApprovals()}
            className="rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-1.5 text-xs text-gold-200 hover:bg-luxury-border"
          >
            Refresh
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {statusNote && <p className="mt-3 text-sm text-gold-200">{statusNote}</p>}
        <div className="mt-4 space-y-2">
          {approvals.length === 0 && <p className="text-xs text-luxury-muted">No approvals available.</p>}
          {approvals.map((approval) => (
            <div key={approval.actionId as string} className="rounded-lg border border-luxury-border bg-luxury-elevated p-3 text-xs text-gold-200">
              <div className="font-semibold">{approval.actionId as string}</div>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-luxury-muted">
                {JSON.stringify(approval, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
        <h3 className="text-sm font-semibold text-gold-300">Act on approval</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <input
            value={selectedActionId}
            onChange={(e) => setSelectedActionId(e.target.value)}
            placeholder="Action ID"
            className="rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 focus:border-gold-400 focus:outline-none"
          />
          <input
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            placeholder="Capability"
            className="rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 focus:border-gold-400 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void approve()} className="flex-1 rounded-lg bg-gold-400 py-2 text-sm font-semibold text-luxury-black hover:bg-gold-300">
              Approve
            </button>
            <button type="button" onClick={() => void execute()} className="flex-1 rounded-lg border border-gold-500/40 py-2 text-sm font-semibold text-gold-200 hover:bg-luxury-elevated">
              Execute
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SituationsTab({ apiBase }: { apiBase: string }): React.ReactElement {
  const [situations, setSituations] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSituations();
  }, []);

  const loadSituations = async (): Promise<void> => {
    try {
      const data = await api.get<Array<Record<string, unknown>>>(`${apiBase}/api/v1/eleva-office/business/situations`);
      setSituations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load situations');
    }
  };

  return (
    <section className="rounded-xl border border-luxury-border bg-luxury-panel/80 shadow-xl shadow-black/30">
      <div className="border-b border-luxury-border px-5 py-4">
        <h2 className="text-sm font-semibold text-gold-300">M7 Situations & Alerts</h2>
        <p className="text-xs text-luxury-muted">Read-only view of existing situation data from M8 business context.</p>
      </div>
      {error && <p className="px-5 pt-4 text-sm text-red-400">{error}</p>}
      <div className="space-y-3 p-5">
        {situations.length === 0 && <p className="text-xs text-luxury-muted">No situations reported yet.</p>}
        {situations.map((situation, index) => (
          <div key={index} className="rounded-lg border border-luxury-border bg-luxury-elevated p-4">
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs text-gold-200">
              {JSON.stringify(situation, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightsTab({ apiBase }: { apiBase: string }): React.ReactElement {
  const [insights, setInsights] = useState<Array<Record<string, unknown>>>([]);
  const [decisionSupport, setDecisionSupport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadInsights();
  }, []);

  const loadInsights = async (): Promise<void> => {
    try {
      const [metrics, insightRows] = await Promise.all([
        api.get<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/business/metrics`),
        api.get<Array<Record<string, unknown>>>(`${apiBase}/api/v1/eleva-office/business/insights`),
      ]);
      setDecisionSupport(metrics);
      setInsights(insightRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
        <h2 className="text-sm font-semibold text-gold-300">Business intelligence</h2>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-luxury-muted">Metrics</h3>
          <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-luxury-border bg-luxury-black p-3 text-xs text-gold-200">
            {decisionSupport ? JSON.stringify(decisionSupport, null, 2) : 'Loading…'}
          </pre>
        </div>
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-luxury-muted">Insights</h3>
          <div className="mt-2 space-y-3">
            {insights.map((insight, index) => (
              <pre key={index} className="max-h-56 overflow-auto rounded-lg border border-luxury-border bg-luxury-black p-3 text-xs text-gold-200">
                {JSON.stringify(insight, null, 2)}
              </pre>
            ))}
            {insights.length === 0 && <p className="text-xs text-luxury-muted">No insights yet.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function MemoryTab({ apiBase }: { apiBase: string }): React.ReactElement {
  const [memory, setMemory] = useState<Array<Record<string, unknown>>>([]);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState('DECISION');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const loadMemory = async (): Promise<void> => {
    try {
      const data = await api.get<Array<Record<string, unknown>>>(`${apiBase}/api/v1/eleva-office/memory`);
      setMemory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory');
    }
  };

  useEffect(() => {
    void loadMemory();
  }, []);

  const remember = async (): Promise<void> => {
    if (!key.trim() || !value.trim()) {
      return;
    }
    setError(null);
    setSaved(null);
    try {
      const response = await api.post<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/memory`, {
        category,
        key,
        value,
        evidenceClassification: 'VERIFIED',
      });
      setSaved(`Saved memory ${response.id as string}`);
      setKey('');
      setValue('');
      await loadMemory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save memory');
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
        <h2 className="text-sm font-semibold text-gold-300">Memory</h2>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {saved && <p className="mt-3 text-sm text-gold-200">{saved}</p>}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 focus:border-gold-400 focus:outline-none"
          />
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Memory key"
            className="rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 focus:border-gold-400 focus:outline-none"
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Memory value"
            className="rounded-lg border border-luxury-border bg-luxury-elevated px-3 py-2 text-sm text-gold-100 focus:border-gold-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void remember()}
          className="mt-3 rounded-lg bg-gold-400 px-4 py-2 text-sm font-semibold text-luxury-black hover:bg-gold-300"
        >
          Save memory
        </button>
      </div>
      <div className="space-y-3">
        {memory.map((entry, index) => (
          <div key={index} className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5">
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-gold-200">{JSON.stringify(entry, null, 2)}</pre>
          </div>
        ))}
        {memory.length === 0 && <p className="text-xs text-luxury-muted">No memory entries.</p>}
      </div>
    </section>
  );
}

function OperationsTab({ apiBase }: { apiBase: string }): React.ReactElement {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [deployment, setDeployment] = useState<Record<string, unknown> | null>(null);
  const [backup, setBackup] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadOperations();
  }, []);

  const loadOperations = async (): Promise<void> => {
    try {
      const [healthData, deploymentData, backupData, statusData] = await Promise.all([
        api.get<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/operational/health`),
        api.get<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/operational/deployment`),
        api.get<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/operational/backup`),
        api.get<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/operational/status`),
      ]);
      setHealth(healthData);
      setDeployment(deploymentData);
      setBackup(backupData);
      setStatus(statusData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operational data');
    }
  };

  return (
    <section className="space-y-5">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <StatusCard title="Health" data={health} />
      <StatusCard title="Deployment" data={deployment} />
      <StatusCard title="Backup" data={backup} />
      <StatusCard title="Operational status" data={status} />
    </section>
  );
}

function StatusCard({
  title,
  data,
}: {
  title: string;
  data: Record<string, unknown> | null;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-luxury-border bg-luxury-panel/80 p-5 shadow-xl shadow-black/30">
      <h3 className="text-sm font-semibold text-gold-300">{title}</h3>
      <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-luxury-border bg-luxury-black p-3 text-xs text-gold-200">
        {data ? JSON.stringify(data, null, 2) : 'Loading…'}
      </pre>
    </div>
  );
}

function SystemTab({ apiBase }: { apiBase: string }): React.ReactElement {
  const [agentState, setAgentState] = useState<Record<string, unknown> | null>(null);
  const [capabilities, setCapabilities] = useState<Array<Record<string, unknown>>>([]);
  const [permissions, setPermissions] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSystem();
  }, []);

  const loadSystem = async (): Promise<void> => {
    try {
      const [stateData, capabilitiesData, permissionsData] = await Promise.all([
        api.get<Record<string, unknown>>(`${apiBase}/api/v1/eleva-office/agent/state`),
        api.get<Array<Record<string, unknown>>>(`${apiBase}/api/v1/agent/capabilities`),
        api.get<Array<Record<string, unknown>>>(`${apiBase}/api/v1/agent/permissions`),
      ]);
      setAgentState(stateData);
      setCapabilities(capabilitiesData);
      setPermissions(permissionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system data');
    }
  };

  return (
    <section className="space-y-5">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <StatusCard title="Agent state" data={agentState} />
      <StatusCard title="Capabilities" data={{ items: capabilities }} />
      <StatusCard title="Permissions" data={{ items: permissions }} />
    </section>
  );
}

interface AdvisoryResponseShape {
  message: string;
  labels?: {
    evidence?: string[];
    assumptions?: string[];
    recommendations?: string[];
    unknowns?: string[];
  };
  alternatives?: string[];
  decisionRequired?: string;
  presentation?: Record<string, unknown>;
}
