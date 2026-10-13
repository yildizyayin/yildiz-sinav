import {describe,it,expect} from 'vitest';
import {fiveYearOfficialHistory} from '../worker/lib/official-question-intelligence';
describe('verified last five official examination years',()=>{
 it('counts only facts within the five-year window',()=>{
  const result=fiveYearOfficialHistory([{exam_year:2020},{exam_year:2022},{exam_year:2022},{exam_year:2026}], [2022,2023,2024,2025,2026],2026);
  expect(result.lastFiveYearsCount).toBe(3);
  expect(result.fullyCovered).toBe(true);
  expect(result.perYear).toHaveLength(5);
  expect(result.perYear[1].count).toBe(0);
 });
 it('does not pretend missing official archive years are zero verified frequency',()=>{
  const result=fiveYearOfficialHistory([{exam_year:2025}], [2024,2025],2026);
  expect(result.fullyCovered).toBe(false);
  expect(result.coveredYears).toBe(2);
  expect(result.perYear[0].sourceAvailable).toBe(false);
 });
});
