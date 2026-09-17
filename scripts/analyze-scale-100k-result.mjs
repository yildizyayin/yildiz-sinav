import { readFileSync, writeFileSync } from 'node:fs';

const file=process.argv[2];
const durationMs=Number(process.argv[3]||0);
const target=process.argv[4]||'local';
if(!file)throw new Error('verify JSON path is required');
const raw=readFileSync(file,'utf8').trim();
const data=JSON.parse(raw);
let row=null;
function walk(value){
  if(row||value==null)return;
  if(Array.isArray(value)){for(const item of value)walk(item);return}
  if(typeof value==='object'){
    if(['student_count','participant_count','class_count','booklet_count'].every(k=>Object.prototype.hasOwnProperty.call(value,k))){row=value;return}
    for(const child of Object.values(value))walk(child);
  }
}
walk(data);
if(!row)throw new Error('Benchmark verification row could not be found');
const actual={students:Number(row.student_count),participants:Number(row.participant_count),classes:Number(row.class_count),booklets:Number(row.booklet_count)};
const expected={students:100000,participants:100000,classes:100,booklets:2};
for(const [key,value] of Object.entries(expected))if(actual[key]!==value)throw new Error(`${key} expected ${value}, got ${actual[key]}`);
const report=`# Anunex 100K Scale Benchmark\n\n- Target: ${target}\n- Students: ${actual.students.toLocaleString('en-US')}\n- Exam participants: ${actual.participants.toLocaleString('en-US')}\n- Classes: ${actual.classes}\n- Booklets: ${actual.booklets}\n- Participant generation wall time: ${durationMs} ms\n- D1 write chunk: 1,000 rows\n- Acceptance: PASS\n`;
writeFileSync('SCALE_100K_REPORT.md',report);
console.log(JSON.stringify({ok:true,target,durationMs,...actual}));
