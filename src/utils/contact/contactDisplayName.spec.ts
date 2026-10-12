import { describe, it, expect } from 'vitest';
import { contactDisplayName } from './contactDisplayName';

describe('contactDisplayName', () => {
  it('keeps a real name', () => {
    expect(contactDisplayName('Ketty Theisen', '+554998146273')).toBe('Ketty Theisen');
    expect(contactDisplayName('Trip Angle 8')).toBe('Trip Angle 8');
  });

  it('formats a name that is only a phone number', () => {
    expect(contactDisplayName('5511936215328', '+5511936215328')).toBe('+55 11 93621-5328');
    expect(contactDisplayName('+554988206908')).toBe('+55 49 8820-6908');
  });

  it('falls back to the phone when there is no name', () => {
    expect(contactDisplayName('', '+5511936215328')).toBe('+55 11 93621-5328');
    expect(contactDisplayName(null, null)).toBeNull();
  });
});
