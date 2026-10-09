import json,os,sys,time,urllib.request,urllib.error,pathlib

ACCOUNT='daae7254acbfe5218c52665daaacbd96'
WORKER='yildiz-sinav-qpool-pr-227'
DATABASE='8db26532-eb50-42c9-99f3-00f097127c11'
BUCKET='anunex-report-exports-staging-227'
assert os.environ['CLOUDFLARE_ACCOUNT_ID']==ACCOUNT, 'Unexpected provider account'
base='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT
def api(path,method='GET',payload=None):
    req=urllib.request.Request(base+path,method=method,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},data=None if payload is None else json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(req,timeout=60) as r: data=json.load(r)
    except urllib.error.HTTPError as e:
        try: codes=[x.get('code') for x in json.load(e).get('errors',[])]
        except Exception: codes=[]
        raise RuntimeError('Provider '+method+' '+path+' failed: HTTP '+str(e.code)+' codes '+str(codes)) from None
    assert data.get('success'), 'Provider rejected request'
    return data['result']

BACKUP=pathlib.Path('tmp/report-acceptance-cron-backup.json')
def crons(name): return [row['cron'] for row in api('/workers/scripts/'+name+'/schedules')['schedules']]
def wait_crons(name,expected):
    deadline=time.monotonic()+120
    while True:
        current=crons(name)
        if current==expected: return
        assert time.monotonic()<deadline, 'Provider schedule did not converge: '+name
        assert current in [[],['*/15 * * * *'],['* * * * *']], 'Unexpected concurrent schedule change'
        time.sleep(3)
if '--restore' in sys.argv:
    if BACKUP.exists():
        original=json.loads(BACKUP.read_text())
        assert original==['*/15 * * * *']
        api('/workers/scripts/'+WORKER+'/schedules','PUT',[])
        wait_crons(WORKER,[])
        current=crons('yildiz-sinav-v1')
        assert current in [[],original], 'Demo schedule changed concurrently'
        api('/workers/scripts/yildiz-sinav-v1/schedules','PUT',[{'cron':cron} for cron in original])
        wait_crons('yildiz-sinav-v1',original)
        print('PASS: original demo schedule restored; isolated temporary cron removed')
        BACKUP.unlink()
    sys.exit(0)

# Reuse the established disposable preview database; never allocate or bind production.
db=api('/d1/database/'+DATABASE)
assert db['name']=='yildiz-sinav-qpool-pr-227-generation-v2'
queues=api('/queues?page=1&per_page=100')
mapping={q['queue_name']:q for q in queues}
for name in ['anunex-rubric-exports-staging','anunex-rubric-exports-staging-dlq','anunex-cohort-reports-staging','anunex-cohort-reports-staging-dlq']:
    if name not in mapping: mapping[name]=api('/queues','POST',{'queue_name':name})
    for consumer in mapping[name].get('consumers',[]):
        assert consumer.get('script',consumer.get('script_name'))==WORKER, 'Queue belongs to another Worker'
buckets=api('/r2/buckets?per_page=1000')
buckets=buckets.get('buckets',[]) if isinstance(buckets,dict) else buckets
if not any(b.get('name')==BUCKET for b in buckets): api('/r2/buckets','POST',{'name':BUCKET})
managed=api('/r2/buckets/'+BUCKET+'/domains/managed')
assert managed.get('enabled') is False, 'Report bucket must remain private'
custom=api('/r2/buckets/'+BUCKET+'/domains/custom')
domains=custom.get('domains',[]) if isinstance(custom,dict) else custom
assert not domains, 'Report bucket must have no custom public domains'
rule={'id':'private-report-expiry-backstop','enabled':True,'conditions':{'prefix':'report-exports/'},'deleteObjectsTransition':{'condition':{'type':'Age','maxAge':172800}}}
api('/r2/buckets/'+BUCKET+'/lifecycle','PUT',{'rules':[rule]})
assert rule in api('/r2/buckets/'+BUCKET+'/lifecycle')['rules']
config=json.loads(pathlib.Path('wrangler.jsonc').read_text())
config['name']=WORKER
config['d1_databases']=[{'binding':'DB','database_name':db['name'],'database_id':DATABASE,'migrations_dir':'migrations'}]
config['r2_buckets']=[{'binding':'FILES','bucket_name':WORKER},{'binding':'REPORT_EXPORT_FILES','bucket_name':BUCKET}]
config['queues']={'producers':[{'binding':'REPORT_EXPORT_QUEUE','queue':'anunex-rubric-exports-staging'},{'binding':'COHORT_REPORT_QUEUE','queue':'anunex-cohort-reports-staging'}],'consumers':[{'queue':q,'max_batch_size':5,'max_batch_timeout':5,'max_retries':5,'dead_letter_queue':q+'-dlq'} for q in ['anunex-rubric-exports-staging','anunex-cohort-reports-staging']]}
# Borrow only the demo staging cron slot during acceptance, restoring it in always().
settings=api('/workers/scripts/yildiz-sinav-v1/settings')
bindings=settings['bindings']
assert any(b.get('name')=='ENVIRONMENT' and b.get('text')=='staging' for b in bindings)
databases=[b.get('id',b.get('database_id')) for b in bindings if b.get('type')=='d1']
assert databases and 'c8ba72d6-a7be-498e-9492-1488c660b498' not in databases
original=crons('yildiz-sinav-v1')
assert original==['*/15 * * * *'] and not crons(WORKER)
BACKUP.parent.mkdir(exist_ok=True);BACKUP.write_text(json.dumps(original));BACKUP.chmod(0o600)
api('/workers/scripts/yildiz-sinav-v1/schedules','PUT',[])
wait_crons('yildiz-sinav-v1',[])
config['triggers']={'crons':['* * * * *']}
config['vars'].update({'ENVIRONMENT':'staging','REPORT_EXPORTS_ENABLED':'true','COHORT_REPORTS_ENABLED':'true','REPORT_EXPORT_QUEUE_NAME':'anunex-rubric-exports-staging','COHORT_REPORT_QUEUE_NAME':'anunex-cohort-reports-staging'})
pathlib.Path('wrangler.report-acceptance.json').write_text(json.dumps(config,indent=2))
print(json.dumps({'status':'configured','worker':WORKER,'database':DATABASE,'privateBucket':BUCKET,'queues':['anunex-rubric-exports-staging','anunex-cohort-reports-staging'],'retentionSeconds':172800}))
