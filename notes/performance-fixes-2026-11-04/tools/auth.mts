import { writeFileSync } from 'node:fs';
import { createSession } from '../../../packages/auth/src/index.ts';
import { db, users, eq, pool } from '../../../packages/db/src/index.ts';

if(new URL(process.env.DATABASE_URL!).pathname !== '/nb_perf_fixes') throw new Error('ISOLATED_DB_REQUIRED');
const records = [];
for (const email of ['qa.admin@localhost','qa.user@localhost']) {
  const [user] = await db.select().from(users).where(eq(users.email,email));
  if(!user) throw new Error('Missing QA user');
  const session = await createSession({userId:user.id,userAgent:'Performance audit isolated clone'});
  records.push({email,userId:user.id,cookie:{name:'nb_session',value:session.rawToken,url:'http://127.0.0.1:3018'}});
}
writeFileSync('/tmp/nb-perf-fixes-sessions-20261104.json',JSON.stringify(records),{mode:0o600});
console.log('Created two temporary sessions in the isolated clone; tokens omitted');
await pool.end();
