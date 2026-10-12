import {describe, expect, it, vi} from 'vitest';
import {evaluateScanBatch} from '../src/lib/evaluate-scan-batch';

describe('complete scan evaluation', () => {
  it('continues all server chunks before reporting completion', async () => {
    const request = vi.fn().mockResolvedValueOnce({done:false,processed:5,total:12}).mockResolvedValueOnce({done:false,processed:10,total:12}).mockResolvedValueOnce({done:true,processed:12,total:12});
    const progress = vi.fn();
    expect(await evaluateScanBatch(request, progress)).toMatchObject({done:true,processed:12});
    expect(request).toHaveBeenCalledTimes(3);
    expect(progress.mock.calls.map(([p])=>p.processed)).toEqual([5,10,12]);
  });
  it('stops on a server error and does not manufacture completion', async () => {
    const request = vi.fn().mockResolvedValueOnce({done:false,processed:5}).mockRejectedValueOnce(new Error('Sunucu kaydetmedi'));
    await expect(evaluateScanBatch(request)).rejects.toThrow('Sunucu kaydetmedi');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('stops a stalled evaluation instead of repeatedly sending requests', async () => {
    const request = vi.fn().mockResolvedValue({done:false,processed:5});
    await expect(evaluateScanBatch(request)).rejects.toThrow('ilerlemedi');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('accepts a zero-result completed response and legacy single request', async () => {
    expect(await evaluateScanBatch(async()=>({done:true,processed:0}))).toEqual({done:true,processed:0});
    expect(await evaluateScanBatch(async()=>({processed:2}))).toEqual({processed:2});
  });
});
