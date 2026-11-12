"""Read-only content checks; optional local QA report and review document outputs.
No network, AI, application database access, automatic approval or import.
"""
import json,pathlib,collections,hashlib,xml.etree.ElementTree as ET,html,re
from PIL import Image
B=pathlib.Path('data/question-import-drafts/grade5')
manifest=json.loads((B/'ALL_OUTCOMES_50_TARGET_MANIFEST.json').read_text())
fen=[x for x in manifest['items'] if x['subjectCode']=='FEN']
assert len(fen)==27
files=manifest['activeFenDraftFiles']
assert len(files)==27
assert len(files)==len(set(files))
by_code=collections.defaultdict(list);types=collections.Counter();seen={};duplicates=[];asset_refs=set()
new_rows=[];context_ids=set();rows_by_file={}
for file in files:
    data=json.loads(pathlib.Path(file).read_text());rows=data['rows'];rows_by_file[file]=len(rows)
    assert len(rows) in (25,50)
    for row in rows:
        by_code[row['outcomeCode']].append(row)
        typ=row.get('assessmentType','MULTIPLE_CHOICE');types[typ]+=1
        stem=' '.join(row['stem'].casefold().split())
        if stem in seen:duplicates.append([seen[stem],row.get('id',file)])
        else:seen[stem]=row.get('id',file)
        assert row['gradeLevel']==5 and 1<=row['difficultyLevel']<=6
        assert row.get('solution')
        assets=row.get('assetPaths',[]) or row.get('media',{}).get('assetPaths',[])
        if row.get('visualAssetPath'):assets=assets+[row['visualAssetPath']]
        for a in assets:
            assert pathlib.Path(a).is_file(),a
            asset_refs.add(a)
        if typ=='MULTIPLE_CHOICE':
            opts=[row['option'+k] for k in 'ABCD'];assert len(set(opts))==4
            assert row['correctAnswer'] in 'ABCD'
        else:
            assert row['status']=='DRAFT_NOT_APPROVED'
            assert row['sampleAnswer']
            assert sum(c['maxScore'] for c in row['rubric']['criteria'])==row['rubric']['maxScore']==4
            assert row['historicalExamEvidence']['verifiedCount'] is None
            assert not row['priorLearningLinks'] and not row['futureLearningLinks']
        if '_50_context_assessments_' in file:
            new_rows.append(row);context_ids.add(row['contextId'])
    if '_50_context_assessments_' in file:
        assert len(data['contexts'])==10
        assert set(r['contextId'] for r in rows)==set(c['contextId'] for c in data['contexts'])
        assert all(n==5 for n in collections.Counter(r['contextId'] for r in rows).values())
        assert len({r['id'] for r in rows})==50
        assert collections.Counter(r['assessmentType'] for r in rows)=={'OPEN_ENDED':40,'PERFORMANCE_TASK':10}
        assert set(r['difficultyLevel'] for r in rows)==set(range(1,7))
        assert data['metadata']['teacherApprovedCount']==0
assert set(by_code)==set(x['outcomeCode'] for x in fen)
assert all(len(by_code[x['outcomeCode']])==50 for x in fen)
assert not duplicates,duplicates
assert len(new_rows)==1250 and len(context_ids)==250
assert len({r['id'] for r in new_rows})==1250
assert sum(map(len,by_code.values()))==1350
assert manifest['targets']['fenDraftContentItems']==1350
assert manifest['targets']['reviewOnlyAssessmentItems']==1350
assert manifest['targets']['combinedDraftContentItems']==2500
for a in asset_refs:
    p=pathlib.Path(a)
    if p.suffix=='.svg':ET.parse(p)
    elif p.suffix.lower() in ('.jpg','.jpeg','.png'):
        im=Image.open(p);im.verify()
report={'checkedAt':'2026-11-12','outcomes':27,'items':1350,'types':dict(types),
    'newBatch':{'outcomes':25,'sharedContexts':250,'items':1250,'openEnded':1000,'performanceTasks':250},
    'eachOutcomeHas50':True,'exactDuplicateStems':0,'newItemIdsUnique':True,'referencedMediaFiles':len(asset_refs),
    'structuralChecks':'PASS','teacherApproved':0,'productionImportPerformed':False,
    'limitations':['Shared contexts have five related tasks; these are not 1250 independent stimuli.',
    'Exact-text deduplication covers these 1350 Fen items only; semantic and full-pool originality remain open.',
    'First 100 MC drafts replaced in active quota by new context tasks; historical files retained, not double-counted.',
    'Expert curriculum/process/answer/rubric/age-level review and difficulty calibration remain open.',
    'Official target academic year and PDF/web code-version equivalence remain open.',
    'Vertical class links, historical exam scans and final media/layout checks remain open.',
    'No full application tests/build run: this is a content-only change.'],
    'perOutcome':[{ 'code':x['outcomeCode'],'title':x['outcomeTitle'],'count':len(by_code[x['outcomeCode']]),'sourceUrl':x['sourceUrl']} for x in fen]}
(B/'FEN_FULL_STRUCTURAL_QA_2026-11-12.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

catalog=['# ANUNEX 5. sınıf Fen Bilimleri — tüm taslak içerik kataloğu',
 '12 Kasım 2026 · 27 resmî web öğrenme çıktısı · çıktı başına 50 · toplam 1.350 taslak içerik.',
 '**Öğretmen onaylı: 0. Soru havuzuna aktarılmadı. Taslak üretim kapsamı tamam; yayıma hazır değil.**',
 'Yeni 1.250 içerik, 250 farklı bağlamda beşer alt görevdir. Bir bağlamın beş sorusu, beş bağımsız senaryo olarak sayılmamalıdır.',
 'İlk 100 eski çoktan seçmeli taslak yeni açık uçlu/uygulamalı görevlerle yenilendi; eski dosyalar yalnız geçmiş kaydıdır. İlk ünitedeki önceki 20 ek görev kota toplamından ayrıdır.',
 '## Dosyalar ve kaynaklar',
 '| Kod | Öğrenme çıktısı | Adet | Taslak dosyası | Resmî kaynak |','|---|---|---:|---|---|']
for x in fen:
    code=x['outcomeCode'];short=code.replace('.','')
    names=[pathlib.Path(f).name for f in files if any(r['outcomeCode']==code for r in json.loads(pathlib.Path(f).read_text())['rows'])]
    links=' · '.join(f'[{n}]({n})' for n in names)
    catalog.append(f'| {code} | {x["outcomeTitle"]} | 50 | {links} | [MEB]({x["sourceUrl"]}) |')
catalog += ['## Türler',f'- Çoktan seçmeli: {types["MULTIPLE_CHOICE"]}',f'- Açık uçlu: {types["OPEN_ENDED"]}',f'- Performans görevi: {types["PERFORMANCE_TASK"]}',
 'Açık uçlu ve performans içerikleri mevcut çoktan seçmeli aktarım hattına verilmez. Önce panel/aktarımı bu türleri desteklemeli ve inceleme kapıları tamamlanmalıdır.',
 '## İnceleme sınırları']+['- '+s for s in report['limitations']]
catalog += ['## Görseller','Gerçek mikrograf ~delta tarafından çekilmiştir (30 Aralık 2022), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). [Kaynak dosya](https://commons.wikimedia.org/wiki/File:Elodea_cells_under_microscope.jpg). Yön düzeltme ve boyut küçültme yapıldı; fotoğrafın türevi aynı lisansla sunulur.',
 'Mevcut uzay fotoğrafları ve özgün bilimsel şemalar, ilgili görsel manifestlerine göre kullanılmalıdır. Şemalar gerçek fotoğraf veya ölçülmüş deney verisi diye sunulmaz.',
 '## Güncel bağlam','[UNEP 2026 Sıfır Atık Günü](https://www.unep.org/en/events/un-day/international-day-zero-waste-2026): gıda atığı teması. Okul, atık miktarı ve yerel kabul örnekleri kurgudur; resmî istatistik değildir.']
(B/'FEN_TUM_TASLAKLAR_KATALOG_2026-11-12.md').write_text('\n\n'.join(catalog[:6])+'\n\n'+'\n'.join(catalog[6:])+'\n')

# Local review document. Answers collapse independently; source/context remains with each item.
out=['<!doctype html><html lang="tr"><meta charset="utf-8"><title>ANUNEX Fen — taslak inceleme</title>',
 '<style>body{font:17px/1.6 system-ui,sans-serif;color:#193044;background:#f4f7fa;margin:0}main{max-width:1000px;margin:auto;padding:32px}header,article{background:white;border:1px solid #d9e1e8;border-radius:14px;padding:24px;margin:20px 0}h1,h2{line-height:1.25}small{color:#526574}img{max-width:100%;max-height:440px;object-fit:contain;display:block;margin:18px auto}pre{white-space:pre-wrap;font:inherit}summary{cursor:pointer}a{color:#135a83}nav a{display:inline-block;margin:5px 12px 5px 0}details{margin-top:12px}article{break-inside:avoid}@media print{body{background:white}main{max-width:none;padding:0}details>*{display:block}nav{display:none}}</style><main>',
 '<header><h1>ANUNEX · 5. sınıf Fen Bilimleri</h1><p>27 çıktı · 1.350 taslak içerik · öğretmen onaylı 0</p><p>İnceleme belgesi: yayıma veya doğrudan aktarıma hazır değildir. Yeni 25 çıktı paketinde 10 farklı bağlam × 5 alt görev kullanılır. İlk 100 eski MC taslak bu kapsamda yenilendi. Geçmiş sınav sayıları ve sınıflar arası eşleştirmeler doğrulanmadan doldurulmamıştır.</p><nav>']
for x in fen:out.append(f'<a href="#{x["outcomeCode"]}">{x["outcomeCode"]}</a>')
out.append('</nav></header>')
for x in fen:
    code=x['outcomeCode'];out.append(f'<section id="{code}"><h2>{code} · {html.escape(x["outcomeTitle"])}</h2><p><a href="{x["sourceUrl"]}">Resmî MEB web kaynağı</a> · 50 taslak</p>')
    for n,r in enumerate(by_code[code],1):
        out.append(f'<article><small>{code} · {n}/50 · {html.escape(r.get("assessmentType","MULTIPLE_CHOICE"))} · zorluk ön etiketi {r["difficultyLevel"]}</small><pre>{html.escape(r["stem"])}</pre>')
        assets=r.get('assetPaths',[]) or r.get('media',{}).get('assetPaths',[])
        if r.get('visualAssetPath'):assets=assets+[r['visualAssetPath']]
        for a in assets:
            rel=pathlib.Path(a).relative_to(B);out.append(f'<img src="{html.escape(str(rel))}" alt="Sorunun bilimsel görseli">')
            if 'elodea_delta' in a:out.append('<small>Elodea cells under microscope — ~delta; CC BY-SA 4.0; yön düzeltme/boyut küçültme. <a href="https://commons.wikimedia.org/wiki/File:Elodea_cells_under_microscope.jpg">Kaynak</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">Lisans</a></small>')
            elif 'earthrise_1968' in a:out.append('<small>Fotoğraf: NASA/Bill Anders · 24 Aralık 1968 · boyutu küçültülmüştür. <a href="https://science.nasa.gov/resource/apollo-8s-iconic-earthrise/">Kaynak</a></small>')
            elif 'dscovr_2015' in a:out.append('<small>Gözlem görüntüsü: NASA/NOAA · 16 Temmuz 2015 · özgün kayıttan seçilmiş ve boyutu küçültülmüş kare. <a href="https://science.nasa.gov/resource/from-a-million-miles-away-nasa-camera-shows-moon-crossing-face-of-earth/">Kaynak</a></small>')
        for letter in 'ABCDE':
            if r.get('option'+letter):out.append(f'<p>{letter}) {html.escape(r["option"+letter])}</p>')
        out.append('<details><summary>Örnek cevap / çözüm / puanlama</summary>')
        if r.get('correctAnswer'):out.append('<b>'+r['correctAnswer']+'</b>')
        out.append('<p>'+html.escape(r['solution'])+'</p>')
        if r.get('rubric'):
            for c in r['rubric']['criteria']:out.append(f'<p>{c["maxScore"]} puan: {html.escape(c["criterion"])}</p>')
            out.append('<small>Her ölçüt: 0 karşılanmıyor; 1 kısmi; 2 yeterli. Eşdeğer bilimsel yanıtlar kabul edilir. Aynı eksik iki kez cezalandırılmaz.</small>')
        out.append('</details></article>')
    out.append('</section>')
out.append('</main></html>')
(B/'FEN_TUM_TASLAKLAR_INCELEME_2026-11-12.html').write_text('\n'.join(out))
print(json.dumps({k:v for k,v in report.items() if k not in ('perOutcome','limitations')},ensure_ascii=False))
