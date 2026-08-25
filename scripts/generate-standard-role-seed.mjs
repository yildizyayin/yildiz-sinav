import { mkdirSync,writeFileSync } from 'node:fs';
import { pbkdf2Sync,randomBytes } from 'node:crypto';
const out=['PRAGMA foreign_keys = ON;'];
const q=v=>v==null?'NULL':`'${String(v).replaceAll("'","''")}'`;
const pw=(password='Demo123!')=>{const salt=randomBytes(16);const hash=pbkdf2Sync(password,salt,100000,32,'sha256');return{salt:salt.toString('base64'),hash:hash.toString('base64')}};
const norm=s=>s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replaceAll('ı','i').replaceAll('ğ','g').replaceAll('ü','u').replaceAll('ş','s').replaceAll('ö','o').replaceAll('ç','c').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
function student({id,first,last,grade,section,classId,className,userId,username,email}){
 const h=pw();
 out.push(`INSERT OR REPLACE INTO classes(id,institution_id,season_id,grade_level,section,name,active) VALUES (${q(classId)},'inst_demo','season_2627',${grade},${q(section)},${q(className)},1);`);
 out.push(`INSERT OR REPLACE INTO student_entities(id,first_name,last_name,normalized_name,status,activated_at) VALUES (${q(id)},${q(first)},${q(last)},${q(norm(`${first} ${last}`))},'ACTIVE','2026-09-01');`);
 out.push(`INSERT OR REPLACE INTO student_enrollments(id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES (${q(`enr_${id}`)},${q(id)},'inst_demo','season_2627',${q(classId)},${q(String(5000+grade))},${grade},${q(section)},'ACTIVE');`);
 out.push(`INSERT OR REPLACE INTO users(id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active) VALUES (${q(userId)},'inst_demo',${q(id)},'STUDENT',${q(`${first} ${last}`)},${q(email)},${q(username)},${q(h.hash)},${q(h.salt)},100000,'PBKDF2-SHA256-v1',1);`);
}
student({id:'stu_std5',first:'Oyun',last:'Öğrencisi',grade:5,section:'A',classId:'class_5a',className:'5/A',userId:'usr_std5',username:'student5',email:'student5@demo.test'});
student({id:'stu_std12',first:'Hedef',last:'Öğrencisi',grade:12,section:'A',classId:'class_12a',className:'12/A',userId:'usr_std12',username:'student12',email:'student12@demo.test'});
mkdirSync('tmp',{recursive:true});writeFileSync('tmp/standard-role-seed.sql',out.join('\n')+'\n');console.log(`Generated ${out.length} Standard role SQL statements at tmp/standard-role-seed.sql`);
