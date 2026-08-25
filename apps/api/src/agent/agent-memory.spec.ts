import { formatMemoryExcerpt, parseMemoryKey, parseMemorySource, parseMemoryValue } from './agent-memory';

describe('Agent project memory parsing', () => {
  it('accepts a slug key and owner source', () => {
    expect(parseMemoryKey('m1-ollama')).toBe('m1-ollama');
    expect(parseMemorySource('PROJECT_STATE.md')).toBe('PROJECT_STATE.md');
    expect(parseMemoryValue('Health probe reports OLLAMA_UNAVAILABLE in Arena.')).toContain('Health probe');
  });

  it('rejects secret keys/values and tenant identifiers', () => {
    expect(() => parseMemoryKey('api-secret')).toThrow(/secrets/);
    expect(() => parseMemoryValue('password=hunter2')).toThrow(/secrets|restaurant/);
    expect(() => parseMemoryValue('customerId leaked')).toThrow(/customer/);
    expect(() => parseMemorySource('../.env')).toThrow(/source|secrets/);
  });

  it('formats an excerpt without inventing facts', () => {
    expect(formatMemoryExcerpt([])).toBe('PROJECT_MEMORY: (empty)');
    expect(formatMemoryExcerpt([{ key: 'a', value: 'b', source: 'owner', status: 'OWNER' }])).toContain('[a]');
  });
});
