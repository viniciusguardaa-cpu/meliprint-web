import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCodeVerifier, generateCodeChallenge, getAuthUrl } from '../services/mercadolivre.js';

describe('OAuth PKCE + state', () => {
  it('generates a code verifier with sufficient entropy', () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();
    expect(v1).not.toBe(v2);
    expect(v1.length).toBeGreaterThanOrEqual(32);
  });

  it('generates a deterministic code challenge from a verifier (S256)', () => {
    const verifier = 'test-verifier-123';
    const challenge = generateCodeChallenge(verifier);
    // S256 challenge is base64url(sha256(verifier))
    expect(challenge).not.toBe(verifier);
    // Same verifier → same challenge
    expect(generateCodeChallenge(verifier)).toBe(challenge);
  });

  it('includes state in the auth URL', () => {
    const url = getAuthUrl('client123', 'http://localhost:3001/callback', 'challengeABC', 'stateXYZ');
    expect(url).toContain('client_id=client123');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain('code_challenge=challengeABC');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('state=stateXYZ');
  });

  it('different states produce different URLs', () => {
    const url1 = getAuthUrl('c', 'r', 'ch', 'state1');
    const url2 = getAuthUrl('c', 'r', 'ch', 'state2');
    expect(url1).not.toBe(url2);
    expect(url1).toContain('state=state1');
    expect(url2).toContain('state=state2');
  });
});
