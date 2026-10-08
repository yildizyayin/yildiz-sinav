import json,os,urllib.request,urllib.error,pathlib
ACCOUNT='daae7254acbfe5218c52665daaacbd96'
WORKER='yildiz-sinav-prod'
DATABASE='c8ba72d6-a7be-498e-9492-1488c660b498'
BUCKET='anunex-report-exports-production'
assert os.environ['CLOUDFLARE_ACCOUNT_ID']==ACCOUNT
base='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT
def api(path,method='GET',payload=None):
    req=urllib.request.Request(base+path,method=method,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},data=None if payload is None else json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(req,timeout=60) as r: data=json.load(r)
    except urllib.error.HTTPError as e: raise RuntimeError('Private report provider request failed: '+method+' '+path+' HTTP '+str(e.code)) from None
    assert data.get('success'), 'Private report provider request rejected'
    return data['result']
config=json.loads(pathlib.Path('wrangler.production.jsonc').read_text())
assert config['name']==WORKER and config['vars']['ENVIRONMENT']=='production'
bindings=api('/workers/scripts/'+WORKER+'/settings')['bindings']
assert any(b.get('name')=='DB' and b.get('id',b.get('database_id'))==DATABASE for b in bindings), 'Unexpected production database'
assert any(b.get('name')=='ENVIRONMENT' and b.get('text')=='production' for b in bindings)
queues={q['queue_name']:q for q in api('/queues?page=1&per_page=100')}
for name in ['anunex-rubric-exports-production','anunex-rubric-exports-production-dlq','anunex-cohort-reports-production','anunex-cohort-reports-production-dlq']:
    if name not in queues: queues[name]=api('/queues','POST',{'queue_name':name})
    assert all(c.get('script',c.get('script_name'))==WORKER for c in queues[name].get('consumers',[])), 'Private report queue has another consumer'
buckets=api('/r2/buckets?per_page=1000');buckets=buckets.get('buckets',[]) if isinstance(buckets,dict) else buckets
if not any(b.get('name')==BUCKET for b in buckets): api('/r2/buckets','POST',{'name':BUCKET})
assert api('/r2/buckets/'+BUCKET+'/domains/managed').get('enabled') is False
domains=api('/r2/buckets/'+BUCKET+'/domains/custom');domains=domains.get('domains',[]) if isinstance(domains,dict) else domains
assert not domains
rule={'id':'private-report-expiry-backstop','enabled':True,'conditions':{'prefix':'report-exports/'},'deleteObjectsTransition':{'condition':{'type':'Age','maxAge':172800}}}
api('/r2/buckets/'+BUCKET+'/lifecycle','PUT',{'rules':[rule]})
assert rule in api('/r2/buckets/'+BUCKET+'/lifecycle')['rules']
assert any(b.get('binding')=='REPORT_EXPORT_FILES' and b.get('bucket_name')==BUCKET for b in config['r2_buckets'])
print(json.dumps({'status':'ready','scope':'private production queues/R2 with lifecycle; existing DB and cron preserved; no student data mutated','worker':WORKER,'privateBucket':BUCKET}))
