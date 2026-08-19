import schemaSql from '../migrations/0001_schema.sql?raw';
import type { Env } from './types';
import { hashPassword } from './lib/auth';

let bootstrapPromise: Promise<void> | null = null;

export function ensurePreviewDatabase(env: Env): Promise<void> {
  if (env.ENVIRONMENT !== 'staging') return Promise.resolve();
  if (!bootstrapPromise) bootstrapPromise = bootstrap(env).catch((error) => {
    bootstrapPromise = null;
    throw error;
  });
  return bootstrapPromise;
}

export async function previewState(env: Env): Promise<Record<string, unknown>> {
  await ensurePreviewDatabase(env);
  const [institutions, activeStudents, guestStudents, exams, participants, guestParticipants, results] = await Promise.all([
    count(env, 'institutions'),
    scalar(env, `SELECT count(*) c FROM student_entities WHERE status='ACTIVE'`),
    scalar(env, `SELECT count(*) c FROM student_entities WHERE status='GUEST'`),
    count(env, 'exams'),
    count(env, 'exam_participants'),
    scalar(env, `SELECT count(*) c FROM exam_participants WHERE participant_status='GUEST'`),
    count(env, 'exam_results'),
  ]);
  const repeatGuest = await env.DB.prepare(`SELECT ep.student_id, count(*) exam_count
    FROM exam_participants ep JOIN student_entities s ON s.id=ep.student_id
    WHERE s.status='GUEST' GROUP BY ep.student_id ORDER BY exam_count DESC LIMIT 1`).first<{ student_id: string; exam_count: number }>();
  return {
    ok: true,
    initialized: true,
    institutions,
    activeStudents,
    guestStudents,
    exams,
    participants,
    guestParticipants,
    results,
    repeatedGuestExamCount: repeatGuest?.exam_count ?? 0,
    expectedScenario: { activeStudents: 65, guestStudents: 45, exams: 20, participants: 2200, guestParticipants: 900 },
  };
}

async function bootstrap(env: Env): Promise<void> {
  const table = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='institutions'`).first<{ name: string }>();
  if (!table) await env.DB.exec(schemaSql);

  const seeded = await env.DB.prepare(`SELECT id FROM institutions WHERE id='inst-demo' LIMIT 1`).first();
  if (seeded) return;

  const now = new Date().toISOString();
  await batch(env, [
    env.DB.prepare(`INSERT INTO institutions (id,name,code,city,district,status) VALUES (?,?,?,?,?,'ACTIVE')`).bind('inst-demo','Demo Koleji','DEMO2026','İstanbul','Kartal'),
    env.DB.prepare(`INSERT INTO institution_seasons (id,institution_id,academic_year,status,started_at) VALUES (?,?,?,'ACTIVE',?)`).bind('season-demo','inst-demo','2026-2027',now),
    env.DB.prepare(`INSERT INTO classes (id,institution_id,season_id,grade_level,section,name) VALUES (?,?,?,?,?,?)`).bind('class-8a','inst-demo','season-demo',8,'A','8/A'),
    env.DB.prepare(`INSERT INTO classes (id,institution_id,season_id,grade_level,section,name) VALUES (?,?,?,?,?,?)`).bind('class-8b','inst-demo','season-demo',8,'B','8/B'),
    env.DB.prepare(`INSERT INTO classes (id,institution_id,season_id,grade_level,section,name) VALUES (?,?,?,?,?,?)`).bind('class-8c','inst-demo','season-demo',8,'C','8/C'),
    env.DB.prepare(`INSERT INTO subjects (id,code,name,category) VALUES (?,?,?,?)`).bind('sub-mat','MAT','Matematik','SAYISAL'),
    env.DB.prepare(`INSERT INTO subjects (id,code,name,category) VALUES (?,?,?,?)`).bind('sub-tur','TUR','Türkçe','SÖZEL'),
    env.DB.prepare(`INSERT INTO subjects (id,code,name,category) VALUES (?,?,?,?)`).bind('sub-fen','FEN','Fen Bilimleri','SAYISAL'),
    env.DB.prepare(`INSERT INTO institution_license_state (id,institution_id,season_id,licensed_student_limit,licensed_student_count,agreement_status) VALUES (?,?,?,?,?,'ACTIVE')`).bind('license-demo','inst-demo','season-demo',65,65),
    env.DB.prepare(`INSERT INTO scoring_rules (id,code,name,authority,official) VALUES (?,?,?,?,0)`).bind('score-demo','DEMO_NET','Demo Net Kuralı','DEMO'),
    env.DB.prepare(`INSERT INTO scoring_rule_versions (id,rule_id,academic_year,version,verified,source_url,config_json) VALUES (?,?,?,?,1,?,?)`).bind('score-demo-v1','score-demo','2026-2027','1','demo:synthetic',JSON.stringify({ type:'wrong_divisor', defaultWrongDivisor:4 })),
    env.DB.prepare(`INSERT INTO curriculum_versions (id,academic_year,grade_level,program_version,authority,verified) VALUES (?,?,?,?,?,0)`).bind('curr-demo','2026-2027',8,'DEMO-V1','DEMO'),
  ]);

  const outcomes = [
    ['out-mat-1','sub-mat','Üslü ifadelerle işlem yapar.','Üslü İfadeler'],
    ['out-mat-2','sub-mat','Kareköklü ifadeleri yorumlar.','Kareköklü İfadeler'],
    ['out-tur-1','sub-tur','Metnin ana düşüncesini belirler.','Anlama'],
    ['out-fen-1','sub-fen','DNA ve genetik kod ilişkisini açıklar.','DNA ve Genetik Kod'],
  ];
  await batch(env, outcomes.map(([id,subject,title,topic]) => env.DB.prepare(`INSERT INTO outcomes (id,curriculum_version_id,subject_id,grade_level,code,topic,title,official) VALUES (?,?,?,?,?,?,?,0)`)
    .bind(id,'curr-demo',subject,8,id.toUpperCase(),topic,title)));

  const students: D1PreparedStatement[] = [];
  for (let i = 1; i <= 65; i++) {
    const id = `stu-a-${pad(i)}`;
    const first = `Aktif${pad(i)}`;
    const last = 'Öğrenci';
    const classId = i <= 33 ? 'class-8a' : 'class-8b';
    const section = i <= 33 ? 'A' : 'B';
    students.push(
      env.DB.prepare(`INSERT INTO student_entities (id,first_name,last_name,normalized_name,status,activated_at) VALUES (?,?,?,?, 'ACTIVE', ?)`).bind(id,first,last,`${first} ${last}`.toLocaleLowerCase('tr-TR'),now),
      env.DB.prepare(`INSERT INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES (?,?,?,?,?,?,?,?, 'ACTIVE')`).bind(`enr-a-${pad(i)}`,id,'inst-demo','season-demo',classId,String(1000+i),8,section),
    );
  }
  for (let i = 1; i <= 45; i++) {
    const id = `stu-g-${pad(i)}`;
    const first = `Misafir${pad(i)}`;
    const last = 'Öğrenci';
    students.push(
      env.DB.prepare(`INSERT INTO student_entities (id,first_name,last_name,normalized_name,status) VALUES (?,?,?,?, 'GUEST')`).bind(id,first,last,`${first} ${last}`.toLocaleLowerCase('tr-TR')),
      env.DB.prepare(`INSERT INTO student_enrollments (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status) VALUES (?,?,?,?,?,?,?,?, 'ACTIVE')`).bind(`enr-g-${pad(i)}`,id,'inst-demo','season-demo','class-8c',String(2000+i),8,'C'),
      env.DB.prepare(`INSERT INTO guest_profiles (student_id,last_seen_at,match_notes) VALUES (?,?,?)`).bind(id,now,'Synthetic preview guest identity'),
    );
  }
  await batch(env, students, 80);

  const passwordUsers: Array<{id:string; role:string; display:string; email:string; student?:string}> = [
    { id:'usr-super', role:'SUPER_ADMIN', display:'Demo Super Admin', email:'super@demo.test' },
    { id:'usr-manager', role:'INSTITUTION_MANAGER', display:'Demo Kurum Yöneticisi', email:'manager@demo.test' },
    { id:'usr-math', role:'TEACHER', display:'Demo Matematik Öğretmeni', email:'math@demo.test' },
    { id:'usr-guidance', role:'GUIDANCE_TEACHER', display:'Demo Rehber Öğretmeni', email:'guidance@demo.test' },
    { id:'usr-student', role:'STUDENT', display:'Aktif01 Öğrenci', email:'student1@demo.test', student:'stu-a-01' },
    { id:'usr-parent', role:'PARENT', display:'Demo Veli', email:'parent1@demo.test' },
  ];
  for (const user of passwordUsers) {
    const pass = await hashPassword('Demo123!');
    await env.DB.prepare(`INSERT INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`)
      .bind(user.id,user.role==='SUPER_ADMIN'?null:'inst-demo',user.student??null,user.role,user.display,user.email,user.email,pass.hash,pass.salt,pass.iterations,'PBKDF2-SHA256-v1').run();
  }
  await batch(env, [
    env.DB.prepare(`INSERT INTO parent_student_links (id,parent_user_id,student_id,relationship,active) VALUES (?,?,?,?,1)`).bind('parent-link-1','usr-parent','stu-a-01','Veli'),
    env.DB.prepare(`INSERT INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES (?,?,?,?,?,?, 'SUBJECT',1)`).bind('ta-math-a','usr-math','inst-demo','season-demo','class-8a','sub-mat'),
    env.DB.prepare(`INSERT INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES (?,?,?,?,?,?, 'SUBJECT',1)`).bind('ta-math-b','usr-math','inst-demo','season-demo','class-8b','sub-mat'),
    env.DB.prepare(`INSERT INTO teacher_assignments (id,user_id,institution_id,season_id,class_id,subject_id,assignment_type,active) VALUES (?,?,?,?,?,NULL, 'GUIDANCE',1)`).bind('ta-guide-a','usr-guidance','inst-demo','season-demo','class-8a'),
  ]);

  for (let e = 1; e <= 20; e++) {
    const examId = `exam-${pad(e)}`;
    const date = new Date(Date.UTC(2026, 7, Math.min(e, 19) + 1)).toISOString().slice(0,10);
    await batch(env, [
      env.DB.prepare(`INSERT INTO exams (id,owner_type,institution_id,academic_year,title,exam_type,grade_level,exam_date,status,scoring_rule_version_id,sponsor_mode,created_by) VALUES (?,'CENTRAL',NULL,'2026-2027',?,'DEMO',8,?,?,?,'ADMIN_SPONSORED','usr-super')`).bind(examId,`Demo Türkiye Geneli 8 - ${pad(e)}`,date,e===20?'ACTIVE':'CLOSED','score-demo-v1'),
      env.DB.prepare(`INSERT INTO exam_institutions (id,exam_id,institution_id,enabled) VALUES (?,?,?,1)`).bind(`exinst-${pad(e)}`,examId,'inst-demo'),
      env.DB.prepare(`INSERT INTO exam_booklets (id,exam_id,code,active) VALUES (?,?,?,1)`).bind(`book-${pad(e)}-a`,examId,'A'),
      env.DB.prepare(`INSERT INTO exam_booklets (id,exam_id,code,active) VALUES (?,?,?,1)`).bind(`book-${pad(e)}-b`,examId,'B'),
    ]);
    if (e === 20) {
      await batch(env, [
        env.DB.prepare(`INSERT INTO exam_subjects (id,exam_id,subject_id,question_count,sort_order,wrong_divisor) VALUES (?,?,?,?,?,4)`).bind('es-mat',examId,'sub-mat',5,1),
        env.DB.prepare(`INSERT INTO exam_subjects (id,exam_id,subject_id,question_count,sort_order,wrong_divisor) VALUES (?,?,?,?,?,4)`).bind('es-tur',examId,'sub-tur',5,2),
        env.DB.prepare(`INSERT INTO exam_subjects (id,exam_id,subject_id,question_count,sort_order,wrong_divisor) VALUES (?,?,?,?,?,4)`).bind('es-fen',examId,'sub-fen',5,3),
      ]);
      const questionStatements: D1PreparedStatement[] = [];
      const subjectDefs = [['sub-mat','MAT','out-mat-1'],['sub-tur','TUR','out-tur-1'],['sub-fen','FEN','out-fen-1']];
      let globalNo = 1;
      for (const [subject,code,outcome] of subjectDefs) {
        for (let q = 1; q <= 5; q++) {
          const qid = `q-${code}-${q}`;
          questionStatements.push(
            env.DB.prepare(`INSERT INTO exam_questions (id,exam_id,subject_id,question_no,global_no) VALUES (?,?,?,?,?)`).bind(qid,examId,subject,q,globalNo++),
            env.DB.prepare(`INSERT INTO answer_keys (id,exam_question_id,booklet_code,correct_answer) VALUES (?,?,?,?)`).bind(`ak-${code}-${q}-a`,qid,'A','ABCDE'[(q-1)%5]),
            env.DB.prepare(`INSERT INTO answer_keys (id,exam_question_id,booklet_code,correct_answer) VALUES (?,?,?,?)`).bind(`ak-${code}-${q}-b`,qid,'B','EDCBA'[(q-1)%5]),
            env.DB.prepare(`INSERT INTO question_outcomes (exam_question_id,outcome_id) VALUES (?,?)`).bind(qid,outcome),
          );
        }
      }
      await batch(env, questionStatements, 80);
    }
  }

  const participantStatements: D1PreparedStatement[] = [];
  for (let e = 1; e <= 20; e++) {
    const examId = `exam-${pad(e)}`;
    for (let i = 1; i <= 65; i++) {
      const studentId = `stu-a-${pad(i)}`;
      const participantId = `p-${pad(e)}-a-${pad(i)}`;
      const section = i <= 33 ? 'A' : 'B';
      const net = 20 + ((i + e) % 45) + e * 0.2;
      participantStatements.push(
        env.DB.prepare(`INSERT INTO exam_participants (id,exam_id,institution_id,season_id,student_id,student_number_snapshot,name_snapshot,class_snapshot,booklet_code,participant_status) VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE')`).bind(participantId,examId,'inst-demo','season-demo',studentId,String(1000+i),`Aktif${pad(i)} Öğrenci`,`8/${section}`,i%2?'A':'B'),
        env.DB.prepare(`INSERT INTO exam_results (id,participant_id,scoring_rule_version_id,correct_count,wrong_count,blank_count,net,score,success_percent,institution_rank) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(`r-${participantId}`,participantId,'score-demo-v1',50,20,10,net,null,Math.min(100,net),i),
      );
    }
    for (let i = 1; i <= 45; i++) {
      const studentId = `stu-g-${pad(i)}`;
      const participantId = `p-${pad(e)}-g-${pad(i)}`;
      const net = 15 + ((i + e) % 35) + e * 0.15;
      participantStatements.push(
        env.DB.prepare(`INSERT INTO exam_participants (id,exam_id,institution_id,season_id,student_id,student_number_snapshot,name_snapshot,class_snapshot,booklet_code,participant_status) VALUES (?,?,?,?,?,?,?,?,?,'GUEST')`).bind(participantId,examId,'inst-demo','season-demo',studentId,String(2000+i),`Misafir${pad(i)} Öğrenci`,'8/C',i%2?'A':'B'),
        env.DB.prepare(`INSERT INTO exam_results (id,participant_id,scoring_rule_version_id,correct_count,wrong_count,blank_count,net,score,success_percent,institution_rank) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(`r-${participantId}`,participantId,'score-demo-v1',40,25,15,net,null,Math.min(100,net),65+i),
      );
    }
  }
  await batch(env, participantStatements, 80);

  const outcomeStatements: D1PreparedStatement[] = [];
  const outcomeIds = ['out-mat-1','out-mat-2','out-tur-1','out-fen-1'];
  for (let e = 16; e <= 20; e++) {
    for (let oi = 0; oi < outcomeIds.length; oi++) {
      const evidence = 4;
      const correct = oi === 0 ? 1 : oi === 1 ? 4 : oi === 2 ? 3 : 2;
      const rate = correct/evidence;
      outcomeStatements.push(env.DB.prepare(`INSERT INTO outcome_results (id,student_id,exam_id,outcome_id,evidence_count,correct_count,success_rate,mastery_status) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(`or-${pad(e)}-${oi}`,'stu-a-01',`exam-${pad(e)}`,outcomeIds[oi],evidence,correct,rate,rate<0.6?'DEVELOPING':'STRONG'));
    }
  }
  await batch(env, outcomeStatements);

  await batch(env, [
    env.DB.prepare(`INSERT INTO optical_templates (id,name,vendor,status,active) VALUES ('opt-demo','Demo Genel CSV','Demo','READY',1)`),
    env.DB.prepare(`INSERT INTO optical_template_versions (id,template_id,version,parser_definition,camera_geometry,print_fields,fiducials,active) VALUES (?,?,?,?,?,?,?,1)`).bind('opt-demo-v1','opt-demo','1',JSON.stringify({type:'delimited',delimiter:','}),null,JSON.stringify({student_number:true,name:true,class:true}),null),
    env.DB.prepare(`INSERT INTO optical_templates (id,name,vendor,status,active) VALUES ('opt-129','Optik 129',NULL,'NEEDS_DEFINITION',1)`),
    env.DB.prepare(`INSERT INTO optical_templates (id,name,vendor,status,active) VALUES ('opt-840','Optik 840',NULL,'NEEDS_DEFINITION',1)`),
    env.DB.prepare(`INSERT INTO optical_templates (id,name,vendor,status,active) VALUES ('opt-3d-tyt','3D TYT',NULL,'NEEDS_DEFINITION',1)`),
    env.DB.prepare(`INSERT INTO printer_profiles (id,institution_id,name,physical_printer_hint,active) VALUES ('printer-canon-demo','inst-demo','Canon Öğretmenler Odası','Canon demo profili',1)`),
    env.DB.prepare(`INSERT INTO printer_optical_calibrations (id,printer_profile_id,optical_template_version_id,status,offset_x_mm,offset_y_mm,scale_x,scale_y,rotation_deg,attempt_count,verified_at) VALUES ('cal-demo','printer-canon-demo','opt-demo-v1','READY',0.25,-0.25,1,1,0,2,?)`).bind(now),
    env.DB.prepare(`INSERT INTO worksheets (id,academic_year,grade_level,track,sequence_no,title,status) VALUES ('ws-num-1','2026-2027',8,'NUMERIC',1,'8. Sınıf Sayısal Föy 1','PUBLISHED')`),
    env.DB.prepare(`INSERT INTO worksheets (id,academic_year,grade_level,track,sequence_no,title,status) VALUES ('ws-ver-1','2026-2027',8,'VERBAL',1,'8. Sınıf Sözel Föy 1','PUBLISHED')`),
    env.DB.prepare(`INSERT INTO worksheet_subjects (id,worksheet_id,subject_id,question_count) VALUES ('wss-num-mat','ws-num-1','sub-mat',20)`),
    env.DB.prepare(`INSERT INTO worksheet_subjects (id,worksheet_id,subject_id,question_count) VALUES ('wss-num-fen','ws-num-1','sub-fen',20)`),
    env.DB.prepare(`INSERT INTO worksheet_subjects (id,worksheet_id,subject_id,question_count) VALUES ('wss-ver-tur','ws-ver-1','sub-tur',20)`),
  ]);
}

async function count(env: Env, table: string): Promise<number> {
  return scalar(env, `SELECT count(*) c FROM ${table}`);
}

async function scalar(env: Env, sql: string): Promise<number> {
  const row = await env.DB.prepare(sql).first<{ c: number }>();
  return Number(row?.c ?? 0);
}

async function batch(env: Env, statements: D1PreparedStatement[], chunkSize = 60): Promise<void> {
  for (let i = 0; i < statements.length; i += chunkSize) {
    await env.DB.batch(statements.slice(i, i + chunkSize));
  }
}

function pad(value: number): string {
  return String(value).padStart(2,'0');
}
