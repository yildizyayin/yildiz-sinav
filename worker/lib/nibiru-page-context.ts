export type NibiruPageContext={pathname:string;pageKey:string;label:string;domain:'SYSTEM'|'INSTITUTION'|'EXAM'|'CONTENT'|'GUIDANCE'|'COACH'|'REPORT'|'GENERAL'};

const rules:Array<[RegExp,Omit<NibiruPageContext,'pathname'>]>=[
 [/^\/academic-target/,{pageKey:'ACADEMIC_TARGET',label:'Hedef ve Tercih Robotu',domain:'GUIDANCE'}],
 [/^\/guidance/,{pageKey:'GUIDANCE',label:'Rehberlik Ölçekleri',domain:'GUIDANCE'}],
 [/^\/student-growth/,{pageKey:'STUDENT_GROWTH',label:'Gelişim Yolculuğu',domain:'COACH'}],
 [/^\/assignments/,{pageKey:'ASSIGNMENTS',label:'Ödevler',domain:'COACH'}],
 [/^\/(wrong-answers|outcomes|worksheets|worksheet|content-center|my-books)/,{pageKey:'LEARNING_CONTENT',label:'İçerik ve Öğrenme',domain:'CONTENT'}],
 [/^\/(exam|my-results|optical|camera-test|calibration)/,{pageKey:'EXAM',label:'Sınav ve Optik',domain:'EXAM'}],
 [/^\/attendance/,{pageKey:'ATTENDANCE',label:'Yoklama ve Devamsızlık',domain:'INSTITUTION'}],
 [/^\/(students|classes|children|institutions|enterprise|users|teacher-assignments)/,{pageKey:'INSTITUTION',label:'Kurum ve Kullanıcılar',domain:'INSTITUTION'}],
 [/^\/(reports|weekly-summary)/,{pageKey:'REPORTS',label:'Raporlar',domain:'REPORT'}],
 [/^\/(licenses|premium|feature-lab|standard-readiness|scale|transfers)/,{pageKey:'SYSTEM',label:'Platform ve Lisans',domain:'SYSTEM'}],
 [/^\/$/,{pageKey:'HOME',label:'Ana Sayfa',domain:'GENERAL'}],
];

export function resolveNibiruPageContext(value:unknown):NibiruPageContext|null{const pathname=String(value||'').trim().slice(0,160).split(/[?#]/)[0];if(!pathname.startsWith('/')||pathname.includes('..')||pathname.startsWith('//'))return null;const matched=rules.find(([rx])=>rx.test(pathname));return matched?{pathname,...matched[1]}:{pathname,pageKey:'OTHER',label:'Bulunduğunuz Sayfa',domain:'GENERAL'}}
