const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3100;
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'gym_access.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, 'frontend')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
function setting(key, fallback='') { return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback; }
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}

function sha256(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function nowIso() { return new Date().toISOString(); }
function todayDate() { return new Date().toISOString().slice(0,10); }
function addDays(baseDateString, days) {
  const d = baseDateString ? new Date(baseDateString + 'T12:00:00') : new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0,10);
}
function clientIp(req) { return req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''; }

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      days INTEGER NOT NULL,
      price REAL NOT NULL,
      enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'bar',
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      birth_date TEXT,
      member_since TEXT NOT NULL,
      notes TEXT,
      medical_certificate_expiry TEXT,
      regulation_signed INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_code TEXT UNIQUE NOT NULL,
      nfc_serial TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      status TEXT DEFAULT 'active',
      url TEXT,
      access_level TEXT DEFAULT 'member',
      created_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      valid_until TEXT NOT NULL,
      revoked INTEGER DEFAULT 0,
      revoked_reason TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      card_id INTEGER,
      operator_id INTEGER,
      price_code TEXT,
      amount REAL NOT NULL,
      days_added INTEGER NOT NULL,
      old_expiry TEXT,
      new_expiry TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      ip TEXT,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS one_shot_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      granted_by_operator_id INTEGER,
      used INTEGER DEFAULT 0,
      used_at TEXT,
      created_at TEXT NOT NULL,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nfc_serial TEXT,
      card_code TEXT,
      customer_id INTEGER,
      device_id TEXT,
      result TEXT NOT NULL,
      reason TEXT,
      source TEXT DEFAULT 'esp32',
      created_at TEXT NOT NULL,
      synced_at TEXT,
      ip TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cleaning_diary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      card_code TEXT,
      nfc_serial TEXT,
      device_id TEXT,
      action TEXT DEFAULT 'cleaner_access',
      note TEXT,
      created_at TEXT NOT NULL,
      ip TEXT
    );
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      last_sync TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn('cards','access_level',"TEXT DEFAULT 'member'");
  ensureColumn('customers','emergency_contact',"TEXT DEFAULT ''");
  const adminPass = db.prepare('SELECT value FROM settings WHERE key=?').get('admin_password_hash');
  if (!adminPass) db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('admin_password_hash', sha256('babyjake'));
  const gymName = db.prepare('SELECT value FROM settings WHERE key=?').get('gym_name');
  if (!gymName) db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('gym_name', 'Palestra Proloco Molini di Triora');
  const defaults = {
    theme:'clean-light', accent:'#16a34a', logo_text:'PG', open_seconds:'5', anti_passback_seconds:'60',
    allowed_from:'06:00', allowed_to:'23:00', max_daily_accesses:'0', public_message:'Allenati in sicurezza. Rispetta gli spazi e il regolamento della palestra.'
  };
  for (const [k,v] of Object.entries(defaults)) if (!db.prepare('SELECT value FROM settings WHERE key=?').get(k)) setSetting(k,v);

  const pricesCount = db.prepare('SELECT COUNT(*) c FROM prices').get().c;
  if (!pricesCount) {
    const ins = db.prepare('INSERT INTO prices(code,label,days,price) VALUES(?,?,?,?)');
    ins.run('daily','Giornaliero',1,5);
    ins.run('monthly','Mensile 31 giorni',31,30);
    ins.run('yearly','Annuale 366 giorni',366,250);
  }
  const opCount = db.prepare('SELECT COUNT(*) c FROM operators').get().c;
  if (!opCount) {
    db.prepare('INSERT INTO operators(username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run('gallonero','Bar Il Gallo Nero',sha256('gallo123'),'bar',nowIso());
  }
  const devCount = db.prepare('SELECT COUNT(*) c FROM devices').get().c;
  if (!devCount) {
    db.prepare('INSERT INTO devices(device_id,label,api_key_hash,created_at) VALUES(?,?,?,?)')
      .run('porta-palestra-01','Porta principale palestra',sha256('CAMBIA_QUESTA_CHIAVE'),nowIso());
  }
}
initDb();

function logAdmin(req, action, details = {}, operator = null) {
  db.prepare('INSERT INTO admin_logs(operator_id,username,action,details,ip,created_at) VALUES(?,?,?,?,?,?)')
    .run(operator?.id || null, operator?.username || null, action, JSON.stringify(details), clientIp(req), nowIso());
}
function requireAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.body.adminPassword || req.query.adminPassword;
  const saved = db.prepare('SELECT value FROM settings WHERE key=?').get('admin_password_hash')?.value;
  if (sha256(pass || '') !== saved) return res.status(401).json({ ok:false, error:'Password admin non valida' });
  next();
}
function requireOperator(req, res, next) {
  const username = req.headers['x-operator-username'] || req.body.username;
  const password = req.headers['x-operator-password'] || req.body.password;
  const op = db.prepare('SELECT * FROM operators WHERE username=? AND active=1').get(username || '');
  if (!op || op.password_hash !== sha256(password || '')) return res.status(401).json({ ok:false, error:'Login amministrazione non valido' });
  req.operator = op;
  next();
}

app.get('/', (req,res)=>res.redirect('/public'));
app.get('/admin', (req,res)=>res.sendFile(path.join(ROOT,'frontend','admin','index.html')));
app.get('/bar', (req,res)=>res.sendFile(path.join(ROOT,'frontend','bar','index.html')));
app.get('/totem', (req,res)=>res.sendFile(path.join(ROOT,'frontend','totem','index.html')));
app.get('/public', (req,res)=>res.sendFile(path.join(ROOT,'frontend','public','index.html')));
app.get('/api/public/settings', (req,res)=>{
  const rows = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x=>[x.key,x.value]));
  res.json({ok:true, settings:{gym_name:rows.gym_name, theme:rows.theme, accent:rows.accent, logo_text:rows.logo_text, public_message:rows.public_message, allowed_from:rows.allowed_from, allowed_to:rows.allowed_to}});
});

app.post('/api/admin/login', requireAdmin, (req,res)=>{ logAdmin(req,'admin_login'); res.json({ok:true}); });
app.get('/api/admin/dashboard', requireAdmin, (req,res)=>{
  const stats = {
    customers: db.prepare('SELECT COUNT(*) c FROM customers').get().c,
    activeCards: db.prepare("SELECT COUNT(*) c FROM cards WHERE status='active'").get().c,
    expiringSoon: db.prepare("SELECT COUNT(*) c FROM subscriptions WHERE revoked=0 AND valid_until BETWEEN ? AND ?").get(todayDate(), addDays(todayDate(),7)).c,
    todayAccesses: db.prepare("SELECT COUNT(*) c FROM access_logs WHERE result='granted' AND created_at LIKE ?").get(todayDate()+'%').c,
    deniedToday: db.prepare("SELECT COUNT(*) c FROM access_logs WHERE result='denied' AND created_at LIKE ?").get(todayDate()+'%').c
  };
  res.json({ok:true, stats});
});

app.get('/api/admin/settings', requireAdmin, (req,res)=>{
  const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x=>[x.key,x.value]));
  res.json({ok:true, settings});
});
app.post('/api/admin/settings', requireAdmin, (req,res)=>{
  const allowed = ['gym_name','theme','accent','logo_text','open_seconds','anti_passback_seconds','allowed_from','allowed_to','max_daily_accesses','public_message'];
  for (const k of allowed) if (Object.prototype.hasOwnProperty.call(req.body,k)) setSetting(k, req.body[k]);
  logAdmin(req,'save_settings',req.body); res.json({ok:true});
});
app.get('/api/admin/cleaning-diary', requireAdmin, (req,res)=>{
  res.json({ok:true, entries:db.prepare('SELECT * FROM cleaning_diary ORDER BY id DESC LIMIT 300').all()});
});

app.get('/api/admin/prices', requireAdmin, (req,res)=>res.json({ok:true, prices:db.prepare('SELECT * FROM prices ORDER BY id').all()}));
app.post('/api/admin/prices', requireAdmin, (req,res)=>{
  const {code,label,days,price,enabled=1}=req.body;
  db.prepare('INSERT INTO prices(code,label,days,price,enabled) VALUES(?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET label=excluded.label,days=excluded.days,price=excluded.price,enabled=excluded.enabled')
    .run(code,label,days,price,enabled?1:0);
  logAdmin(req,'save_price',req.body); res.json({ok:true});
});
app.get('/api/admin/operators', requireAdmin, (req,res)=>res.json({ok:true, operators:db.prepare('SELECT id,username,display_name,role,active,created_at FROM operators ORDER BY id DESC').all()}));
app.post('/api/admin/operators', requireAdmin, (req,res)=>{
  const {username,displayName,password,role='bar'}=req.body;
  db.prepare('INSERT INTO operators(username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?)').run(username,displayName,sha256(password),role,nowIso());
  logAdmin(req,'create_operator',{username,displayName,role}); res.json({ok:true});
});
app.get('/api/admin/customers', requireAdmin, (req,res)=>{
  const rows = db.prepare(`SELECT c.*, ca.card_code, ca.nfc_serial, ca.status card_status, ca.access_level, s.valid_until, s.revoked
    FROM customers c LEFT JOIN cards ca ON ca.customer_id=c.id LEFT JOIN subscriptions s ON s.customer_id=c.id
    ORDER BY c.id DESC`).all();
  res.json({ok:true, customers:rows});
});
app.post('/api/admin/customers', requireAdmin, (req,res)=>{
  const b=req.body;
  const memberCode = b.memberCode || ('GYM-' + String(Date.now()).slice(-6));
  const info = db.prepare(`INSERT INTO customers(member_code,full_name,phone,email,address,birth_date,member_since,notes,medical_certificate_expiry,regulation_signed,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(memberCode,b.fullName,b.phone||'',b.email||'',b.address||'',b.birthDate||'',b.memberSince||todayDate(),b.notes||'',b.medicalCertificateExpiry||'',b.regulationSigned?1:0,nowIso());
  const customerId = info.lastInsertRowid;
  if (b.cardCode && b.nfcSerial) {
    db.prepare('INSERT INTO cards(card_code,nfc_serial,customer_id,url,access_level,created_at) VALUES(?,?,?,?,?,?)').run(b.cardCode,b.nfcSerial,customerId,b.url||'',b.accessLevel||'member',nowIso());
  }
  db.prepare('INSERT INTO subscriptions(customer_id,valid_until,updated_at) VALUES(?,?,?)').run(customerId,b.validUntil||todayDate(),nowIso());
  logAdmin(req,'create_customer',{customerId,memberCode}); res.json({ok:true, customerId});
});
app.post('/api/admin/revoke', requireAdmin, (req,res)=>{
  const {customerId, revoked, reason}=req.body;
  db.prepare('UPDATE subscriptions SET revoked=?, revoked_reason=?, updated_at=? WHERE customer_id=?').run(revoked?1:0,reason||'',nowIso(),customerId);
  logAdmin(req,'revoke_access',req.body); res.json({ok:true});
});
app.get('/api/admin/logs', requireAdmin, (req,res)=>{
  res.json({ok:true, accessLogs:db.prepare('SELECT * FROM access_logs ORDER BY id DESC LIMIT 200').all(), adminLogs:db.prepare('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 200').all()});
});
app.get('/api/admin/payments', requireAdmin, (req,res)=>res.json({ok:true, payments:db.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 300').all()}));
app.post('/api/admin/backup', requireAdmin, (req,res)=>{
  const file = path.join(BACKUP_DIR, `backup-${new Date().toISOString().replace(/[:.]/g,'-')}.db`);
  fs.copyFileSync(DB_FILE,file); logAdmin(req,'backup',{file}); res.json({ok:true,file:path.basename(file)});
});

app.post('/api/operator/login', requireOperator, (req,res)=>{ logAdmin(req,'operator_login',{},req.operator); res.json({ok:true, operator:{username:req.operator.username,displayName:req.operator.display_name}}); });
app.get('/api/operator/search-card', requireOperator, (req,res)=>{
  const q = req.query.q || '';
  const row = db.prepare(`SELECT c.*, ca.id card_id, ca.card_code, ca.nfc_serial, ca.status card_status, ca.access_level, s.valid_until, s.revoked
    FROM cards ca JOIN customers c ON c.id=ca.customer_id LEFT JOIN subscriptions s ON s.customer_id=c.id
    WHERE ca.card_code=? OR ca.nfc_serial=? OR c.member_code=?`).get(q,q,q);
  if (!row) return res.status(404).json({ok:false,error:'Tessera/cliente non trovato'});
  res.json({ok:true, customer:row, prices:db.prepare('SELECT * FROM prices WHERE enabled=1 ORDER BY id').all()});
});
app.post('/api/operator/renew', requireOperator, (req,res)=>{
  const {cardCode, priceCode, amount, note}=req.body;
  const card = db.prepare('SELECT * FROM cards WHERE card_code=? OR nfc_serial=?').get(cardCode,cardCode);
  if(!card) return res.status(404).json({ok:false,error:'Tessera non trovata'});
  const price = db.prepare('SELECT * FROM prices WHERE code=? AND enabled=1').get(priceCode);
  if(!price) return res.status(404).json({ok:false,error:'Prezzo non trovato'});
  let sub = db.prepare('SELECT * FROM subscriptions WHERE customer_id=?').get(card.customer_id);
  const base = sub && sub.valid_until >= todayDate() ? sub.valid_until : todayDate();
  const newExpiry = addDays(base, price.days);
  if (!sub) db.prepare('INSERT INTO subscriptions(customer_id,valid_until,updated_at) VALUES(?,?,?)').run(card.customer_id,newExpiry,nowIso());
  else db.prepare('UPDATE subscriptions SET valid_until=?, revoked=0, updated_at=? WHERE customer_id=?').run(newExpiry,nowIso(),card.customer_id);
  db.prepare(`INSERT INTO payments(customer_id,card_id,operator_id,price_code,amount,days_added,old_expiry,new_expiry,note,created_at,ip)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(card.customer_id,card.id,req.operator.id,price.code,amount ?? price.price,price.days,sub?.valid_until||'',newExpiry,note||'',nowIso(),clientIp(req));
  logAdmin(req,'renew_subscription',{cardCode,priceCode,newExpiry},req.operator);
  res.json({ok:true,newExpiry});
});
app.post('/api/operator/one-shot', requireOperator, (req,res)=>{
  const {cardCode,note}=req.body;
  const card = db.prepare('SELECT * FROM cards WHERE card_code=? OR nfc_serial=?').get(cardCode,cardCode);
  if(!card) return res.status(404).json({ok:false,error:'Tessera non trovata'});
  db.prepare('INSERT INTO one_shot_entries(customer_id,card_id,granted_by_operator_id,created_at,note) VALUES(?,?,?,?,?)').run(card.customer_id,card.id,req.operator.id,nowIso(),note||'');
  logAdmin(req,'grant_one_shot',{cardCode},req.operator); res.json({ok:true});
});

app.get('/api/totem/card', (req,res)=>{
  const q=req.query.q||'';
  const row=db.prepare(`SELECT c.member_code,c.full_name,c.member_since,c.medical_certificate_expiry,c.regulation_signed, ca.card_code, s.valid_until, s.revoked
    FROM cards ca JOIN customers c ON c.id=ca.customer_id LEFT JOIN subscriptions s ON s.customer_id=c.id WHERE ca.card_code=? OR ca.nfc_serial=?`).get(q,q);
  if(!row) return res.status(404).json({ok:false,error:'Tessera non trovata'});
  const logs=db.prepare('SELECT result,reason,created_at FROM access_logs WHERE card_code=? OR nfc_serial=? ORDER BY id DESC LIMIT 20').all(row.card_code,q);
  res.json({ok:true, profile:row, logs});
});

function verifyDevice(req) {
  const key = req.query.deviceKey || req.body.deviceKey || req.headers['x-device-key'];
  const deviceId = req.query.deviceId || req.body.deviceId || req.headers['x-device-id'] || 'porta-palestra-01';
  const dev = db.prepare('SELECT * FROM devices WHERE device_id=? AND active=1').get(deviceId);
  return dev && dev.api_key_hash === sha256(key || '') ? dev : null;
}
app.get('/api/esp32/access-list', (req,res)=>{
  const dev = verifyDevice(req); if(!dev) return res.status(401).json({ok:false,error:'Device non autorizzato'});
  db.prepare('UPDATE devices SET last_sync=? WHERE id=?').run(nowIso(),dev.id);
  const rows = db.prepare(`SELECT ca.nfc_serial, ca.card_code, ca.status, ca.access_level, c.id customer_id, c.full_name, s.valid_until, s.revoked,
    (SELECT COUNT(*) FROM one_shot_entries o WHERE o.card_id=ca.id AND o.used=0) one_shot
    FROM cards ca JOIN customers c ON c.id=ca.customer_id LEFT JOIN subscriptions s ON s.customer_id=c.id
    WHERE c.active=1`).all();
  const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x=>[x.key,x.value]));
  res.json({ok:true, generatedAt:nowIso(), deviceId:dev.device_id, settings:{openSeconds:Number(settings.open_seconds||5), antiPassbackSeconds:Number(settings.anti_passback_seconds||60), allowedFrom:settings.allowed_from||'06:00', allowedTo:settings.allowed_to||'23:00', maxDailyAccesses:Number(settings.max_daily_accesses||0), gymName:settings.gym_name, theme:settings.theme, accent:settings.accent}, cards:rows});
});
app.post('/api/esp32/log-access', (req,res)=>{
  const dev = verifyDevice(req); if(!dev) return res.status(401).json({ok:false,error:'Device non autorizzato'});
  const b=req.body;
  const card = db.prepare('SELECT * FROM cards WHERE nfc_serial=?').get(b.nfcSerial||'');
  let customerId = card?.customer_id || null;
  let cardCode = card?.card_code || b.cardCode || '';
  db.prepare('INSERT INTO access_logs(nfc_serial,card_code,customer_id,device_id,result,reason,created_at,synced_at,ip) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(b.nfcSerial||'',cardCode,customerId,dev.device_id,b.result||'unknown',b.reason||'',b.createdAt||nowIso(),nowIso(),clientIp(req));
  if ((b.result==='granted' || b.result==='granted_cleaner') && card && card.access_level==='cleaner') {
    db.prepare('INSERT INTO cleaning_diary(customer_id,card_code,nfc_serial,device_id,action,note,created_at,ip) VALUES(?,?,?,?,?,?,?,?)')
      .run(card.customer_id, card.card_code, card.nfc_serial, dev.device_id, 'cleaner_access', b.note||'Accesso pulizie registrato automaticamente', b.createdAt||nowIso(), clientIp(req));
  }
  if (b.result==='granted_one_shot' && card) {
    const one = db.prepare('SELECT * FROM one_shot_entries WHERE card_id=? AND used=0 ORDER BY id LIMIT 1').get(card.id);
    if(one) db.prepare('UPDATE one_shot_entries SET used=1, used_at=? WHERE id=?').run(nowIso(),one.id);
  }
  res.json({ok:true});
});

app.listen(PORT,()=>console.log(`Proloco Gym Access avviato su http://localhost:${PORT}`));
