import json,sys
decoder=json.JSONDecoder()
buffer=''
for line in sys.stdin:
    buffer+=line
    while buffer.strip():
        buffer=buffer.lstrip()
        try: event,end=decoder.raw_decode(buffer)
        except json.JSONDecodeError: break
        buffer=buffer[end:]
        if not isinstance(event,dict): continue
        trigger=event.get('event') or {}
        if not isinstance(trigger,dict) or 'scheduledTime' not in trigger: continue
        markers=[]
        for log in event.get('logs',[]):
            for message in log.get('message',[]):
                if isinstance(message,str) and message in ['PRIVATE_REPORT_SCHEDULE_STARTED','PRIVATE_COHORT_RETENTION_OK','PRIVATE_COHORT_RETENTION_FAILED','PRIVATE_RUBRIC_RETENTION_OK','PRIVATE_RUBRIC_RETENTION_FAILED']:
                    markers.append(message)
        print(json.dumps({'scheduledTime':trigger.get('scheduledTime'),'outcome':event.get('outcome'),'markers':markers,'exceptionCount':len(event.get('exceptions',[]))}),flush=True)
