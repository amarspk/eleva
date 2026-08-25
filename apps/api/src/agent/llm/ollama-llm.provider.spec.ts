import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentModule } from '../agent.module';
import { AGENT_LLM_PROVIDER } from './agent-llm.types';
import {
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_MODEL,
  OllamaLlmProvider,
  probeOllama,
  resolveOllamaConfig,
} from './ollama-llm.provider';

const input = {
  messages: [{ role: 'user' as const, content: 'أريد أضيف منتج جديد' }],
  projectStateExcerpt: '# PROJECT STATE',
  allowlistedSafeTools: ['read_project_state'],
};

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<unknown>): typeof fetch {
  return jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => handler(String(url), init)) as unknown as typeof fetch;
}

describe('Ollama configuration', () => {
  it('defaults to the verified local Windows Ollama host and qwen3:8b', () => {
    const config = resolveOllamaConfig({} as NodeJS.ProcessEnv);
    expect(config.host).toBe('http://127.0.0.1:11434');
    expect(config.model).toBe('qwen3:8b');
    expect(DEFAULT_OLLAMA_HOST).toBe('http://127.0.0.1:11434');
    expect(DEFAULT_OLLAMA_MODEL).toBe('qwen3:8b');
  });

  it('reads OLLAMA_HOST and OLLAMA_MODEL from the environment without hardcoding call sites', () => {
    const config = resolveOllamaConfig({
      OLLAMA_HOST: 'http://127.0.0.1:11434/',
      OLLAMA_MODEL: 'qwen3:8b',
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({ host: 'http://127.0.0.1:11434', model: 'qwen3:8b' });
  });
});

describe('AGENT_LLM_PROVIDER binding', () => {
  it('binds OllamaLlmProvider as the Agent LLM implementation', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AgentModule) as Array<
      { provide?: unknown; useClass?: unknown } | unknown
    >;
    const binding = providers.find(
      (item) => typeof item === 'object' && item !== null && (item as { provide?: unknown }).provide === AGENT_LLM_PROVIDER,
    ) as { provide: string; useClass: unknown };
    expect(binding.useClass).toBe(OllamaLlmProvider);
    expect(new OllamaLlmProvider().name).toBe('ollama');
  });
});

describe('Ollama health probe', () => {
  it('reports OLLAMA_UNAVAILABLE when the host cannot be reached', async () => {
    const health = await probeOllama({} as NodeJS.ProcessEnv, mockFetch(async () => {
      throw new Error('fetch failed');
    }));
    expect(health.status).toBe('OLLAMA_UNAVAILABLE');
    expect(health.reachable).toBe(false);
    expect(health.host).toBe(DEFAULT_OLLAMA_HOST);
    expect(health.model).toBe(DEFAULT_OLLAMA_MODEL);
  });

  it('reports OLLAMA_MODEL_MISSING when tags succeed without the configured model', async () => {
    const health = await probeOllama({} as NodeJS.ProcessEnv, mockFetch(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3:8b' }] }),
    })));
    expect(health.status).toBe('OLLAMA_MODEL_MISSING');
    expect(health.reachable).toBe(true);
    expect(health.modelPresent).toBe(false);
  });

  it('reports OLLAMA_AVAILABLE when tags include qwen3:8b', async () => {
    const health = await probeOllama({} as NodeJS.ProcessEnv, mockFetch(async () => ({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen3:8b' }] }),
    })));
    expect(health.status).toBe('OLLAMA_AVAILABLE');
    expect(health.modelPresent).toBe(true);
  });
});

describe('OllamaLlmProvider availability', () => {
  it('falls back to the heuristic planner when Ollama is unreachable and does not claim Ollama', async () => {
    const provider = new OllamaLlmProvider();
    const decision = await provider.complete(input, mockFetch(async () => {
      throw new Error('fetch failed');
    }));
    expect(decision.intent).toBe('clarify');
    expect(decision.providerUsed).toBe('heuristic');
    expect(decision.ollamaStatus).toBe('OLLAMA_UNAVAILABLE');
    expect(decision.propose).toBe(false);
    expect(decision.safeTools).toEqual([]);
    expect(decision.questions.length).toBeGreaterThan(0);
  });

  it('does not report Ollama success when chat fails after a healthy probe', async () => {
    const provider = new OllamaLlmProvider();
    const decision = await provider.complete(input, mockFetch(async (url) => {
      if (url.endsWith('/api/tags')) {
        return { ok: true, json: async () => ({ models: [{ name: 'qwen3:8b' }] }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    }));
    expect(decision.providerUsed).toBe('heuristic');
    expect(decision.ollamaStatus).toBe('OLLAMA_REQUEST_FAILED');
  });

  it('identifies a successful Ollama request as Ollama, not heuristic', async () => {
    const provider = new OllamaLlmProvider();
    const decision = await provider.complete({
      messages: [{ role: 'user', content: 'hello' }],
      projectStateExcerpt: '# PROJECT STATE',
      allowlistedSafeTools: ['read_project_state'],
    }, mockFetch(async (url) => {
      if (url.endsWith('/api/tags')) {
        return { ok: true, json: async () => ({ models: [{ name: 'qwen3:8b' }] }) };
      }
      return {
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              language: 'en',
              intent: 'inspect',
              reply: 'PROJECT_STATE loaded.',
              questions: [],
              safeTools: [{ tool: 'read_project_state', args: {} }],
              propose: false,
            }),
          },
        }),
      };
    }));
    expect(decision.providerUsed).toBe('ollama');
    expect(decision.ollamaStatus).toBe('OLLAMA_AVAILABLE');
    expect(decision.reply).toContain('PROJECT_STATE');
  });

  it('does not execute apply_patch when a mocked Ollama response requests it', async () => {
    const provider = new OllamaLlmProvider();
    const decision = await provider.complete({
      messages: [{ role: 'user', content: 'apply a patch' }],
      projectStateExcerpt: '# PROJECT STATE',
      allowlistedSafeTools: ['read_project_state'],
    }, mockFetch(async (url) => {
      if (url.endsWith('/api/tags')) {
        return { ok: true, json: async () => ({ models: [{ name: 'qwen3:8b' }] }) };
      }
      return {
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              language: 'en',
              intent: 'inspect',
              reply: 'patching',
              questions: [],
              safeTools: [{ tool: 'apply_patch', args: { path: 'apps/api/src/main.ts' } }],
              propose: false,
            }),
          },
        }),
      };
    }));
    expect(decision.safeTools).toEqual([]);
    expect(decision.providerUsed).toBe('ollama');
  });
});
