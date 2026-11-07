import {readFileSync,writeFileSync} from 'node:fs';
Object.assign(process.env, JSON.parse(readFileSync('/tmp/nb-mobile-review-env.json','utf8')));
if(new URL(process.env.DATABASE_URL!).pathname!=='/nb_mobile_review_20261104') throw new Error('ISOLATED_DATABASE_REQUIRED');
const {createSession}=await import('../../../packages/auth/src/index.ts');
const {db,users,eq,pool}=await import('../../../packages/db/src/index.ts');
const records=[];
for(const email of ['qa.mobile.20261021@localhost','qa.admin@localhost']) {
  const [user]=await db.select().from(users).where(eq(users.email,email));
  if(!user) throw new Error('Missing QA user');
  const session=await createSession({userId:user.id,userAgent:'Mobile layout review isolated clone'});
  records.push({email,cookie:{name:'nb_session',value:session.rawToken,url:'http://127.0.0.1:3104'}});
}
writeFileSync('/tmp/nb-mobile-review-sessions.json',JSON.stringify(records),{mode:0o600});
console.log('Temporary QA sessions created; tokens omitted');
await pool.end();
