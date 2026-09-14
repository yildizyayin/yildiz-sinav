import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api';

afterEach(() => vi.unstubAllGlobals());
describe('API client recovery', () => {
  it('explains connection failures without exposing the browser error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/api/config')).rejects.toMatchObject({name:'ApiError',code:'NETWORK_ERROR',status:0});
  });
  it('preserves cancellation so outdated searches do not report a connection failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new DOMException('Cancelled', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(api('/api/search', {signal:controller.signal})).rejects.toBe(error);
  });
  it('preserves server validation messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ok:false,error:{code:'VERIFICATION_FAILED',message:'Kod eşleşmedi.'}},{status:401})));
    await expect(api('/api/verify')).rejects.toMatchObject({code:'VERIFICATION_FAILED',status:401,message:'Kod eşleşmedi.'});
  });
  it('rejects non-JSON gateway responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>',{status:502})));
    await expect(api('/api/config')).rejects.toBeInstanceOf(ApiError);
  });
});
