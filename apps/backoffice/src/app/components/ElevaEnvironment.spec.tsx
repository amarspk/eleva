import { computeTimeOfDay } from './ElevaEnvironment';
import { getSkyGradient, WEATHER_LABELS, TIME_CLASS } from './ElevaEnvironment';

describe('ElevaEnvironment (ELEVA Tower — time & weather)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes night for late hours', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-18T23:30:00'));
    expect(computeTimeOfDay()).toBe('night');
  });

  it('computes morning for early hours', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-18T06:30:00'));
    expect(computeTimeOfDay()).toBe('morning');
  });

  it('computes day for midday', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-18T12:30:00'));
    expect(computeTimeOfDay()).toBe('day');
  });

  it('computes sunset for evening hours', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-18T18:30:00'));
    expect(computeTimeOfDay()).toBe('sunset');
  });

  it('maps each time-of-day to a sky gradient and env class', () => {
    (['morning', 'day', 'sunset', 'night'] as const).forEach(t => {
      expect(getSkyGradient(t)).toContain('linear-gradient');
      expect(TIME_CLASS[t]).toContain('env-');
    });
  });

  it('labels every weather state', () => {
    (['sunny', 'cloudy', 'overcast', 'rainy', 'foggy', 'stormy'] as const).forEach(w => {
      expect(WEATHER_LABELS[w].length).toBeGreaterThan(0);
    });
  });
});