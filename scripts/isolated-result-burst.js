import http from 'k6/http';
import {check,sleep} from 'k6';
import {Trend} from 'k6/metrics';
const launchDelay=new Trend('launch_delay_ms');
export const options={
 scenarios:{authenticated_burst:{executor:'per-vu-iterations',vus:1000,iterations:1,maxDuration:'5m'}},
 thresholds:{http_req_failed:['rate<0.05'],http_req_duration:['p(95)<2500'],checks:['rate>0.99'],launch_delay_ms:['p(99)<2000']},
};
export default function(){
 const start=Number(__ENV.CAPACITY_START_AT);if(!start)throw new Error('Coordinated start time is required');
 const wait=start-Date.now();if(wait>0)sleep(wait/1000);launchDelay.add(Math.max(0,Date.now()-start));
 const res=http.get(`${__ENV.TARGET_URL}/api/public/results/student`,{headers:{Cookie:__ENV.RESULT_LOAD_COOKIE},redirects:0,timeout:'30s'});
 check(res,{'authenticated summary 200':r=>r.status===200,'exact synthetic published exam and net':r=>{try{const data=JSON.parse(r.body);return data.ok===true&&data.exams.length===1&&data.exams[0].exam_id===__ENV.RESULT_EXPECTED_EXAM_ID&&data.exams[0].net===7.5}catch{return false}}});
}
