'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const EXP = ['Rent','Food','Transport','Airtime & Data','Bills','Health','Education','Eating out','Entertainment','Shopping','Subscriptions','Other'];
const INC = ['Salary','Business','Allowance','Gift','Other'];
const WANTS = ['Eating out','Entertainment','Shopping','Subscriptions'];
const COL = ['#0E6B5A','#C98200','#3B6FB6','#C23B22','#7A5AA6','#2E9C8A','#8C6D3F','#D2557A','#5C7F2E','#4A5568','#E08A3C','#9AA5A1'];
const CURS = ['KES','USD','UGX','TZS','EUR','GBP'];
const TITLES = {overview:'Overview', tx:'Transactions', budgets:'Budgets', goals:'Goals'};
const K = {users:'akiba_users', session:'akiba_session', data:e => 'akiba_data_' + e};

const sum = a => a.reduce((s, x) => s + x.amt, 0);
const pct = n => Math.round(n * 100) + '%';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Could not save. Check that browser storage is allowed.'); } }

let U = null, D = null, month = today().slice(0, 7), mode = 'login', tt;
const persist = () => save(K.data(U), D);
const money = n => new Intl.NumberFormat(undefined, {style:'currency', currency:D.cur, maximumFractionDigits:0}).format(n);

function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 3500);
}

/* ---------- accounts ---------- */
async function hash(pw, salt, fallback) {
  const s = salt + pw;
  if (!fallback) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return 's' + [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return 'f' + h;
}
const noSubtle = () => !(window.crypto && crypto.subtle);

function setMode(m) {
  mode = m;
  $('#tLogin').classList.toggle('on', m === 'login');
  $('#tSignup').classList.toggle('on', m === 'signup');
  $('#nameRow').hidden = m === 'login';
  $('#authBtn').textContent = m === 'login' ? 'Log in' : 'Create account';
  $('#aPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#authErr').textContent = '';
}
$('#tLogin').onclick = () => setMode('login');
$('#tSignup').onclick = () => setMode('signup');

$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const err = $('#authErr'), email = $('#aEmail').value.trim().toLowerCase(), pw = $('#aPass').value, name = $('#aName').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Enter a valid email address.'; return; }
  if (pw.length < 6) { err.textContent = 'Use a password with at least 6 characters.'; return; }
  const users = load(K.users, {});
  if (mode === 'signup') {
    if (!name) { err.textContent = 'Enter your name.'; return; }
    if (users[email]) { err.textContent = 'This email already has an account. Log in instead.'; return; }
    const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    users[email] = {name, salt, hash: await hash(pw, salt, noSubtle())};
    save(K.users, users);
  } else {
    const u = users[email], fb = u && u.hash[0] === 'f';
    if (!u || (!fb && noSubtle()) || u.hash !== await hash(pw, u.salt, fb)) { err.textContent = 'Email or password is incorrect.'; return; }
  }
  save(K.session, email);
  enter(email);
};

function enter(email) {
  const u = load(K.users, {})[email];
  if (!u) { signOut(); return; }
  U = email;
  D = Object.assign({tx:[], budgets:{}, goals:[], cur:'KES'}, load(K.data(email), {}));
  $('#auth').hidden = true; $('#app').hidden = false;
  $('#who').textContent = u.name;
  $('#month').value = month; $('#cur').value = D.cur;
  $('#txDate').value = today();
  fillCats(); show('overview');
}
function signOut() {
  localStorage.removeItem(K.session); U = D = null;
  $('#app').hidden = true; $('#auth').hidden = false;
  $('#authForm').reset(); setMode('login');
}
$('#out').onclick = signOut;

/* ---------- navigation ---------- */
function show(v) {
  $$('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#title').textContent = TITLES[v];
  renderAll();
}
function fillCats() {
  const type = $('input[name=type]:checked').value;
  $('#txCat').innerHTML = (type === 'out' ? EXP : INC).map(c => `<option>${esc(c)}</option>`).join('');
}
$$('input[name=type]').forEach(r => r.onchange = fillCats);
$('#month').onchange = e => { if (e.target.value) { month = e.target.value; renderAll(); } };
$('#cur').innerHTML = CURS.map(c => `<option>${c}</option>`).join('');
$('#cur').onchange = e => { D.cur = e.target.value; persist(); renderAll(); };

/* ---------- calculations and coach ---------- */
function calc() {
  const t = D.tx.filter(x => x.date.startsWith(month));
  const inc = sum(t.filter(x => x.type === 'in')), out = t.filter(x => x.type === 'out'), spent = sum(out), by = {};
  out.forEach(x => by[x.cat] = (by[x.cat] || 0) + x.amt);
  return {t, inc, spent, by, left: inc - spent, rate: inc > 0 ? (inc - spent) / inc : null};
}

function coach(c) {
  const a = [], add = (l, t) => a.push({l, t});
  if (!c.t.length) return [{l:'tip', t:'Nothing logged for this month yet. Add your income first, then each expense as it happens.'}];
  const [y, m] = month.split('-').map(Number), dim = new Date(y, m, 0).getDate();
  const isNow = month === today().slice(0, 7), day = new Date().getDate();

  if (c.inc === 0 && c.spent > 0) add('warn', `You have spent ${money(c.spent)} but logged no income. Add your income so these numbers are accurate.`);
  if (c.inc > 0) {
    if (c.spent > c.inc) add('bad', `You are overspending by ${money(c.spent - c.inc)}. Spending is above income, so you are using savings or borrowing. Cut the largest non-essential categories first.`);
    else if (c.rate < 0.2) add('warn', `You are saving ${pct(c.rate)} of your income. Aim for at least 20%. Cutting ${money(c.inc * 0.2 - c.left)} from spending would get you there.`);
    else add('ok', `You are saving ${pct(c.rate)} of your income. Keep it up.`);

    const wants = WANTS.reduce((s, k) => s + (c.by[k] || 0), 0);
    if (wants / c.inc > 0.3) add('warn', `Wants (eating out, entertainment, shopping, subscriptions) use ${pct(wants / c.inc)} of income. Keep them under 30%.`);

    const big = c.t.filter(x => x.type === 'out' && x.cat !== 'Rent').sort((p, q) => q.amt - p.amt)[0];
    if (big && big.amt > 0.3 * c.inc) add('warn', `One ${big.cat} expense of ${money(big.amt)} is over 30% of your income. Check that it was planned.`);
  }

  const budgeted = Object.keys(D.budgets).length;
  Object.entries(D.budgets).forEach(([k, b]) => {
    const s = c.by[k] || 0, r = s / b;
    if (r > 1) add('bad', `${k}: over budget by ${money(s - b)}. Stop spending here for the rest of the month if you can.`);
    else if (r >= 0.8) add('warn', `${k}: ${pct(r)} of the budget used, ${money(b - s)} left.`);
  });
  if (!budgeted) add('tip', 'You have no budgets yet. Open Budgets and set a monthly limit for each category so Akiba can warn you before you overspend.');

  if (isNow && c.inc > 0 && day >= 5 && c.spent <= c.inc) {
    const proj = c.spent / day * dim;
    if (proj > c.inc) add('warn', `At this pace you will spend about ${money(proj)} this month, more than your income of ${money(c.inc)}. Slow down.`);
  }

  const seen = {};
  c.t.forEach(x => { if (x.type === 'out') (seen[x.cat + '|' + x.amt + '|' + x.date] = seen[x.cat + '|' + x.amt + '|' + x.date] || []).push(x); });
  Object.values(seen).filter(v => v.length > 1).forEach(v => add('warn', `Possible duplicate: ${v.length} ${v[0].cat} expenses of ${money(v[0].amt)} on ${v[0].date}. Delete any that were entered twice.`));

  const now = new Date();
  D.goals.filter(g => g.date && g.saved < g.target).forEach(g => {
    const dl = new Date(g.date + 'T00:00:00');
    if (dl < now) { add('warn', `The target date for "${g.name}" has passed and you still need ${money(g.target - g.saved)}. Set a new date.`); return; }
    const mo = Math.max(1, (dl.getFullYear() - now.getFullYear()) * 12 + dl.getMonth() - now.getMonth());
    add('tip', `To reach "${g.name}" by ${g.date}, save about ${money((g.target - g.saved) / mo)} a month.`);
  });

  if (!a.some(x => x.l === 'bad' || x.l === 'warn')) add('ok', 'No problems found. Keep logging as you spend.');
  const order = {bad:0, warn:1, tip:2, ok:3};
  return a.sort((p, q) => order[p.l] - order[q.l]);
}

/* ---------- rendering ---------- */
function renderAll() { if (D) { ov(); txl(); bud(); gl(); } }

function ov() {
  const c = calc(), a = coach(c), ent = Object.entries(c.by).sort((p, q) => q[1] - p[1]);
  let acc = 0;
  const stops = ent.map(([, v], i) => { const s = acc / c.spent * 100; acc += v; return `${COL[i % COL.length]} ${s}% ${acc / c.spent * 100}%`; }).join(',');
  $('#v-overview').innerHTML = `
  <div class="stats">
    <div class="stat"><span>Income</span><b>${money(c.inc)}</b></div>
    <div class="stat"><span>Spent</span><b>${money(c.spent)}</b></div>
    <div class="stat ${c.left < 0 ? 'neg' : ''}"><span>Left this month</span><b>${money(c.left)}</b></div>
    <div class="stat"><span>Saved</span><b>${c.rate === null ? '–' : pct(c.rate)}</b></div>
  </div>
  <div class="grid">
    <div class="card"><h3>Coach</h3><ul class="coach">${a.map(x => `<li class="${x.l}">${esc(x.t)}</li>`).join('')}</ul></div>
    <div class="card"><h3>Where it went</h3>${c.spent ? `
      <div class="donut" style="background:conic-gradient(${stops})"><i>${money(c.spent)}</i></div>
      <ul class="legend">${ent.map(([k, v], i) => `<li><s style="background:${COL[i % COL.length]}"></s><span>${esc(k)}</span><b>${money(v)}</b><em>${pct(v / c.spent)}</em></li>`).join('')}</ul>`
      : '<p class="empty">No spending logged this month.</p>'}</div>
  </div>`;
}

function txl() {
  const t = calc().t.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $('#txList').innerHTML = t.length ? t.map(x => `
    <div class="row"><div><b>${esc(x.cat)}</b><small>${x.date}${x.note ? ', ' + esc(x.note) : ''}</small></div>
    <strong class="${x.type}">${x.type === 'in' ? '+' : '−'}${money(x.amt)}</strong>
    <button class="x" data-del="${x.id}" aria-label="Delete transaction">✕</button></div>`).join('')
    : '<p class="empty">No transactions this month. Add your first one above.</p>';
}

function bud() {
  const c = calc();
  $('#v-budgets').innerHTML = `<p class="hint">Set a monthly limit for each category. A common split is 50% needs, 30% wants and 20% savings.</p>
  <div class="card">${EXP.map((k, i) => {
    const b = D.budgets[k] || 0, s = c.by[k] || 0, r = b ? s / b : 0;
    return `<div class="brow"><label for="b${i}">${esc(k)}</label>
      <input id="b${i}" type="number" min="0" step="any" inputmode="decimal" value="${b || ''}" placeholder="No limit" data-bud="${esc(k)}">
      <div class="bar ${r > 1 ? 'bad' : r >= 0.8 ? 'warn' : ''}"><i style="width:${Math.min(r, 1) * 100}%"></i></div>
      <small>${b ? `${money(s)} of ${money(b)} used` : `${money(s)} spent`}</small></div>`;
  }).join('')}</div>`;
}

function gl() {
  $('#goalList').innerHTML = D.goals.length ? D.goals.map(g => {
    const r = Math.min(g.saved / g.target, 1);
    return `<div class="card goal">
      <div class="grow"><b>${esc(g.name)}</b><button class="x" data-gdel="${g.id}" aria-label="Delete goal">✕</button></div>
      <div class="bar"><i style="width:${r * 100}%"></i></div>
      <div class="grow"><small>${money(g.saved)} of ${money(g.target)} (${pct(r)})</small><button class="btn sm" data-gadd="${g.id}">Add money</button></div>
      ${g.date ? `<small>Target date: ${g.date}</small>` : ''}</div>`;
  }).join('') : '<p class="empty">No goals yet. Name something you are saving for and set a target.</p>';
}

/* ---------- actions ---------- */
$('#txForm').onsubmit = e => {
  e.preventDefault();
  const type = $('input[name=type]:checked').value, amt = parseFloat($('#txAmt').value), cat = $('#txCat').value, date = $('#txDate').value, note = $('#txNote').value.trim();
  if (!(amt > 0)) { toast('Enter an amount greater than zero.'); return; }
  if (!date) { toast('Pick a date.'); return; }
  if (type === 'out') {
    const t = D.tx.filter(x => x.date.startsWith(date.slice(0, 7))), outs = t.filter(x => x.type === 'out');
    const inc = sum(t.filter(x => x.type === 'in')), sp = sum(outs), cs = sum(outs.filter(x => x.cat === cat)), b = D.budgets[cat], w = [];
    if (b > 0 && cs + amt > b) w.push(`This puts ${cat} ${money(cs + amt - b)} over its budget.`);
    if (inc > 0 && sp + amt > inc) w.push(`Your spending for that month would be ${money(sp + amt - inc)} more than your income.`);
    if (w.length && !confirm(w.join('\n') + '\n\nAdd it anyway?')) return;
  }
  D.tx.push({id:Date.now(), type, amt, cat, date, note});
  persist();
  $('#txAmt').value = ''; $('#txNote').value = '';
  month = date.slice(0, 7); $('#month').value = month;
  renderAll(); toast('Transaction added.');
};

$('#goalForm').onsubmit = e => {
  e.preventDefault();
  const name = $('#gName').value.trim(), target = parseFloat($('#gTarget').value), saved = parseFloat($('#gSaved').value) || 0, date = $('#gDate').value;
  if (!name) { toast('Name your goal.'); return; }
  if (!(target > 0)) { toast('Enter a target amount greater than zero.'); return; }
  D.goals.push({id:Date.now(), name, target, saved: Math.max(0, saved), date});
  persist(); $('#goalForm').reset(); renderAll(); toast('Goal added.');
};

document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.bud;
  if (k === undefined) return;
  const v = parseFloat(e.target.value);
  if (v > 0) D.budgets[k] = v; else delete D.budgets[k];
  persist(); renderAll();
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-view],[data-del],[data-gdel],[data-gadd]');
  if (!t || !D) return;
  const d = t.dataset;
  if (d.view) show(d.view);
  else if (d.del) { D.tx = D.tx.filter(x => String(x.id) !== d.del); persist(); renderAll(); toast('Transaction deleted.'); }
  else if (d.gdel) { D.goals = D.goals.filter(x => String(x.id) !== d.gdel); persist(); renderAll(); toast('Goal deleted.'); }
  else if (d.gadd) {
    const g = D.goals.find(x => String(x.id) === d.gadd), v = parseFloat(prompt('How much do you want to add to "' + g.name + '"?'));
    if (!(v > 0)) return;
    g.saved += v; persist(); renderAll();
    toast(g.saved >= g.target ? 'Goal reached. Well done!' : 'Money added to goal.');
  }
});

/* ---------- start ---------- */
setMode('login');
const sess = load(K.session, null);
if (sess) enter(sess);
