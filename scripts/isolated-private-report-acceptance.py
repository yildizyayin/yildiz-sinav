import json,os,time,uuid,urllib.request,urllib.error
BASE='https://yildiz-sinav-qpool-pr-227.rtsgida.workers.dev'
DB='8db26532-eb50-42c9-99f3-00f097127c11'
def call(path,cookie='',body=None):
    req=urllib.request.Request(BASE+path,headers={'Content-Type':'application/json','Cookie':cookie},data=None if body is None else json.dumps(body).encode())
    try: response=urllib.request.urlopen(req,timeout=45)
    except urllib.error.HTTPError as e: response=e
    with response: return response.status,response.headers,response.read()
def parsed(path,cookie='',body=None,expected=200):
    status,headers,content=call(path,cookie,body)
    data=json.loads(content)
    assert status==expected and data.get('ok'), (path,status,data.get('error'))
    return data
assert parsed('/api/config').get('environment')=='staging', 'Synthetic acceptance must run in staging'
sessions={}
for username in ['manager','math','guidance','student1','parent1']:
    status,headers,content=call('/api/auth/login',body={'identifier':username,'password':'Demo123!','remember':True,'turnstileToken':'XXXX.DUMMY.TOKEN.XXXX'})
    assert status==200, ('Synthetic login failed',username,status)
    cookie=headers.get('Set-Cookie','').split(';')[0]
    assert cookie and '=' in cookie
    print('::add-mask::'+cookie)
    sessions[username]=cookie
manager=sessions['manager']
created=[]
for endpoint,selection in [('/api/private-rubric-exports',{'studentId':'stu_a001','view':'current','confirmedExport':True}),('/api/private-cohort-reports',{'institutionId':'inst_demo','academicYear':'2026-2027','sources':['MINI_GAME'],'examIds':[],'repeatPolicy':'LATEST','confirmedReport':True})]:
    selection['requestId']='acceptance-'+uuid.uuid4().hex
    data=parsed(endpoint,manager,selection,202)
    jobid=data['jobId']; assert jobid.startswith(('rex_','crj_'))
    created.append((endpoint,jobid))
    replay=parsed(endpoint,manager,selection)
    assert replay.get('replayed') and replay['jobId']==jobid
    deadline=time.monotonic()+300
    while True:
        job=parsed(endpoint+'/'+jobid,manager)
        if job['status']=='READY': break
        assert job['status'] in ['QUEUED','RUNNING'], ('Private report terminal failure',job)
        assert time.monotonic()<deadline, ('Queue did not deliver',endpoint,job)
        time.sleep(5)
    if 'rubric' in endpoint:
        assert job['partCount']>=1
        download=endpoint+'/'+jobid+'/parts/0/download'
        status,headers,content=call(download,manager)
        assert status==200 and content.decode('utf-8-sig').startswith('"Eğitim yılı";')
    else:
        assert job['processedEnrollments']>0
        report=parsed(endpoint+'/'+jobid+'/result',manager)
        assert report.get('ok')
        download=endpoint+'/'+jobid+'/download'
        status,headers,content=call(download,manager)
        assert status==200 and len(content)>0
    assert headers.get('Cache-Control')=='private, no-store'
    for name,cookie in sessions.items():
        if name=='manager': continue
        status,_,_=call(download,cookie)
        assert status==403, ('Cross-actor report leak',name,endpoint,status)
    print(json.dumps({'status':'passed','scope':'synthetic private report queue/R2/download/replay/role isolation','endpoint':endpoint,'jobId':jobid}))

# Only expire the jobs created in this run, in the exact disposable preview database.
def sql(query,params):
    req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']+'/d1/database/'+DB+'/query',headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},data=json.dumps({'sql':query,'params':params}).encode())
    with urllib.request.urlopen(req,timeout=45) as response: result=json.load(response)
    assert result.get('success')
    return result['result'][0]
for endpoint,jobid in created:
    table='private_rubric_export_jobs' if 'rubric' in endpoint else 'private_cohort_report_jobs'
    result=sql('UPDATE '+table+" SET expires_at=datetime('now','-1 minute') WHERE id=? AND actor_user_id='usr_manager' AND status='READY'",[jobid])
    assert result['meta']['changes']==1
    status,_,_=call(endpoint+'/'+jobid,manager)
    assert status==410
deadline=time.monotonic()+240
while True:
    rows=[]
    for endpoint,jobid in created:
        table='private_rubric_export_jobs' if 'rubric' in endpoint else 'private_cohort_report_jobs'
        row=sql('SELECT status,cleanup_done,selection_json,actor_scope_json FROM '+table+' WHERE id=?',[jobid])['results'][0]
        rows.append(row)
    if all(row['status']=='EXPIRED' and row['cleanup_done']==1 and row['selection_json']=='{}' and row['actor_scope_json']=='[]' for row in rows): break
    assert time.monotonic()<deadline, ('Scheduled retention not completed',rows)
    time.sleep(10)
print(json.dumps({'status':'passed','scope':'expired download returns 410; scheduled R2/metadata retention','syntheticJobCount':len(created)}))
