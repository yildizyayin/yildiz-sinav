import {it,expect} from 'vitest';
// @ts-expect-error Operational Node script has no TypeScript declaration.
import {validateProbeQueue} from '../scripts/cleanup-result-probe-resources.mjs';
const queue=()=>({queue_id:'frozen-id',queue_name:'anunex-result-probe-artifacts-252',producers_total_count:1,producers:[{script:'anunex-result-provider-probe-252',type:'worker'}],consumers_total_count:0,consumers:[]});
it('permits only exact probe identities with a complete, exclusively owned dependency inventory',()=>{
 expect(validateProbeQueue(queue(),252,'frozen-id')).toBe(true);
 for(const patch of [{queue_id:'replacement-id'},{queue_name:'production-results'},{producers_total_count:2},{producers:[{script:'live-app',type:'worker'}]},{consumers_total_count:1,consumers:[{script:'anunex-result-provider-probe-252',type:'worker',dead_letter_queue:'production-dlq'}]}])expect(()=>validateProbeQueue({...queue(),...patch},252,'frozen-id')).toThrow();
 expect(()=>validateProbeQueue(queue(),'252/other','frozen-id')).toThrow();
});
