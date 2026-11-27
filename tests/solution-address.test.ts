import { expect, it } from 'vitest';
import { videoOrigin } from '../worker/lib/public-video';

/** cozum.yildizyayin.com (owner, 27 Nov 2026): QR codes point at the publisher's address once it is attached; until then the app's /c/. */
it('builds the QR base from the dedicated address, else the app host', () => {
  const req = new Request('https://app.anunex.com/api/teacher-tests/d1/solution-sheet');
  expect(videoOrigin({} as any, req)).toBe('https://app.anunex.com/c');
  expect(videoOrigin({ VIDEO_PUBLIC_ORIGIN: 'https://cozum.yildizyayin.com/' } as any, req)).toBe('https://cozum.yildizyayin.com');
  expect(videoOrigin({ VIDEO_PUBLIC_ORIGIN: 'http://insecure.example' } as any, req)).toBe('https://app.anunex.com/c');
  expect(videoOrigin({ VIDEO_PUBLIC_ORIGIN: 'https://evil.example/path' } as any, req)).toBe('https://app.anunex.com/c');
});
