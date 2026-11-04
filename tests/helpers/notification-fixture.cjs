const fs = require('node:fs'), { randomUUID } = require('node:crypto')
const { posDatabase } = require('./pos-database.cjs')
async function notificationFixture() {
  const h = await posDatabase(), roles = { owner: h.owner, other: h.otherOwner }
  await h.db.exec('reset role')
  await h.db.exec(fs.readFileSync('supabase/phase-employee-management.sql', 'utf8').split('-- Payroll PINs')[0])
  await h.db.exec(fs.readFileSync('supabase/phase-notifications.sql', 'utf8'))
  await h.db.query("update restaurants set menu_mode='ordering' where id=$1", [h.restaurant])
  for (const role of ['manager','waiter','cashier','kitchen']) {
    roles[role] = randomUUID()
    await h.db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [roles[role], `${role}@notify.test`])
    await h.db.query('insert into restaurant_team(restaurant_id,user_id,role,display_name) values($1,$2,$3,$3)', [h.restaurant, roles[role], role])
  }
  await h.as(h.owner); await h.ownerAction('settings', h.settings)
  async function call(name, args = {}, user = h.owner) {
    await h.as(user, user ? 'authenticated' : 'service_role')
    const keys = Object.keys(args)
    return (await h.db.query(`select public.${name}(${keys.map((key,i) => `${key} => $${i+1}`).join(',')}) result`, keys.map(key => typeof args[key] === 'object' && args[key] !== null ? JSON.stringify(args[key]) : args[key]))).rows[0].result
  }
  async function submit(key = randomUUID()) {
    return call('orders_submit', { p_slug:'green-bistro',p_key:key,p_name:'Guest',p_phone:'9999999999',p_note:'Private kitchen note',p_items:[{dishId:h.dish,quantity:1}] }, null)
  }
  const feed = (user = h.owner, extra = {}) => call('notification_feed', { p_restaurant_id:h.restaurant,...extra }, user)
  return { ...h, roles, call, submit, feed }
}
module.exports = { notificationFixture }
