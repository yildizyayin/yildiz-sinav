import {describe,expect,it} from 'vitest';
import {canManagePanelExperience,validPanelAccent,validSpecialDayWindow} from '../worker/panel-theme-entry';
import {attendanceSessionId,validAttendanceDate,validAttendanceStatus} from '../worker/school-operations-entry';

describe('panel experience governance',()=>{
 it('keeps theme and special-day management exclusive to Super Admin',()=>{
  expect(canManagePanelExperience('SUPER_ADMIN')).toBe(true);
  expect(canManagePanelExperience('INSTITUTION_MANAGER')).toBe(false);
  expect(canManagePanelExperience('STUDENT')).toBe(false);
 });
 it('accepts only bounded schedules and six-digit accent colors',()=>{
  expect(validSpecialDayWindow('2026-10-28T18:00','2026-10-30T00:00')).toBe(true);
  expect(validSpecialDayWindow('2026-10-30T00:00','2026-10-28T18:00')).toBe(false);
  expect(validPanelAccent('#C51F2E')).toBe(true);
  expect(validPanelAccent('red')).toBe(false);
 });
});

describe('attendance contracts',()=>{
 it('validates calendar dates and supported attendance states',()=>{
  expect(validAttendanceDate('2026-08-31')).toBe(true);
  expect(validAttendanceDate('2026-02-30')).toBe(false);
  expect(validAttendanceStatus('PRESENT')).toBe(true);
  expect(validAttendanceStatus('UNKNOWN')).toBe(false);
 });
 it('creates a stable id for the same class and day',()=>{
  expect(attendanceSessionId('class_8a','2026-08-31')).toBe('att_class_8a_2026-08-31');
 });
});
