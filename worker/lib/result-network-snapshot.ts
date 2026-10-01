// Authorization and the channel's published version belong in the same query.
// Never select MAX(version), and never fall back to mutable exam_results.
export const RESULT_NETWORK_SNAPSHOT_SQL = `SELECT s.*,ea.exam_id FROM result_access_identities peer
 JOIN result_network_institutions rni ON rni.id=peer.result_institution_id
 JOIN exam_administrations ea ON ea.id=peer.administration_id
 LEFT JOIN exam_result_snapshots s ON s.exam_id=ea.exam_id AND s.participant_id=peer.participant_id
  AND s.snapshot_version=ea.published_snapshot_version
 WHERE rni.meb_code=? AND peer.normalized_name=? AND peer.grade_level=?
 AND ((?<>'' AND peer.student_number_lookup_token=?) OR (?<>'' AND peer.tckn_lookup_token=?))
 AND peer.expires_at>CURRENT_TIMESTAMP AND ea.channel='RESULT_NETWORK' AND ea.status='PUBLISHED'`;

export function readNetworkSnapshot(raw:unknown):any|null {
 if(typeof raw!=='string')return null;
 try{const p=JSON.parse(raw);return p?.schemaVersion===1&&p.exam&&Array.isArray(p.subjects)&&Array.isArray(p.outcomes)?p:null}catch{return null}
}
export function snapshotSummary(row:any):any|null {
 const p=readNetworkSnapshot(row.payload_json);if(!p)return null;
 const ranks=Object.fromEntries(['class','grade','institution','district','city','network','national'].flatMap(scope=>[[`${scope}_rank`,row[`${scope}_rank`]], [`${scope}_count`,row[`${scope}_count`]]]));
 return {...p.exam,...ranks,exam_id:row.exam_id,snapshot_version:row.snapshot_version,general_rank:row.national_rank,participant_count:row.national_count};
}
export function snapshotDetail(payload:any){
 return {subjects:payload.subjects.map((s:any)=>({...s,subject:s.subject_name})),outcomes:payload.outcomes.slice(0,100).map((o:any)=>({...o,outcome:o.title,success_rate:o.evidence_count>0?100*o.correct_count/o.evidence_count:null,mastery_status:null})),optionalPhilosophy:payload.optionalPhilosophy||[]};
}
