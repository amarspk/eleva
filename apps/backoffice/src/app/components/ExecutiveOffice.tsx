'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorBanner, LoadingRow } from './ui/Primitives';
import { ApiError } from '../lib/api-client';
import { agentApi, type AgentAction, type AgentSession } from '../lib/resources';

const SAFE_TOOLS = ['read_project_state', 'read_repo_file', 'git_status', 'git_log'] as const;

function workflowLabel(action: AgentAction): string {
  const fromResult = action.result && typeof action.result === 'object'
    ? (action.result as { workflowState?: string }).workflowState
    : undefined;
  const status = String(fromResult || action.status || '').toUpperCase();
  if (status === 'PROPOSED') {
    return 'AWAITING_APPROVAL';
  }
  if (status === 'EXECUTED') {
    return 'COMPLETED';
  }
  return status || 'PLANNING';
}

function formatResult(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'content' in value && typeof (value as { content: unknown }).content === 'string') {
    return (value as { content: string }).content;
  }
  if (typeof value === 'object' && value !== null && 'output' in value && typeof (value as { output: unknown }).output === 'string') {
    return (value as { output: string }).output;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ExecutiveOffice(): React.ReactElement {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string>('');
  const [tool, setTool] = useState<string>('read_project_state');
  const [filePath, setFilePath] = useState('package.json');
  const [planSummary, setPlanSummary] = useState('');
  const [noteName, setNoteName] = useState('owner-note');
  const [noteBody, setNoteBody] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [notice, setNotice] = useState('');

  const sessionsQuery = useQuery({ queryKey: ['agent-sessions'], queryFn: () => agentApi.listSessions() });
  const sessionQuery = useQuery({
    queryKey: ['agent-session', sessionId],
    queryFn: () => agentApi.getSession(sessionId),
    enabled: sessionId.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: () => agentApi.createSession('Executive Office'),
    onSuccess: (session) => {
      setSessionId(session.id);
      setNotice('Session created.');
      void queryClient.invalidateQueries({ queryKey: ['agent-sessions'] });
    },
  });

  const invokeMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) {
        throw new Error('Create or select a session first.');
      }
      const args: Record<string, unknown> = {};
      if (tool === 'read_repo_file') {
        args.path = filePath;
      }
      if (tool === 'propose_plan') {
        args.summary = planSummary || 'Proposed change (Slice 2 — not executed)';
      }
      if (tool === 'write_agent_note') {
        args.filename = noteName;
        args.body = noteBody || 'Executive Office note';
      }
      return agentApi.invoke(sessionId, tool, args);
    },
    onSuccess: (result) => {
      setNotice(`${result.tool} → ${result.status}${result.executed ? '' : ' (not executed)'}`);
      void queryClient.invalidateQueries({ queryKey: ['agent-session', sessionId] });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) {
        throw new Error('Create or select a session first.');
      }
      return agentApi.chat(sessionId, chatMessage);
    },
    onSuccess: (result) => {
      setNotice(result.proposed ? 'Plan proposed (not executed).' : result.reply.slice(0, 240));
      setChatMessage('');
      void queryClient.invalidateQueries({ queryKey: ['agent-session', sessionId] });
    },
  });

  const decideMutation = useMutation({
    mutationFn: ({ action, decision }: { action: AgentAction; decision: 'approve' | 'reject' }) =>
      decision === 'approve'
        ? agentApi.approve(sessionId, action.id)
        : agentApi.reject(sessionId, action.id),
    onSuccess: (result) => {
      setNotice(`Action ${result.decision} → ${result.workflowState ?? result.status}.`);
      void queryClient.invalidateQueries({ queryKey: ['agent-session', sessionId] });
    },
  });

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  useEffect(() => {
    if (!sessionId && sessions.length === 1) {
      setSessionId(sessions[0].id);
    }
  }, [sessions, sessionId]);
  const detail: AgentSession | undefined = sessionQuery.data;
  const listError = sessionsQuery.error as ApiError | null;

  return (
    <section aria-labelledby="executive-office-heading" className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-white">
        <h2 id="executive-office-heading" className="text-lg font-bold">Executive Office</h2>
        <p className="mt-1 text-sm text-slate-300">
          Platform-owner Agent console. SAFE diagnostics run immediately. Plans wait for approval. After approval, write_agent_note may write markdown under docs/agent-workspace/ only. apply_patch, deploy, migrations, and secrets stay blocked.
        </p>
      </div>

      {listError ? <ErrorBanner message={listError.message} /> : null}
      {invokeMutation.error ? <ErrorBanner message={(invokeMutation.error as Error).message} /> : null}
      {decideMutation.error ? <ErrorBanner message={(decideMutation.error as Error).message} /> : null}
      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
          New session
        </Button>
        <label className="text-sm text-gray-600" htmlFor="agent-session-select">
          Session
          <select
            id="agent-session-select"
            aria-label="Agent session"
            className="ml-2 rounded border px-2 py-1"
            value={sessionId}
            onChange={(event) => setSessionId(event.target.value)}
          >
            <option value="">Select…</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>{session.title} ({session.id.slice(0, 8)})</option>
            ))}
          </select>
        </label>
      </div>

      {sessionsQuery.isLoading ? <LoadingRow label="Loading Agent sessions…" /> : null}

      {sessionId ? (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-sm">
              Tool
              <select className="ml-2 rounded border px-2 py-1" value={tool} onChange={(event) => setTool(event.target.value)}>
                {SAFE_TOOLS.map((name) => <option key={name} value={name}>{name}</option>)}
                <option value="propose_plan">propose_plan</option>
                <option value="write_agent_note">write_agent_note</option>
              </select>
            </label>
            {tool === 'read_repo_file' ? (
              <input
                className="rounded border px-2 py-1 text-sm"
                value={filePath}
                onChange={(event) => setFilePath(event.target.value)}
                aria-label="Repository path"
              />
            ) : null}
            {tool === 'propose_plan' ? (
              <input
                className="min-w-[16rem] rounded border px-2 py-1 text-sm"
                value={planSummary}
                onChange={(event) => setPlanSummary(event.target.value)}
                placeholder="Plan summary"
                aria-label="Plan summary"
              />
            ) : null}
            {tool === 'write_agent_note' ? (
              <>
                <input
                  className="rounded border px-2 py-1 text-sm"
                  value={noteName}
                  onChange={(event) => setNoteName(event.target.value)}
                  placeholder="filename"
                  aria-label="Note filename"
                />
                <input
                  className="min-w-[16rem] rounded border px-2 py-1 text-sm"
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  placeholder="Note body"
                  aria-label="Note body"
                />
              </>
            ) : null}
            <Button variant="primary" disabled={invokeMutation.isPending} onClick={() => invokeMutation.mutate()}>
              Run
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <textarea
              className="min-h-[4rem] min-w-[20rem] flex-1 rounded border px-2 py-1 text-sm"
              value={chatMessage}
              onChange={(event) => setChatMessage(event.target.value)}
              aria-label="Agent message"
              placeholder="Arabic or English — e.g. أريد أضيف منتج جديد"
            />
            <Button
              variant="primary"
              disabled={chatMutation.isPending || chatMessage.trim().length === 0}
              onClick={() => chatMutation.mutate()}
            >
              Ask
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState message="Create a session to inspect the repository or propose a plan." />
      )}

      {sessionQuery.isLoading ? <LoadingRow label="Loading session…" /> : null}

      {detail?.messages && detail.messages.length > 0 ? (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold mb-2">Messages</h3>
          <ul className="space-y-2 text-sm">
            {detail.messages.map((message, index) => (
              <li key={message.id ?? `${message.role}-${index}`} className="border-b border-gray-100 pb-2">
                <Badge>{message.role}</Badge>
                <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{message.content}</pre>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail?.actions && detail.actions.length > 0 ? (
        <div className="rounded-xl border bg-white overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Proposed and executed Agent actions</caption>
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Sensitivity</th>
                <th className="px-3 py-2">Proposed operation</th>
                <th className="px-3 py-2">Execution</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detail.actions.map((action) => (
                <tr key={action.id} data-testid={`agent-action-${action.id}`}>
                  <td className="px-3 py-2 font-medium">{action.tool}</td>
                  <td className="px-3 py-2"><Badge>{workflowLabel(action)}</Badge></td>
                  <td className="px-3 py-2">{action.sensitivity}</td>
                  <td className="px-3 py-2 text-xs text-gray-700">
                    {formatResult((action.result as { objective?: string; filesAffected?: string[] } | null)?.objective
                      || (action.input as { filename?: string } | undefined)?.filename
                      || action.tool)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatResult((action.result as { execution?: unknown } | null)?.execution ?? '—')}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {formatResult((action.result as { verification?: unknown; error?: string } | null)?.verification
                      ?? (action.result as { error?: string } | null)?.error
                      ?? '—')}
                  </td>
                  <td className="px-3 py-2">
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-gray-700">
                      {formatResult(action.result)}
                    </pre>
                  </td>
                  <td className="px-3 py-2">
                    {action.status === 'PROPOSED' ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="primary"
                          disabled={decideMutation.isPending}
                          onClick={() => decideMutation.mutate({ action, decision: 'approve' })}
                        >
                          Approve
                        </Button>
                        <Button
                          disabled={decideMutation.isPending}
                          onClick={() => decideMutation.mutate({ action, decision: 'reject' })}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : action.approvals && action.approvals.length > 0 ? (
                      <span className="text-xs text-gray-500">{action.approvals[0].decision}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
