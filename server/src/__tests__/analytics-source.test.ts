import { describe, it, expect } from 'vitest';
import { classifyTrafficSource } from '../services/analytics.js';

describe('first-touch traffic source', () => {
  it('separates tagged Google Ads and organic visits', () => {
    expect(classifyTrafficSource('google', 'cpc')).toBe('Google Ads');
    expect(classifyTrafficSource('google', 'PPC')).toBe('Google Ads');
    expect(classifyTrafficSource('google', 'organic')).toBe('Google orgânico');
  });

  it('does not guess whether legacy Google visits were paid or organic', () => {
    expect(classifyTrafficSource('google.com.br', null)).toBe('Google (não identificado)');
    expect(classifyTrafficSource('google', null)).toBe('Google (não identificado)');
  });

  it('keeps other sources intact', () => {
    expect(classifyTrafficSource('instagram.com', null)).toBe('instagram');
    expect(classifyTrafficSource('direto', null)).toBe('direto');
    expect(classifyTrafficSource('notgoogle.example', 'cpc')).toBe('notgoogle.example');
  });
});
