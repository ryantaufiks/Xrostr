import { describe, expect, it } from 'vitest';
import { distanceMeters, withinGeofence } from './geo.js';

describe('distanceMeters', () => {
  it('measures short distances on site scale', () => {
    // 0.001° of latitude ≈ 111 m everywhere.
    const d = distanceMeters(
      { latitude: -8.7457, longitude: 115.2149 },
      { latitude: -8.7447, longitude: 115.2149 },
    );
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('measures Jakarta to Singapore at about 905 km', () => {
    const d = distanceMeters(
      { latitude: -6.2088, longitude: 106.8456 },
      { latitude: 1.3521, longitude: 103.8198 },
    );
    expect(Math.round(d / 1000)).toBe(905);
  });
});

describe('withinGeofence', () => {
  it('accepts inside the radius and the capped accuracy margin only', () => {
    expect(withinGeofence(140, 150)).toBe(true);
    expect(withinGeofence(180, 150, 40)).toBe(true);
    expect(withinGeofence(260, 150, 2000)).toBe(false);
    expect(withinGeofence(151, 150)).toBe(false);
  });
});
