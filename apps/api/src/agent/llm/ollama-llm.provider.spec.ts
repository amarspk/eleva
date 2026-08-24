import { MODULE_METADATA } from '@nestjs/common/constants';
import { AgentModule } from '../agent.module';
import { AGENT_LLM_PROVIDER } from './agent-llm.types';
import {
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_MODEL,
  OllamaLlmProvider,
  resolveOllamaConfig,
} from './ollama-llm.provider';

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

describe('OllamaLlmProvider availability', () => {
  it('falls back to the heuristic planner when Ollama is unreachable', async () => {
    const provider = new OllamaLlmProvider();
    const decision = await provider.complete({
      messages: [{ role: 'user', content: 'أريد أضيف منتج جديد' }],
      projectStateExcerpt: '# PROJECT STATE',
      allowlistedSafeTools: ['read_project_state'],
    });
    expect(decision.intent).toBe('clarify');
    expect(decision.propose).toBe(false);
    expect(decision.safeTools).toEqual([]);
    expect(decision.questions.length).toBeGreaterThan(0);
  });

  it('does not execute apply_patch when a mocked Ollama response requests it', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
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
    }) as unknown as typeof fetch;
    try {
      const provider = new OllamaLlmProvider();
      const decision = await provider.complete({
        messages: [{ role: 'user', content: 'apply a patch' }],
        projectStateExcerpt: '# PROJECT STATE',
        allowlistedSafeTools: ['read_project_state'],
      });
      expect(decision.safeTools).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
