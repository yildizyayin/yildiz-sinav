import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const file='src/pages/QuestionTeam.tsx';
const original=execFileSync('git',['show',`${process.env.ANUNEX_DESIGN_BASE||'491ea25b896100f7cbf84a19378e294f2bbbc35f'}:${file}`],{encoding:'utf8'});
const current=readFileSync(file,'utf8');
const prefix=s=>s.slice(s.indexOf("const base="),s.indexOf(' return <main'));
assert.equal(prefix(current),prefix(original),'State, effects, functions and permission checks changed');
// Undo only the explicitly permitted layout hooks and wrapper; compare whole source lines.
let normalized=current.replace("import './approved-question-team.css';\n",'')
 .replace('question-team approved-question-team','question-team')
 .replace('qt-summary qt-overview','qt-summary')
 .replace('qt-card qt-execution','qt-card')
 .replace("{tab==='jobs'&&<div className=\"qt-jobs-workspace\"><section className=\"qt-card qt-manual-task\">", "{tab==='jobs'&&<><section className=\"qt-card\">")
 .replace('qt-card qt-job-queue','qt-card')
 .replace('Bu yılda üretim işi bulunmuyor.</p>}</section></div>}', 'Bu yılda üretim işi bulunmuyor.</p>}</section></>}');
const lines=s=>s.split('\n').map(l=>l.trim()).filter(Boolean).sort();
assert.deepEqual(lines(normalized),lines(original),'Source changed beyond allowed layout moves and classes');
console.log('PASS: state/effect/API/role logic, JSX props and Turkish text preserved; presentation only.');
