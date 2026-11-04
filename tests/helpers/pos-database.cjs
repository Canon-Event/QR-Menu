const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite')

async function posDatabase() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
  `)
  for (const file of ['supabase/schema.sql', 'supabase/phase-9-analytics-orders.sql', 'supabase/phase-order-reliability.sql', 'supabase/phase-pos.sql', 'supabase/phase-reporting.sql']) await db.exec(fs.readFileSync(file, 'utf8'))
  await db.exec(fs.readFileSync('supabase/phase-pos.sql', 'utf8'))
  await db.exec(fs.readFileSync('supabase/phase-staff-permissions.sql', 'utf8'))
  await db.exec(fs.readFileSync('supabase/phase-table-access.sql', 'utf8'))
  await db.exec(fs.readFileSync('supabase/phase-notifications.sql', 'utf8'))
  await db.exec('grant select on public.restaurants,public.dishes,public.orders,public.order_items to authenticated;')
  await db.exec('grant update on public.orders to authenticated;')
  const owner = randomUUID(), otherOwner = randomUUID(), restaurant = randomUUID(), otherRestaurant = randomUUID(), dish = randomUUID(), otherDish = randomUUID()
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@green.test',now()),($2,'owner@other.test',now())", [owner, otherOwner])
  await db.query("insert into restaurants(id,owner_id,name,slug,currency) values($1,$2,'Green Bistro','green-bistro','INR'),($3,$4,'Other','other-bistro','INR')", [restaurant, owner, otherRestaurant, otherOwner])
  await db.query("insert into dishes(id,restaurant_id,name,price,is_available) values($1,$2,'Coffee',118,true),($3,$4,'Other coffee',50,true)", [dish, restaurant, otherDish, otherRestaurant])
  async function as(id, role = id ? 'authenticated' : 'anon') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || ''])
    await db.exec(`set role ${role}`)
  }
  async function ownerAction(action, data = {}, r = restaurant) { return (await db.query('select pos_owner_action($1,$2,$3::jsonb) as result', [r, action, JSON.stringify(data)])).rows[0].result }
  async function gateway(action, data) {
    await as(null, 'service_role')
    return (await db.query('select pos_gateway_action($1,$2::jsonb) as result', [action, JSON.stringify(data)])).rows[0].result
  }
  const settings = { enabled: true, kitchen_enabled: true, legal_name: 'Green Bistro LLP', address: '12 Market Road, Bengaluru', state_code: '29', gstin: '', tax_status: 'unregistered', restaurant_class: 'standard', price_mode: 'inclusive', sac: '996331' }
  async function order(r = restaurant, d = dish) {
    await db.exec('reset role')
    const id = randomUUID()
    await db.query("insert into orders(id,restaurant_id,idempotency_key,customer_name,currency,subtotal,total) values($1,$2,$3,'Guest','INR',118,118)", [id, r, randomUUID()])
    await db.query("insert into order_items(order_id,restaurant_id,dish_id,dish_name,unit_price,quantity,line_total) values($1,$2,$3,'Coffee',118,1,118)", [id, r, d])
    return id
  }
  await as(owner)
  return { db, owner, otherOwner, restaurant, otherRestaurant, dish, otherDish, as, ownerAction, gateway, order, settings }
}
module.exports = { posDatabase }
