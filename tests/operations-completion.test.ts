import { describe,expect,it } from 'vitest';
import { buildCapacityChunks } from '../worker/lib/operations-completion';

describe('operational completion contracts',()=>{
 it('splits the isolated 100k capacity run into Queue-safe chunks',()=>{
  const chunks=buildCapacityChunks('run_1');
  expect(chunks).toHaveLength(1000);
  expect(chunks[0]).toEqual({kind:'CAPACITY_TEST_CHUNK',runId:'run_1',chunkNo:0,startNo:1,rowCount:100});
  expect(chunks.at(-1)).toEqual({kind:'CAPACITY_TEST_CHUNK',runId:'run_1',chunkNo:999,startNo:99901,rowCount:100});
  expect(chunks.reduce((sum,x)=>sum+x.rowCount,0)).toBe(100000);
 });

 it('does not create an oversized final chunk',()=>{
  const chunks=buildCapacityChunks('run_2',251,100);
  expect(chunks.map(x=>x.rowCount)).toEqual([100,100,51]);
 });
});
