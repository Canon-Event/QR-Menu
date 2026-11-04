const test = require('node:test'), assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { posDatabase } = require('./helpers/pos-database.cjs')

test('verified staff roles enforce tenant scope, private projections and immediate revocation', async t => {
  const h = await posDatabase(); t.after(() => h.db.close())
  const roles = Object.fromEntries(['waiter','kitchen','cashier','manager','unverified'].map(r => [r,randomUUID()]))
  await h.db.exec('reset role')
  for (const [role,id] of Object.entries(roles)) await h.db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[id,`${role}@staff.test`,role === 'unverified' ? null : new Date()])
  const admin = async (action,data={}) => (await h.db.query('select team_admin($1,$2,$3::jsonb) result',[h.restaurant,action,JSON.stringify(data)])).rows[0].result
  const workspace = async (rid=h.restaurant) => (await h.db.query('select team_workspace($1) result',[rid])).rows[0].result
  const report = () => h.db.query('select restaurant_financial_report($1)',[h.restaurant])
  await h.as(h.owner); await h.ownerAction('settings',h.settings)
  await assert.rejects(()=>admin('grant',{email:'unverified@staff.test',name:'Unverified',role:'manager'}),/verified email/)
  await assert.rejects(()=>admin('grant',{email:'manager@staff.test',name:'Manager',role:'owner'}),/staff name and role/)
  for (const role of ['waiter','kitchen','cashier','manager']) await admin('grant',{email:`${role}@staff.test`,name:role,role})
  const table=await h.ownerAction('table_create',{name:'T1',seats:4})
  const oid=await h.order(); await h.as(h.owner)
  const bill=await h.ownerAction('issue',{order_ids:[oid],request_key:randomUUID()})
  await h.ownerAction('cash',{bill_id:bill.id,amount_paise:11800,request_key:randomUUID()})
  const payment=(await h.ownerAction('state')).bills[0].payments[0]

  for (const role of ['waiter','kitchen','cashier','manager']) {
    await h.as(roles[role])
    assert.equal((await workspace()).role,role)
    await assert.rejects(()=>workspace(h.otherRestaurant),/access denied/)
    await assert.rejects(()=>admin('grant',{email:'waiter@staff.test',name:'Escalated',role:'manager'}),/access denied/)
    await assert.rejects(()=>h.ownerAction('settings',h.settings),/access denied/)
    await assert.rejects(()=>h.db.query('select * from restaurant_team'),/permission denied/)
    assert.equal((await h.db.query('select * from pos_payments')).rows.length,0)
    assert.equal((await h.db.query('select * from orders')).rows.length,0)
    await assert.rejects(()=>h.db.query('select team_can($1,$2)',[h.restaurant,'team']),/permission denied/)
    await assert.rejects(()=>h.db.query('select pos_report($1,current_date)',[h.restaurant]),/permission denied/)
    if (role !== 'manager') {
      await assert.rejects(()=>h.ownerAction('refund',{payment_id:payment.id,amount_paise:100,reason:'No permission',request_key:randomUUID()}),/access denied/)
      await assert.rejects(report,/access denied/)
      await assert.rejects(()=>h.db.query('select pos_refund_payment($1,$2)',[h.restaurant,payment.id]),/access denied/)
    }
    if (['waiter','kitchen'].includes(role)) await assert.rejects(()=>h.ownerAction('state',{bill_id:bill.id}),/access denied/)
    if (role==='kitchen') {
      const w=await workspace(); assert.deepEqual(w.orders,[]); assert.deepEqual(w.tables,[]); assert.deepEqual(w.dishes,[])
      const text=JSON.stringify(w); for(const field of ['customer_phone','payments','account_key_id','total_paise']) assert.equal(text.includes(field),false)
      await assert.rejects(()=>h.db.query("select orders_change($1,$2,0,'confirmed','')",[h.restaurant,oid]),/access denied/)
      await assert.rejects(()=>h.ownerAction('visit_open',{table_id:table.id}),/access denied/)
    }
    if (role==='cashier') { assert.deepEqual((await h.ownerAction('state')).report,{}); await assert.rejects(()=>h.ownerAction('close_day',{}),/access denied/) }
    if (role==='manager') await report()
  }
  await h.as(roles.waiter)
  const visit=await h.ownerAction('visit_open',{table_id:table.id,guest_name:'Dinner guests'})
  const key=randomUUID(), payload=[{dishId:h.dish,quantity:2}]
  const order=async(v=visit.id,items=payload)=> (await h.db.query('select team_order($1,$2,$3,$4,$5::jsonb,$6) result',[h.restaurant,key,'Guest','No chilli',JSON.stringify(items),v])).rows[0].result
  const first=await order(); assert.equal((await order()).public_token,first.public_token)
  await assert.rejects(()=>order(null),/different table/)
  await assert.rejects(()=>order(visit.id,[{dishId:h.otherDish,quantity:2}]),/different order/)
  const w=await workspace(); const created=w.orders.find(o=>o.customer_note==='No chilli'); assert.equal(Number(created.total),236); assert.equal(created.visit_id,visit.id)
  await h.as(h.owner); await admin('revoke',{user_id:roles.waiter})
  await h.as(roles.waiter); await assert.rejects(workspace,/access denied/); await assert.rejects(order,/access denied/)
  assert.deepEqual((await h.db.query('select team_context() result')).rows[0].result,[])
  await h.as(h.owner); assert.equal((await admin('list')).find(m=>m.user_id===roles.waiter).active,false)
  await h.as(null); await assert.rejects(workspace,/permission denied/)
})
