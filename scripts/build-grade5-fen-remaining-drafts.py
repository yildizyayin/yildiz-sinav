"""Expand authored five-task context sets. No AI, network, import, approval or deploy.

Run from repository root: python3 scripts/build-grade5-fen-remaining-drafts.py
This is a deterministic formatter of authored content, not a question-generation agent.
"""
import json, pathlib, hashlib, html

B = pathlib.Path('data/question-import-drafts/grade5')
P = B / 'assets'
P.mkdir(parents=True, exist_ok=True)
author = json.loads((B/'FEN_REMAINING_AUTHORING_2026-11-12.json').read_text())
manifest = json.loads((B/'ALL_OUTCOMES_50_TARGET_MANIFEST.json').read_text())
registry = {x['outcomeCode']: x for x in manifest['items']}
event_url = 'https://www.unep.org/en/events/un-day/international-day-zero-waste-2026'

def svg(name, body, title, subtitle):
    text = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700">'
    text += '<rect width="1200" height="700" fill="#f7fafc"/><g font-family="DejaVu Sans,Arial,sans-serif" fill="#183247">'
    text += f'<text x="50" y="60" font-size="30" font-weight="bold">{html.escape(title)}</text>'
    text += f'<text x="50" y="105" font-size="20">{html.escape(subtitle)}</text>'
    text += body + '</g></svg>'
    path=P/name;path.write_text(text);return str(path)

scale='<rect x="420" y="155" width="300" height="460" rx="20" fill="white" stroke="#183247" stroke-width="3"/>'
for k in range(6):
    y=210+k*65
    scale+=f'<path d="M485 {y}h95" stroke="#183247" stroke-width="3"/><text x="600" y="{y+9}" font-size="25">{k*2} N</text>'
scale+='<path d="M395 405h80m-18-13 18 13-18 13" fill="none" stroke="#b94628" stroke-width="5"/>'
scale+='<text x="50" y="660" font-size="22">Öğretim şeması: İbre kırmızı okla gösterilmiştir. Gerçek araç fotoğrafı değildir.</text>'
force_asset=svg('FEN_BULK_force_scale.svg',scale,'Eşit bölmeli kuvvet ölçeği','0–10 N arası beş eşit aralık; kurgusal ölçüm kartı.')

light='<circle cx="150" cy="360" r="14" fill="#f1ba3f"/><text x="90" y="420" font-size="24">LED</text>'
for x in [390,620,850]:
    light+=f'<path d="M{x} 170v170m0 40v170" stroke="#526d7c" stroke-width="22"/>'
light+='<path d="M165 360h820" stroke="#b94628" stroke-width="4"/><path d="M970 350l15 10-15 10" stroke="#b94628" fill="none" stroke-width="4"/>'
light+='<text x="50" y="650" font-size="22">Düz çizgi ışık yolunun modelidir; deneyde toz veya duman üretmeyin.</text>'
light_asset=svg('FEN_BULK_light_alignment.svg',light,'Delikli kartlar: başlangıç düzeni','Kartların delikleri aynı doğrultuda. Bir kart kaydırıldığında ne olur?')

shadow=''
for cy,cx in [(270,400),(520,650)]:
    half=40;screen=1050;sy=cy;sh=(screen-130)/(cx-130)*half
    shadow+=f'<circle cx="130" cy="{cy}" r="8" fill="#c28b1a"/><path d="M{cx} {cy-half}v80" stroke="#183247" stroke-width="10"/>'
    shadow+=f'<path d="M130 {cy}L{screen} {cy-sh}M130 {cy}L{screen} {cy+sh}" fill="none" stroke="#ae4b34" stroke-width="2"/>'
    shadow+=f'<path d="M{screen} {cy-sh}v{2*sh}" stroke="#263d4a" stroke-width="12"/>'
    shadow+=f'<text x="185" y="{cy+20}" font-size="20">küçük kaynak</text><text x="{cx-45}" y="{cy-75}" font-size="21">opak kart</text>'
shadow+='<text x="50" y="670" font-size="20">İki çizimde kart boyu ve kaynak–ekran uzaklığı aynı; yalnız kartın konumu farklı.</text>'
shadow_asset=svg('FEN_BULK_shadow_positions.svg',shadow,'Tam gölge: iki kart konumu','Tek küçük kaynak. Geometrik öğretim modeli; gerçek ölçüm verisi değildir.')

particle=''
for c,(label,positions) in enumerate([
 ('K',[(50+i*42,60+j*42) for j in range(4) for i in range(4)]),
 ('L',[(50+i*45+(j%2)*10,115+j*38) for j in range(4) for i in range(4)]),
 ('M',[(35,30),(130,60),(230,40),(60,160),(210,180),(145,245),(265,270),(40,285)])]):
    ox=50+c*390
    particle+=f'<rect x="{ox}" y="180" width="320" height="350" fill="white" stroke="#183247" stroke-width="3"/><text x="{ox+145}" y="570" font-size="26">{label}</text>'
    for x,y in positions:particle+=f'<circle cx="{ox+x}" cy="{180+y}" r="10" fill="#407c99"/>'
particle+='<text x="50" y="635" font-size="21">Tanecikler temsili noktalardır; çizim tek başına hareketin yokluğunu göstermez.</text>'
particle_asset=svg('FEN_BULK_particle_models.svg',particle,'Üç tanecik modeli','Örnek sayıları gerçek madde miktarını karşılaştırmak için kullanılmaz. Şema fotoğraf değildir.')

def circuit(open_switch):
    s='<path d="M480 480H180V180H465M535 180H820V310M820 380V480H510" fill="none" stroke="#183247" stroke-width="4"/>'
    s+='<circle cx="500" cy="180" r="35" fill="white" stroke="#183247" stroke-width="4"/><path d="M480 160l40 40m0-40-40 40M480 450v60M510 465v30" stroke="#183247" stroke-width="4"/>'
    s+='<circle cx="820" cy="310" r="6" fill="#183247"/><circle cx="820" cy="380" r="6" fill="#183247"/>'
    s+=('<path d="M820 310l45 60" stroke="#183247" stroke-width="4"/>' if open_switch else '<path d="M820 310v70" stroke="#183247" stroke-width="4"/>')
    s+='<text x="560" y="155" font-size="24">ampul</text><text x="455" y="570" font-size="24">pil</text><text x="885" y="350" font-size="24">anahtar</text>'
    s+='<text x="50" y="650" font-size="21">Yalnız uygun düşük gerilimli pil ve öğretmen gözetimi. Priz kullanılmaz.</text>'
    return s
closed_asset=svg('FEN_BULK_circuit_closed.svg',circuit(False),'Deney şeması: kapalı anahtar','Bağlantı çizgileri devre yolunu gösterir; malzemeler ölçekli değildir.')
open_asset=svg('FEN_BULK_circuit_open.svg',circuit(True),'Deney şeması: açık anahtar','Bu çizim bir devre şemasıdır; kurulmuş ve ölçülmüş deney sonucu değildir.')

asset_map={('FB.5.2.1',2):[force_asset],('FB.5.4.1',0):[light_asset],('FB.5.4.1',4):[light_asset],
 ('FB.5.4.3',0):[shadow_asset],('FB.5.4.3',1):[shadow_asset],
 ('FB.5.6.1',2):[open_asset],('FB.5.6.1',3):[closed_asset],
 ('FB.5.6.2',0):[closed_asset],('FB.5.6.2',1):[open_asset],
 ('FB.5.3.1',0):[str(P/'FB531_elodea_delta_ccbysa4.jpg')],('FB.5.5.1',7):[particle_asset],
 ('FB.5.1.2',2):[str(P/'FB514_dscovr_2015_frame12.jpg')],
 ('FB.5.1.2',3):[str(P/'FB514_dscovr_2015_frame06.jpg'),str(P/'FB514_dscovr_2015_frame12.jpg')]}
created=[]
for unit in author['units']:
    code=unit['code'];item=registry[code];short=code.replace('.','');rows=[];contexts=[]
    for ci,case in enumerate(unit['cases']):
        title,context,*answers=case
        context_id=f'{short}-C{ci+1:02d}'
        context_assets=asset_map.get((code,ci),[])
        if code=='FB.5.5.1' and ci in [1,2,3]:
            # A separate comparison card; do not imply every panel depicts the named material.
            context_assets=[]
        event=code.startswith('FB.5.7.') and (('2026' in context))
        contexts.append({'contextId':context_id,'title':title,'stimulus':context,'studentAssetPaths':context_assets,
            'dataStatus':'FICTIONAL_EDUCATIONAL_EXAMPLE_EXCEPT_EXPLICIT_SOURCE_FACTS',
            'currentEvent':({'sourceUrl':event_url,'eventDate':'2026-03-30','verifiedFact':'2026 International Day of Zero Waste theme: food waste.','classroomDataAreFictional':True} if event else None)})
        for qi,(question,answer) in enumerate(zip(unit['q'],answers)):
            performance=qi==4
            note=''
            if code=='FB.5.3.1' and ci==0:
                note='\nGörsel: Elodea bitkisi mikrografı; hayvan örneği metinde tanımlıdır. Seçilemeyen yapıları yok sayma. Görsel kredisi: ~delta, CC BY-SA 4.0; yeniden boyutlandırıldı.'
            if code=='FB.5.6.1':note+='\nBu sorunun temel kataloğu pil, ampul, anahtar ve kablo sembollerini içerir; duy, pil yatağı, bant ve taban için ayrı simge kullanmaz. Bu kapsam tüm teknik standartlar için sembolsüzlük iddiası değildir.'
            stem=context+note+'\n\n'+question
            row={'id':f'ANX-{short}-{ci*5+qi+1:03d}','gradeLevel':5,'outcomeCode':code,'contextId':context_id,
                'title':title+f' — görev {qi+1}','assessmentType':'PERFORMANCE_TASK' if performance else 'OPEN_ENDED',
                'stem':stem,'sampleAnswer':answer,
                'solution':answer+' '+('Gerçek ürün/ölçüm/gözlem veya kaynak kaydı öğrenci tarafından sağlanır; hazır sonuç üretilmiş sayılmaz.' if performance else 'Gerekçe bağlamdaki bilgiyle ilişkilendirilmelidir; bilimsel olarak eşdeğer açıklamalar kabul edilir.'),
                'rubric':{'maxScore':4,'scaleRef':'metadata.rubricScale','criteria':[
                    {'maxScore':2,'criterion':answer},
                    {'maxScore':2,'criterion':('Gerçek ürün/deneyim/kaynak kaydını dürüstçe sunar; güvenlik, kaynak veya bağlam sınırını belirtir.' if performance else 'Yanıtını verilen bağlamdaki ilgili gözlem, veri, ilişki veya kaynak niteliğiyle açıkça gerekçelendirir.')} ]},
                'processComponentRefs':unit['processMap'][qi],'processAlignmentStatus':'PROPOSED_REQUIRES_EXPERT_REVIEW',
                'difficultyLevel':([1,2,3,4,5 if ci%2==0 else 6][qi]),'difficultyStatus':'UNCALIBRATED_EDITORIAL_ESTIMATE',
                'studentEvidenceRequired':performance,'dependsOnSharedStimulus':True,'assetPaths':context_assets,
                'status':'DRAFT_NOT_APPROVED','copyrightStatus':'ORIGINAL_AI_ASSISTED_TEXT_REQUIRES_REVIEW',
                'priorLearningLinks':[],'futureLearningLinks':[],'historicalExamEvidence':{'verifiedCount':None,'status':'NOT_SCANNED','matches':[]}}
            rows.append(row)
    pack={'metadata':{'outcomeCode':code,'outcomeTitle':item['outcomeTitle'],'sourceUrl':item['sourceUrl'],
        'sourceTextCheckedAt':'2026-11-12','academicYearCatalog':'2027-2028','sourceYearEquivalenceVerified':False,
        'status':'DRAFT_NOT_APPROVED','teacherApprovedCount':0,'rowsCount':50,'distinctSharedContexts':10,
        'openEndedCount':40,'performanceTaskCount':10,'notIndependentStimuli':True,
        'sourceLabel':'ANUNEX_ORIGINAL_AI_ASSISTED_DRAFT_2026_11_12',
        'rubricScale':{'0':'Ölçüt karşılanmıyor veya bilimsel olarak yanlış.','1':'Kısmen doğru; ilişki, gerekçe veya gerekli kayıt eksik.','2':'Ölçüt bilimsel olarak doğru ve yeterli kanıt/kayıtla karşılanıyor.'},
        'scoringNotes':['Örnek cevabın sözcükleri zorunlu değildir.','Aynı eksik iki ölçütte mükerrer cezalandırılmaz.','Örnek cevaplar anahtar çekirdekleridir; kabul edilen alternatifler uzman tarafından genişletilmelidir.'],
        'reviewGates':['EXPERT_SCIENCE_PEDAGOGY_RUBRIC','EXACT_PROGRAM_YEAR_CODE','SEMANTIC_CROSS_POOL_ORIGINALITY','MEDIA_LAYOUT_RIGHTS','VERTICAL_CURRICULUM_MAP','HISTORICAL_EXAM_AUDIT','IMPORTER_TYPE_SUPPORT'],
        'safety':'Öğretmen denetimi; ılık su, uygun düşük gerilimli pil ve güvenli modeller. Priz, doğrudan Güneş/lazer, sıcak yüzey, kırık/tehlikeli atık veya kişisel sağlık müdahalesi kullanılmaz.',
        'importerCompatibility':'REVIEW_ONLY_NOT_LEGACY_MC_IMPORT','generationMethod':'Authored context/answer matrix expanded deterministically; no agent jobs started.'},
        'contexts':contexts,'rows':rows}
    out=B/f'{short}_50_context_assessments_review_only.json';out.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n');created.append(str(out))
(B/'FEN_REMAINING_FILE_INDEX_2026-11-12.json').write_text(json.dumps({'files':created,'outcomes':len(created),'contexts':len(created)*10,'assessmentItems':len(created)*50,'includesFirstTwoOutcomeReplacements':True,'approved':0},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'createdFiles':len(created),'items':len(created)*50,'sharedContexts':len(created)*10,'approved':0}))
