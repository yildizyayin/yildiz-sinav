// Every mutation is preceded by a trigger-validated owner assertion in the
// SAME D1 transaction. Revocation cannot interleave between assertion and write.
export function fenceExamDatabase(db:D1Database,examId:string,token:string):D1Database{
  const originals=new WeakMap<object,D1PreparedStatement>();
  async function batch(statements:D1PreparedStatement[]):Promise<D1Result[]>{
    const rows=await db.batch([
      db.prepare('INSERT INTO exam_operation_write_guards(owner_token,exam_id) VALUES(?,?)').bind(token,examId),
      ...statements.map(statement=>originals.get(statement)||statement),
      db.prepare('DELETE FROM exam_operation_write_guards WHERE owner_token=?').bind(token),
    ]);
    return rows.slice(1,-1);
  }
  function prepare(sql:string,statement=db.prepare(sql)):D1PreparedStatement{
    const readOnly=/^\s*(SELECT|EXPLAIN)\b/i.test(sql);
    const wrapped={
      bind:(...values:unknown[])=>prepare(sql,statement.bind(...values)),
      run:async()=> (await batch([statement]))[0],
      all:async()=>readOnly?statement.all():(await batch([statement]))[0],
      first:async(column?:string)=>{
        if(readOnly)return column===undefined?statement.first():statement.first(column);
        const row=(await batch([statement]))[0].results?.[0] as Record<string,unknown>|undefined;
        return column?row?.[column]??null:row??null;
      },
      raw:()=>{throw new Error('FENCED_RAW_NOT_SUPPORTED')},
    } as unknown as D1PreparedStatement;
    originals.set(wrapped,statement);return wrapped;
  }
  return new Proxy(db,{get(target,key){
    if(key==='prepare')return prepare;
    if(key==='batch')return batch;
    if(key==='exec'||key==='withSession')return ()=>{throw new Error('FENCED_DATABASE_API_NOT_SUPPORTED')};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
}
