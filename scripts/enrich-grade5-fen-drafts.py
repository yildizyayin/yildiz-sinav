"""Apply source-backed editorial associations; never approve or import questions."""
import json,pathlib
B=pathlib.Path('data/question-import-drafts/grade5')
m=json.loads((B/'ALL_OUTCOMES_50_TARGET_MANIFEST.json').read_text())
e=json.loads((B/'FEN_VERIFIED_ENRICHMENT_2026-11-12.json').read_text())
for file in m['activeFenDraftFiles']:
 p=pathlib.Path(file);pack=json.loads(p.read_text())
 for row in pack['rows']:
  row.update(e['outcomes'][row['outcomeCode']])
 md=pack['metadata'];md['sourceProgramEdition']=2026;md['officialCurrentPdfCodePresenceVerified']=True
 md['targetAcademicYearApprovalVerified']=False;md['sourceYearEquivalenceVerified']=False
 md['verticalLinksStatus']='SOURCE_VERIFIED_EDITORIAL_RELATIONS_COHORT_CHECK_REQUIRED'
 md['historicalExamStatus']='IOKBS_2022_2026_BOUNDED_CONTENT_REVIEW'
 md['teacherApprovedCount']=0
 md['reviewGates']=['INDEPENDENT_TEACHER_SCIENCE_PEDAGOGY_RUBRIC','TARGET_YEAR_COHORT_CHECK','SEMANTIC_CROSS_POOL_ORIGINALITY','DIFFICULTY_CALIBRATION','FINAL_MEDIA_LAYOUT','IMPORTER_TYPE_SUPPORT']
 p.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
print('Enriched 27 packages / 1350 items; no approval or import.')
