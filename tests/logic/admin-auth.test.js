import { describe, it, expect } from 'vitest';
import { isAuthorized, unauthorizedResponse } from '../../functions/_shared/adminAuth.js';

function req(headerValue) {
  return { headers: { get: (name) => (name === 'X-Admin-Password' ? headerValue : null) } };
}

describe('isAuthorized', () => {
  it('authorizes when the header exactly matches env.ADMIN_PASSWORD', () => {
    expect(isAuthorized(req('secret123'), { ADMIN_PASSWORD: 'secret123' })).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(isAuthorized(req('wrong'), { ADMIN_PASSWORD: 'secret123' })).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isAuthorized(req(null), { ADMIN_PASSWORD: 'secret123' })).toBe(false);
  });

  it('rejects when ADMIN_PASSWORD is not configured, even with a matching-looking header', () => {
    expect(isAuthorized(req(''), { ADMIN_PASSWORD: '' })).toBe(false);
    expect(isAuthorized(req(undefined), {})).toBe(false);
  });
});

describe('unauthorizedResponse', () => {
  it('is a 401 JSON response', async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });
});
