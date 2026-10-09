// Authorization and the channel's published version belong in the same query.
// Never select MAX(version), and never fall back to mutable exam_results.
export const RESULT_NETWORK_SNAPSHOT_SQL = `SELECT s.*,ea.exam_id FROM result_access_identities peer
 JOIN result_network_institutions rni ON rni.id=peer.result_institution_id
 JOIN exam_administrations ea ON ea.id=peer.administration_id
 LEFT JOIN exam_result_snapshots s ON s.exam_id=ea.exam_id AND s.participant_id=peer.participant_id
  AND s.snapshot_version=ea.published_snapshot_version
 WHERE rni.meb_code=? AND peer.normalized_name=? AND peer.grade_level=?
 AND ((?<>'' AND peer.student_number_lookup_token=?) OR (?<>'' AND peer.tckn_lookup_token=?))
 AND peer.expires_at>CURRENT_TIMESTAMP AND ea.channel='RESULT_NETWORK' AND ea.status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements retired WHERE retired.administration_id=ea.id AND retired.retired_through_version>=ea.published_snapshot_version)`;

// Keep the same live authorization and version predicates, while omitting the
// large subject/outcome details from the list query's D1 response. JSON validity
// checks retain the detail reader's fail-closed behavior for incomplete payloads.
export const RESULT_NETWORK_SUMMARY_SQL = RESULT_NETWORK_SNAPSHOT_SQL.replace('SELECT s.*,ea.exam_id', `SELECT ea.exam_id,s.snapshot_version,
 ${['class','grade','institution','district','city','network','national'].flatMap(scope=>[`s.${scope}_rank`,`s.${scope}_count`]).join(',')},
 CASE WHEN json_valid(s.payload_json) THEN CASE WHEN json_extract(s.payload_json,'$.schemaVersion')=1
 AND json_type(s.payload_json,'$.exam')='object' AND json_type(s.payload_json,'$.subjects')='array' AND json_type(s.payload_json,'$.outcomes')='array'
 THEN json_object('schemaVersion',1,'exam',json_extract(s.payload_json,'$.exam'),'subjects',json('[]'),'outcomes',json('[]')) END END payload_json`);

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

// Institution scope is checked before reading the publication payload.
export const NETWORK_INSTITUTION_SNAPSHOT_SQL = `SELECT s.*,ea.exam_id FROM result_access_identities rai JOIN result_network_institutions rni ON rni.id=rai.result_institution_id JOIN exam_administrations ea ON ea.id=rai.administration_id LEFT JOIN exam_result_snapshots s ON s.participant_id=rai.participant_id AND s.exam_id=ea.exam_id AND s.snapshot_version=ea.published_snapshot_version WHERE ea.id=? AND ea.channel='RESULT_NETWORK' AND ea.status IN ('PUBLISHED','ARCHIVED') AND (rni.licensed_institution_id=? OR rni.meb_code=(SELECT code FROM institutions WHERE id=?)) AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements retired WHERE retired.administration_id=ea.id AND retired.retired_through_version>=ea.published_snapshot_version) ORDER BY s.net DESC,s.participant_id LIMIT 20000`;

// Same live access predicates as snapshot reads, but no large payload selected.
export const RESULT_NETWORK_ARTIFACT_ACCESS_SQL = RESULT_NETWORK_SNAPSHOT_SQL
 .replace('SELECT s.*,ea.exam_id', 'SELECT ea.id administration_id,ea.exam_id,s.participant_id,s.institution_id,s.snapshot_version,m.object_key,m.content_sha256')
 .replace(' WHERE rni.meb_code', ' LEFT JOIN result_artifact_manifest m ON m.administration_id=ea.id AND m.participant_id=s.participant_id AND m.snapshot_version=ea.published_snapshot_version WHERE rni.meb_code');

// One database round trip keeps fresh session and publication checks together.
// Authorization and private result responses are never cached.
export const RESULT_NETWORK_IDENTITY_SQL = "SELECT rai.id,rai.normalized_name,rai.grade_level,rai.student_number_lookup_token,rai.tckn_lookup_token,rni.meb_code,rni.display_name_snapshot FROM result_portal_sessions s JOIN result_access_identities rai ON rai.id=s.identity_id JOIN result_network_institutions rni ON rni.id=rai.result_institution_id WHERE s.token_hash=? AND s.ip_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND rai.expires_at>CURRENT_TIMESTAMP";
const authenticatedSummary = RESULT_NETWORK_SUMMARY_SQL
 .replace('SELECT ea.exam_id', 'SELECT ea.published_at,ea.id administration_id,ea.exam_id')
 .replace('FROM result_access_identities peer', 'FROM identity i JOIN result_access_identities peer ON 1=1')
 .replace('rni.meb_code=? AND peer.normalized_name=? AND peer.grade_level=?', 'rni.meb_code=i.meb_code AND peer.normalized_name=i.normalized_name AND peer.grade_level=i.grade_level')
 .replace("(?<>'' AND peer.student_number_lookup_token=?)", "(COALESCE(i.student_number_lookup_token,'')<>'' AND peer.student_number_lookup_token=i.student_number_lookup_token)")
 .replace("(?<>'' AND peer.tckn_lookup_token=?)", "(COALESCE(i.tckn_lookup_token,'')<>'' AND peer.tckn_lookup_token=i.tckn_lookup_token)");
export const RESULT_NETWORK_AUTHENTICATED_SUMMARY_SQL = `WITH identity AS (${RESULT_NETWORK_IDENTITY_SQL}),summaries AS (${authenticatedSummary})
 SELECT identity.*,summaries.* FROM identity LEFT JOIN summaries ON 1=1
 ORDER BY summaries.published_at DESC,summaries.administration_id LIMIT 50`;
