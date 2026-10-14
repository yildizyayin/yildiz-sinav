import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {questionOriginalityCandidates} from '../worker/lib/question-originality-search';
it('finds a distant canonical pool candidate beyond recent history and keeps private institution content out',async()=>{
 const db=new DatabaseSync(':memory:');try{db.exec("CREATE TABLE question_bank(id TEXT PRIMARY KEY,owner_type TEXT,stem_text TEXT,solution_text TEXT);");db.exec(readFileSync(new URL('../migrations/0108_question_originality_search.sql',import.meta.url),'utf8'));
 const insert=db.prepare('INSERT INTO question_bank VALUES(?,?,?,?)');insert.run('old','PLATFORM','Servis alternatifleri bütçe ve süre koşullarına göre karşılaştırılır.','İki koşulu birlikte sağlayan servis seçilir.');for(let i=0;i<30;i++)insert.run('recent'+i,'PLATFORM','Tamamen farklı bir geometrik şekil hakkında alıştırma.','Açıları karşılaştır.');insert.run('private','INSTITUTION','Servis alternatifleri bütçe ve süre koşullarına göre karşılaştırılır.','Private solution');
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)});
 const env={DB:{prepare}} as any;const result=await questionOriginalityCandidates(env,[{stemText:'Servis alternatifleri bütçe koşullarına uygun mu?'}]);expect(result.map(q=>q.id)).toContain('old');expect(result.map(q=>q.id)).not.toContain('private');expect(result.length).toBeLessThanOrEqual(8);
 db.prepare("UPDATE question_bank SET stem_text='Fotosentez süreci' WHERE id='old'").run();expect((await questionOriginalityCandidates(env,[{stemText:'Fotosentez süreci nasıl açıklanır?'}])).map(q=>q.id)).toContain('old');
 }finally{db.close()}
});
