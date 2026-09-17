import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { numericSubject } from '../worker/product-completion-entry';
import { gameXpForScore } from '../worker/lib/platform-expansion';

const migration=readFileSync(new URL('../migrations/0024_product_completion_center.sql',import.meta.url),'utf8');

describe('product completion contracts',()=>{
 it('locks the promised annual prices into the database contract',()=>{
  expect(migration).toContain("SET name='Ücretsiz / Standard',annual_price_try=0");
  expect(migration).toContain("SET annual_price_try=100 WHERE code='GOLD'");
  expect(migration).toContain("SET annual_price_try=300 WHERE code='PREMIUM'");
 });

 it('keeps future curriculum outcomes connected to the learning graph',()=>{
  expect(migration).toContain('trg_outcome_learning_node_insert');
  expect(migration).toContain("'ln_'||NEW.id");
 });

 it('defaults the annual plan to sixteen numeric and sixteen verbal issues',()=>{
  expect(migration).toContain('week_count INTEGER NOT NULL DEFAULT 16');
 });

 it('classifies numeric and verbal tracks deterministically',()=>{
  expect(numericSubject('MAT','Matematik')).toBe(true);
  expect(numericSubject('FEN','Fen Bilimleri')).toBe(true);
  expect(numericSubject('TUR','Türkçe')).toBe(false);
 });

 it('derives bounded game XP on the server instead of trusting the client',()=>{
  expect(gameXpForScore(80)).toEqual({score:80,xp:30});
  expect(gameXpForScore(999)).toEqual({score:100,xp:35});
  expect(gameXpForScore(-50)).toEqual({score:0,xp:10});
 });
});
