import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';

mkdirSync('tmp',{recursive:true});

const sources=[
 ['tmp/demo-seed.sql','tmp/demo-seed.idempotent.sql'],
 ['tmp/standard-role-seed.sql','tmp/standard-role-seed.idempotent.sql'],
 ['scripts/demo-camera-fixture.sql','tmp/demo-camera-fixture.idempotent.sql'],
 ['scripts/demo-standard-fixture.sql','tmp/demo-standard-fixture.idempotent.sql'],
];

for(const [source,target] of sources){
 const input=readFileSync(source,'utf8');
 const output=input.replaceAll('INSERT OR REPLACE INTO','INSERT OR IGNORE INTO');
 writeFileSync(target,output);
 console.log(`Prepared idempotent seed: ${target}`);
}
