import { describe, expect, it } from 'vitest';
import { resolvePreference } from './theme';

describe('resolvePreference', () => {
  it('an explicit choice always wins', () => {
    expect(resolvePreference('light', false)).toBe('light');
    expect(resolvePreference('dark', true)).toBe('dark');
  });

  it('system (or unset) follows the OS preference', () => {
    expect(resolvePreference('system', true)).toBe('light');
    expect(resolvePreference('system', false)).toBe('dark');
    expect(resolvePreference(null, true)).toBe('light');
    expect(resolvePreference(null, false)).toBe('dark');
  });
});
