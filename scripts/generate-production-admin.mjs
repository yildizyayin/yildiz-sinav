import { mkdirSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const email=(process.env.PROD_INITIAL_ADMIN_EMAIL||'rtsgida@gmail.com').trim().toLocaleLowerCase('tr-TR');
const password=process.env.PROD_INITIAL_ADMIN_PASSWORD||'';
if(!/^\S+@\S+\.\S+$/.test(email)) throw new Error('PROD_INITIAL_ADMIN_EMAIL geçerli bir e-posta olmalıdır.');
if(password.length<14) throw new Error('PROD_INITIAL_ADMIN_PASSWORD en az 14 karakter olmalıdır.');

const quote=(value)=>`'${String(value).replaceAll("'","''")}'`;
const salt=randomBytes(16);
const hash=pbkdf2Sync(password,salt,100000,32,'sha256');
const sql=`INSERT OR IGNORE INTO users (id,institution_id,student_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active)
VALUES ('usr_prod_super',NULL,NULL,'SUPER_ADMIN','ANUNEX Süper Admin',${quote(email)},'anunex-admin',${quote(hash.toString('base64'))},${quote(salt.toString('base64'))},100000,'PBKDF2-SHA256-v1',1);\n`;

mkdirSync('tmp',{recursive:true});
writeFileSync('tmp/production-admin.sql',sql,{mode:0o600});
console.log(`Production Süper Admin SQL dosyası ${email} için güvenli biçimde hazırlandı.`);
