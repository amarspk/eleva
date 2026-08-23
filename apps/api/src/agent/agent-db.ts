/**
 * Narrow accessor for Agent models. The tracked generated client may lag the
 * schema until CI `prisma generate`. Casts only — no runtime behavior.
 */
export interface AgentDelegates {
  agentSession: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
  agentMessage: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  agentAction: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
  };
}

export function agentDb(client: unknown): AgentDelegates {
  return client as AgentDelegates;
}
