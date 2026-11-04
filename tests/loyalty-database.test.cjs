// Runs the actual migration and functions in an isolated PostgreSQL (PGlite).
// PGLITE_MODULE may point to an existing install, avoiding project dependency changes.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite')

test('loyalty database: permissions, purchases, expiry, rewards and reversals', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  const owner = randomUUID(), otherOwner = randomUUID(), customer = randomUUID(), otherCustomer = randomUUID(), unverified = randomUUID()
  const restaurant = randomUUID(), otherRestaurant = randomUUID()
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, phone text, phone_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.restaurants(id uuid primary key, owner_id uuid, is_active boolean default true);
    alter table public.restaurants enable row level security;
    create policy restaurants_read on public.restaurants for select using(is_active or owner_id = auth.uid());
    grant select on public.restaurants to anon, authenticated;
  `)
  for (const [id, phone, verified] of [[owner,'911111111111',true],[otherOwner,'912222222222',true],[customer,'919876543210',true],[otherCustomer,'919876543211',true],[unverified,'919876543212',false]]) {
    await db.query('insert into auth.users values($1,$2,$3)', [id, phone, verified ? new Date().toISOString() : null])
  }
  await db.query('insert into restaurants(id,owner_id) values($1,$2),($3,$4)', [restaurant, owner, otherRestaurant, otherOwner])
  const migration = fs.readFileSync('supabase/phase-loyalty.sql', 'utf8')
  await db.exec(migration)
  await db.exec(migration) // Re-running setup must not destroy cards or fail.
  async function as(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']); await db.exec(`set role ${id ? 'authenticated' : 'anon'}`) }
  async function query(sql, values = []) { return (await db.query(sql, values)).rows }
  async function expectFail(sql, values, pattern) { await assert.rejects(() => db.query(sql, values), pattern) }
  async function createProgram(r) { await db.query("insert into loyalty_programs(restaurant_id,title,reward_name,stamp_target,minimum_spend) values($1,'Come back for coffee','Free coffee',3,100)", [r]) }
  const award = (member, bill, amount = 150, key = randomUUID(), r = restaurant) => query('select loyalty_award($1,$2,$3,$4,$5) as result', [r, member, bill, amount, key])
  let member, member2
  await t.test('only the owner can set up a program; drafts have no launch date', async () => {
    await as(owner); await createProgram(restaurant)
    assert.equal((await query('select launched_at from loyalty_programs'))[0].launched_at, null)
    await expectFail("insert into loyalty_programs(restaurant_id,title,reward_name) values($1,'Bad','Bad')", [otherRestaurant], /row-level security/i)
    await as(otherOwner); await createProgram(otherRestaurant)
    await as(owner); await db.query('update loyalty_programs set enabled = true where restaurant_id=$1', [restaurant])
    assert.ok((await query('select launched_at from loyalty_programs where restaurant_id=$1', [restaurant]))[0].launched_at)
  })
  await t.test('joining requires a verified phone and does not award a stamp', async () => {
    await as(unverified); await expectFail('select loyalty_join($1,$2)', [restaurant, 'Guest'], /Verify your phone/)
    await as(customer)
    member = (await query('select loyalty_join($1,$2) as member', [restaurant, 'Riya']))[0].member
    const again = (await query('select loyalty_join($1,$2) as member', [restaurant, 'Riya']))[0].member
    assert.equal(member.id, again.id)
    assert.equal((await query('select * from loyalty_stamps')).length, 0)
    await as(otherCustomer); member2 = (await query('select loyalty_join($1,$2) as member', [restaurant, 'Arjun']))[0].member
  })
  await t.test('customers cannot award themselves stamps or read each other’s cards', async () => {
    await as(customer)
    await assert.rejects(() => award(member.id, 'hack'), /insufficient_privilege|privilege/i)
    await expectFail('insert into loyalty_stamps(member_id,restaurant_id,bill_reference,paid_amount,request_key) values($1,$2,$3,150,$4)', [member.id, restaurant, 'hack', randomUUID()], /permission denied/i)
    assert.equal((await query('select id from loyalty_members where id=$1', [member2.id])).length, 0)
    await as(otherOwner); assert.equal((await query('select * from loyalty_members where restaurant_id=$1', [restaurant])).length, 0)
    await as(null); assert.equal((await query('select * from loyalty_programs')).length, 2)
    await expectFail('select * from loyalty_members', [], /permission denied/i)
  })
  await t.test('rules are locked after joining; branding and pausing remain editable', async () => {
    await as(owner)
    await expectFail('update loyalty_programs set stamp_target=5 where restaurant_id=$1', [restaurant], /rules are locked/)
    await expectFail("update loyalty_programs set reward_name='Smaller reward' where restaurant_id=$1", [restaurant], /rules are locked/)
    await db.query("update loyalty_programs set card_style='bold',accent_color='#112233' where restaurant_id=$1", [restaurant])
  })
  await t.test('valid paid purchase awards once; retries, duplicate bills and low amounts cannot inflate balance', async () => {
    await as(owner)
    const key = randomUUID()
    assert.equal((await award(member.id, ' bill-1 ', 150, key))[0].result.duplicate, false)
    assert.equal((await award(member.id, 'bill-1', 150, key))[0].result.duplicate, true)
    await assert.rejects(() => award(member2.id, 'bill-1'), /already earned/)
    await assert.rejects(() => award(member2.id, 'bill-2', 150, key), /different action/)
    await assert.rejects(() => award(member.id, 'free', 0), /qualifying/)
    await assert.rejects(() => award(member.id, 'too-small', 99), /qualifying/)
    await assert.rejects(() => award(member.id, 'bad-rounding', 150.001), /qualifying/)
    assert.equal((await query("select * from loyalty_stamps where member_id=$1 and status='available'", [member.id])).length, 1)
  })
  let reward
  await t.test('threshold consumes stamps and creates one reward; other customers cannot view it', async () => {
    await as(owner); await award(member.id, 'bill-2'); await award(member.id, 'bill-3')
    reward = (await query('select * from loyalty_rewards where member_id=$1', [member.id]))[0]
    assert.equal((await query("select * from loyalty_stamps where member_id=$1 and status='available'", [member.id])).length, 0)
    assert.equal((await query('select * from loyalty_rewards where member_id=$1', [member.id])).length, 1)
    await as(otherCustomer)
    assert.equal((await query('select * from loyalty_stamps where member_id=$1', [member.id])).length, 0)
    assert.equal((await query('select * from loyalty_rewards where member_id=$1', [member.id])).length, 0)
    await expectFail('select loyalty_redeem($1,$2,$3)', [restaurant, reward.id, randomUUID()], /privilege/i)
  })
  await t.test('pausing blocks new stamps and enrollment but preserves earned redemption', async () => {
    await as(owner); await db.query('update loyalty_programs set enabled=false where restaurant_id=$1', [restaurant])
    await assert.rejects(() => award(member.id, 'paused'), /unavailable/)
    assert.ok((await query('select launched_at from loyalty_programs where restaurant_id=$1', [restaurant]))[0].launched_at)
    await as(customer); await expectFail('select loyalty_join($1,$2)', [restaurant, 'Riya'], /unavailable/)
    await as(owner)
    const key = randomUUID()
    const redeem = () => query('select loyalty_redeem($1,$2,$3) as result', [restaurant, reward.id, key])
    assert.equal((await redeem())[0].result.duplicate, false)
    assert.equal((await redeem())[0].result.duplicate, true)
    await expectFail('select loyalty_redeem($1,$2,$3)', [restaurant, reward.id, randomUUID()], /no longer available/)
    await db.query('update loyalty_programs set enabled=true where restaurant_id=$1', [restaurant])
  })
  await t.test('reversal revokes an unused reward and restores its other stamps', async () => {
    await as(owner); await award(member2.id, 'other-1'); await award(member2.id, 'other-2'); const third = (await award(member2.id, 'other-3'))[0].result
    await query('select loyalty_reverse($1,$2,$3)', [restaurant, third.stamp_id, 'Payment refunded'])
    assert.equal((await query("select * from loyalty_stamps where member_id=$1 and status='available'", [member2.id])).length, 2)
    assert.ok((await query('select revoked_at from loyalty_rewards where id=$1', [third.reward_id]))[0].revoked_at)
    await expectFail('select loyalty_redeem($1,$2,$3)', [restaurant, third.reward_id, randomUUID()], /no longer available/)
    assert.equal((await query('select loyalty_reverse($1,$2,$3) as result', [restaurant, third.stamp_id, 'Retry refund']))[0].result.duplicate, true)
  })
  await t.test('inactivity expiry starts a fresh card; an unlocked reward has an independent expiry', async () => {
    await db.exec('reset role')
    await db.query("update loyalty_members set progress_expires_at=now()-interval '1 second' where id=$1", [member2.id])
    await as(owner); await award(member2.id, 'after-expiry')
    assert.equal((await query("select * from loyalty_stamps where member_id=$1 and status='available'", [member2.id])).length, 1)
    assert.equal((await query("select * from loyalty_stamps where member_id=$1 and status='expired'", [member2.id])).length, 2)
    await award(member2.id, 'after-expiry-2'); const unlock = (await award(member2.id, 'after-expiry-3'))[0].result
    await db.exec('reset role'); await db.query("update loyalty_rewards set expires_at=now() where id=$1", [unlock.reward_id])
    await as(owner); await expectFail('select loyalty_redeem($1,$2,$3)', [restaurant, unlock.reward_id, randomUUID()], /no longer available/)
  })
  await t.test('cross-restaurant actions and reversing a consumed reward are rejected', async () => {
    await as(otherOwner)
    await assert.rejects(() => award(member.id, 'cross-owner'), /privilege/i)
    await db.query('update loyalty_programs set enabled=true where restaurant_id=$1', [otherRestaurant])
    await assert.rejects(() => award(member.id, 'cross-card', 150, randomUUID(), otherRestaurant), /another restaurant/)
    await as(owner)
    const stamp = (await query('select id from loyalty_stamps where reward_id=$1 limit 1', [reward.id]))[0]
    await expectFail('select loyalty_reverse($1,$2,$3)', [restaurant, stamp.id, 'Refund'], /already used/)
    const events = await query('select * from loyalty_activity where restaurant_id=$1', [restaurant])
    assert.ok(events.length > 0)
    assert.ok(events.every(event => event.actor_id === owner))
  })
})
