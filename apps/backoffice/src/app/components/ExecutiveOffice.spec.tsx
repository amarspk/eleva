import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExecutiveOffice } from './ExecutiveOffice';

const listSessions = jest.fn();
const createSession = jest.fn();
const getSession = jest.fn();
const invoke = jest.fn();
const approve = jest.fn();
const reject = jest.fn();

jest.mock('../lib/resources', () => ({
  agentApi: {
    listSessions: (...args: unknown[]) => listSessions(...args),
    createSession: (...args: unknown[]) => createSession(...args),
    getSession: (...args: unknown[]) => getSession(...args),
    invoke: (...args: unknown[]) => invoke(...args),
    approve: (...args: unknown[]) => approve(...args),
    reject: (...args: unknown[]) => reject(...args),
    chat: jest.fn(),
  },
}));

function renderOffice(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ExecutiveOffice />
    </QueryClientProvider>,
  );
}

describe('ExecutiveOffice', () => {
  beforeEach(() => {
    listSessions.mockReset();
    createSession.mockReset();
    getSession.mockReset();
    invoke.mockReset();
    approve.mockReset();
    reject.mockReset();
    listSessions.mockResolvedValue([]);
  });

  it('creates a session and displays a SAFE diagnostic result', async () => {
    createSession.mockResolvedValue({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'Executive Office', status: 'OPEN', userId: 'u1' });
    getSession.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Executive Office',
      status: 'OPEN',
      userId: 'u1',
      messages: [{ role: 'TOOL', content: 'ok:read_project_state' }],
      actions: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        tool: 'read_project_state',
        status: 'EXECUTED',
        sensitivity: 'SAFE',
        result: { content: '# PROJECT STATE' },
      }],
    });
    invoke.mockResolvedValue({
      tool: 'read_project_state',
      status: 'EXECUTED',
      executed: true,
    });
    renderOffice();
    fireEvent.click(screen.getByRole('button', { name: 'New session' }));
    await waitFor(() => expect(createSession).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('# PROJECT STATE')).toBeInTheDocument());
  });

  it('shows approve/reject for a proposed action', async () => {
    listSessions.mockResolvedValue([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'S', status: 'OPEN', userId: 'u1' }]);
    getSession.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'S',
      status: 'OPEN',
      userId: 'u1',
      messages: [],
      actions: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        tool: 'propose_plan',
        status: 'PROPOSED',
        sensitivity: 'SENSITIVE',
        result: { summary: 'Plan', executed: false },
      }],
    });
    approve.mockResolvedValue({ decision: 'APPROVED', executed: false });
    renderOffice();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(approve).toHaveBeenCalled());
  });

  it('exposes write_agent_note and shows execution/verification columns', async () => {
    listSessions.mockResolvedValue([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'S', status: 'OPEN', userId: 'u1' }]);
    getSession.mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'S',
      status: 'OPEN',
      userId: 'u1',
      messages: [],
      actions: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        tool: 'write_agent_note',
        status: 'COMPLETED',
        sensitivity: 'SENSITIVE',
        result: {
          workflowState: 'COMPLETED',
          objective: 'Write owner note',
          execution: { kind: 'write_agent_note', ran: true, path: 'docs/agent-workspace/owner-note.md' },
          verification: { passed: true },
        },
      }],
    });
    renderOffice();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'write_agent_note' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Proposed operation')).toBeInTheDocument());
    expect(screen.getByText('Verification')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'write_implementation_file' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'verify_implementation_file' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'analyze_implementation_file' })).toBeInTheDocument();
  });
});
