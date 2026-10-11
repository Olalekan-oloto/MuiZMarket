require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const path = require("path");
const Stripe = require("stripe");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET === 'development-only-change-me')) { throw new Error('Set a strong SESSION_SECRET (at least 32 characters) before production deployment.'); }
const db = new Database(process.env.DATABASE_FILE || "./muizmarket.sqlite");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verification_hash TEXT,
  email_verification_expires_at TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','seller','admin')),
  seller_status TEXT NOT NULL DEFAULT 'none',
  payout_currency TEXT NOT NULL DEFAULT 'NGN',
  payout_bank_name TEXT,
  payout_bank_code TEXT,
  payout_account_name TEXT,
  payout_account_number TEXT,
  payout_account_verified INTEGER NOT NULL DEFAULT 0,
  payout_phone TEXT,
  payout_country TEXT NOT NULL DEFAULT 'NG',
  flutterwave_subaccount_id TEXT,
  seller_trial_started_at TEXT,
  seller_trial_ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  icon TEXT NOT NULL DEFAULT '✦',
  active INTEGER NOT NULL DEFAULT 1,
  seller_id INTEGER REFERENCES users(id),
  approval_status TEXT NOT NULL DEFAULT 'approved',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT UNIQUE,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  seller_id INTEGER REFERENCES users(id),
  gross_cents INTEGER NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  seller_net_cents INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS seller_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES users(id),
  plan_code TEXT NOT NULL CHECK(plan_code IN ('monthly','quarterly','yearly')), currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL DEFAULT 'flutterwave', provider_reference TEXT UNIQUE,
  provider_plan_id TEXT, provider_transaction_id TEXT, provider_subscription_id TEXT,
  last_payment_at TEXT, current_period_end TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS processed_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, provider_transaction_id TEXT NOT NULL UNIQUE, tx_ref TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS commission_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id),
  seller_id INTEGER NOT NULL REFERENCES users(id), currency TEXT NOT NULL, gross_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL, seller_net_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_id, seller_id)
);
CREATE TABLE IF NOT EXISTS payout_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES users(id), currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), status TEXT NOT NULL DEFAULT 'requested',
  provider_reference TEXT, reviewed_by INTEGER REFERENCES users(id), note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payout_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, payout_id INTEGER NOT NULL REFERENCES payout_requests(id) ON DELETE CASCADE,
  ledger_id INTEGER NOT NULL REFERENCES commission_ledger(id), amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  UNIQUE(payout_id, ledger_id)
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id), name TEXT NOT NULL, email TEXT NOT NULL,
  subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  owner_reply TEXT, replied_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

// Backward-compatible schema upgrades for existing starter databases.
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumnIfMissing('users','email_verified','INTEGER NOT NULL DEFAULT 1');
addColumnIfMissing('users','email_verification_hash','TEXT');
addColumnIfMissing('users','email_verification_expires_at','TEXT');
addColumnIfMissing('users','seller_status',"TEXT NOT NULL DEFAULT 'none'");
addColumnIfMissing('users','payout_currency',"TEXT NOT NULL DEFAULT 'NGN'");
addColumnIfMissing('users','payout_bank_name','TEXT');
addColumnIfMissing('users','payout_bank_code','TEXT');
addColumnIfMissing('users','payout_account_name','TEXT');
addColumnIfMissing('users','payout_account_number','TEXT');
addColumnIfMissing('users','payout_account_verified','INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users','payout_phone','TEXT');
addColumnIfMissing('users','payout_country',"TEXT NOT NULL DEFAULT 'NG'");
addColumnIfMissing('users','flutterwave_subaccount_id','TEXT');
addColumnIfMissing('users','seller_trial_started_at','TEXT');
addColumnIfMissing('users','seller_trial_ends_at','TEXT');
addColumnIfMissing('seller_subscriptions','provider_plan_id','TEXT');
addColumnIfMissing('seller_subscriptions','provider_transaction_id','TEXT');
addColumnIfMissing('seller_subscriptions','provider_subscription_id','TEXT');
addColumnIfMissing('seller_subscriptions','last_payment_at','TEXT');
addColumnIfMissing('products','seller_id','INTEGER REFERENCES users(id)');
addColumnIfMissing('products','approval_status',"TEXT NOT NULL DEFAULT 'approved'");
addColumnIfMissing('products','currency',"TEXT NOT NULL DEFAULT 'USD'");
addColumnIfMissing('orders','currency',"TEXT NOT NULL DEFAULT 'USD'");
addColumnIfMissing('order_items','seller_id','INTEGER REFERENCES users(id)');
addColumnIfMissing('order_items','gross_cents','INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('order_items','commission_cents','INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('order_items','seller_net_cents','INTEGER NOT NULL DEFAULT 0');

// Upgrade older starter databases whose subscription CHECK constraint allowed only monthly/yearly.
const subscriptionSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='seller_subscriptions'").get()?.sql || '';
if (!subscriptionSchema.includes("'quarterly'")) {
  db.pragma('foreign_keys = OFF');
  db.exec(`CREATE TABLE seller_subscriptions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES users(id),
    plan_code TEXT NOT NULL CHECK(plan_code IN ('monthly','quarterly','yearly')), currency TEXT NOT NULL,
    amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT NOT NULL DEFAULT 'flutterwave', provider_reference TEXT UNIQUE,
    provider_plan_id TEXT, provider_transaction_id TEXT, provider_subscription_id TEXT,
    last_payment_at TEXT, current_period_end TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO seller_subscriptions_new (id,seller_id,plan_code,currency,amount_cents,status,provider,provider_reference,provider_plan_id,provider_transaction_id,provider_subscription_id,last_payment_at,current_period_end,cancel_at_period_end,created_at,updated_at)
  SELECT id,seller_id,plan_code,currency,amount_cents,status,provider,provider_reference,provider_plan_id,provider_transaction_id,last_payment_at,current_period_end,cancel_at_period_end,created_at,updated_at FROM seller_subscriptions;
  DROP TABLE seller_subscriptions;
  ALTER TABLE seller_subscriptions_new RENAME TO seller_subscriptions;`);
  db.pragma('foreign_keys = ON');
}

const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (!productCount) {
  const insert = db.prepare(`INSERT INTO products (name, category, description, price_cents, icon) VALUES (?, ?, ?, ?, ?)`);
  const seed = db.transaction(() => {
    [
      ["Creator Toolkit", "Digital tools", "A curated set of practical tools for creators and small teams.", 1299, "✦"],
      ["Productivity Plus", "Subscriptions", "A digital productivity bundle to help organize your workflow.", 1999, "◈"],
      ["Design Resource Pack", "Creative assets", "Editable design resources for personal projects and commercial work where licensed.", 1599, "◇"],
      ["Website Starter Kit", "Templates", "A clean starter template for your next web project.", 2499, "⌘"],
      ["Learning Bundle", "Education", "A collection of digital learning resources for self-paced study.", 999, "◎"],
      ["Business Essentials", "Digital tools", "Useful planning and operations templates for growing businesses.", 1799, "▣"]
    ].forEach(p => insert.run(...p));
  });
  seed();
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
// Stripe webhook requires the raw request body, so register it before express.json().
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).send("Stripe webhook is not configured.");
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const checkout = event.data.object;
    const order = db.prepare("SELECT id FROM orders WHERE stripe_session_id = ?").get(checkout.id);
    if (order) {
      db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(order.id);
      const lines = db.prepare("SELECT seller_id, gross_cents, commission_cents, seller_net_cents FROM order_items WHERE order_id=? AND seller_id IS NOT NULL").all(order.id);
      const currency = db.prepare("SELECT currency FROM orders WHERE id=?").get(order.id).currency || "USD";
      const addLedger = db.prepare("INSERT OR IGNORE INTO commission_ledger (order_id,seller_id,currency,gross_cents,commission_cents,seller_net_cents,status) VALUES (?,?,?,?,?,?, 'available')");
      for (const line of lines) addLedger.run(order.id,line.seller_id,currency,line.gross_cents,line.commission_cents,line.seller_net_cents);
    }
  }
  res.json({ received: true });
});
app.use(express.json({ limit: "100kb" }));
// Lightweight per-IP limits for authentication endpoints. Use a shared persistent limiter
// for multi-instance production deployments; this in-memory guard is a starter safeguard.
const authRateBuckets = new Map();
function authRateLimit(maxRequests = 10, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip || req.socket.remoteAddress || "unknown"}:${req.path}`;
    let bucket = authRateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    authRateBuckets.set(key, bucket);
    if (authRateBuckets.size > 10000) {
      for (const [k, v] of authRateBuckets) if (v.resetAt <= now) authRateBuckets.delete(k);
    }
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - bucket.count)));
    if (bucket.count > maxRequests) return res.status(429).json({ error: "Too many attempts. Please wait a little while before trying again." });
    next();
  };
}
app.post("/api/flutterwave/webhook", async (req, res) => {
  const signature = req.headers["verif-hash"];
  const expected = process.env.FLW_SECRET_HASH || "";
  const sig = typeof signature === "string" ? signature : "";
  const valid = expected.length > 0 && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid) return res.status(401).send("Invalid webhook signature.");
  const payload = req.body?.data || {};
  if (req.body?.event === "subscription.cancelled") {
    const email = String(payload.customer?.email || payload.customer?.customer_email || "").toLowerCase();
    if (email) db.prepare("UPDATE seller_subscriptions SET cancel_at_period_end=1,updated_at=CURRENT_TIMESTAMP WHERE seller_id IN (SELECT id FROM users WHERE lower(email)=?) AND status IN ('active','past_due')").run(email);
    return res.json({ received: true, subscriptionCancellationRecorded: true });
  }
  if (req.body?.event !== "charge.completed" || !payload.id || !payload.tx_ref) return res.json({ received: true, ignored: true });
  if (String(payload.status || '').toLowerCase() !== 'successful') {
    db.prepare("UPDATE seller_subscriptions SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE provider_reference=? AND status='pending'").run(String(payload.tx_ref));
    return res.json({received:true,ignored:true,reason:'charge not successful'});
  }
  try {
    const verifyResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(payload.id)}/verify`, { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } });
    const verification = await verifyResponse.json();
    const tx = verification?.data;
    if (!verifyResponse.ok || verification.status !== "success" || tx?.status !== "successful" || String(tx.id) !== String(payload.id) || tx.tx_ref !== payload.tx_ref) return res.status(400).send("Transaction verification failed.");
    const txCurrency = String(tx.currency || "").toUpperCase();
    let sub = db.prepare("SELECT * FROM seller_subscriptions WHERE provider_reference=?").get(tx.tx_ref);
    if (!sub && tx.customer?.email) {
      sub = db.prepare("SELECT s.* FROM seller_subscriptions s JOIN users u ON u.id=s.seller_id WHERE lower(u.email)=lower(?) AND s.currency=? AND s.status IN ('active','past_due') ORDER BY s.id DESC LIMIT 1").get(tx.customer.email, txCurrency);
    }
    if (sub) {
      if (txCurrency !== sub.currency || Math.round(Number(tx.amount) * 100) !== sub.amount_cents) return res.status(400).send("Subscription amount or currency mismatch.");
      const seen = db.prepare("INSERT OR IGNORE INTO processed_payments (provider_transaction_id,tx_ref) VALUES (?,?)").run(String(tx.id), String(tx.tx_ref));
      if (!seen.changes) return res.json({ received: true, duplicate: true });
      const base = sub.current_period_end && new Date(sub.current_period_end) > new Date() ? new Date(sub.current_period_end) : new Date();
      if (sub.provider_reference === tx.tx_ref && !sub.last_payment_at) base.setTime(Date.now());
      if (sub.plan_code === "yearly") base.setFullYear(base.getFullYear() + 1); else if (sub.plan_code === "quarterly") base.setMonth(base.getMonth() + 3); else base.setMonth(base.getMonth() + 1);
      db.prepare("UPDATE seller_subscriptions SET status='active',provider_transaction_id=?,last_payment_at=?,current_period_end=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(tx.id), tx.created_at || new Date().toISOString(), base.toISOString(), sub.id);
      db.prepare("UPDATE users SET seller_status='approved' WHERE id=? AND role='seller'").run(sub.seller_id);
      return res.json({ received: true, subscription: true });
    }
    const order = db.prepare("SELECT id,total_cents,currency,status FROM orders WHERE stripe_session_id=?").get(tx.tx_ref);
    if (!order) return res.json({ received: true, ignored: true, reason: "No matching order or subscription." });
    if (txCurrency !== order.currency || Math.round(Number(tx.amount) * 100) !== order.total_cents) return res.status(400).send("Order amount or currency mismatch.");
    const markPaid = db.transaction(() => {
      const seen = db.prepare("INSERT OR IGNORE INTO processed_payments (provider_transaction_id,tx_ref) VALUES (?,?)").run(String(tx.id), String(tx.tx_ref));
      if (!seen.changes) return false;
      db.prepare("UPDATE orders SET status='paid' WHERE id=? AND status='pending'").run(order.id);
      const lines = db.prepare("SELECT seller_id,gross_cents,commission_cents,seller_net_cents FROM order_items WHERE order_id=? AND seller_id IS NOT NULL").all(order.id);
      const addLedger = db.prepare("INSERT OR IGNORE INTO commission_ledger (order_id,seller_id,currency,gross_cents,commission_cents,seller_net_cents,status) VALUES (?,?,?,?,?,?, 'available')");
      for (const line of lines) addLedger.run(order.id,line.seller_id,order.currency,line.gross_cents,line.commission_cents,line.seller_net_cents);
      return true;
    });
    const applied = markPaid();
    res.json({ received: true, orderPaid: true, duplicate: !applied });
  } catch (err) { console.error("Flutterwave webhook verification error:", err.message); res.status(500).send("Webhook processing failed."); }
});
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: path.resolve(".") }),
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, "public")));

function payoutEncryptionKey() {
  const value = process.env.PAYOUT_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('PAYOUT_ENCRYPTION_KEY must be a 64-character hex key.');
  return Buffer.from(value, 'hex');
}
function encryptPayoutAccount(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', payoutEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `enc:v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}
function decryptPayoutAccount(value) {
  if (!String(value || '').startsWith('enc:v1:')) return String(value || '');
  const parts = String(value).split(':');
  if (parts.length !== 5) throw new Error('Encrypted payout account record is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', payoutEncryptionKey(), Buffer.from(parts[2], 'hex'));
  decipher.setAuthTag(Buffer.from(parts[3], 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], 'hex')), decipher.final()]).toString('utf8');
}

async function flwRequest(endpoint, options = {}) {
  if (!process.env.FLW_SECRET_KEY) throw new Error("Flutterwave is not configured.");
  const response = await fetch(`https://api.flutterwave.com/v3${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.status && data.status !== "success")) {
    const error = new Error(data.message || `Payment provider request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, seller_status: user.seller_status || "none" };
}
function establishUserSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.save(saveErr => saveErr ? reject(saveErr) : resolve());
    });
  });
}
function mailer() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw new Error("Email verification is not configured yet. The site owner must add Gmail SMTP settings.");
  return nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
}
async function sendVerificationEmail(email, code) {
  const transport = mailer();
  await transport.sendMail({
    from: `MuiZMarket <${process.env.GMAIL_USER}>`, to: email,
    subject: "Your MuiZMarket verification code",
    text: `Your MuiZMarket verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#111;color:#f7f1df"><h1 style="color:#d7b45c">MuiZMarket</h1><p>Use this code to verify your email address:</p><p style="font-size:30px;letter-spacing:8px;font-weight:bold">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>`
  });
}
function makeVerificationCode() { return String(crypto.randomInt(100000, 1000000)); }
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}
function requireAdmin(req, res, next) {
  const user = req.session.userId ? db.prepare("SELECT role FROM users WHERE id = ?").get(req.session.userId) : null;
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function money(cents) { return (cents / 100).toFixed(2); }
function hasActiveSellerSubscription(userId) {
  const paid = db.prepare("SELECT id FROM seller_subscriptions WHERE seller_id=? AND status IN ('active','past_due') AND datetime(current_period_end) > datetime('now') ORDER BY id DESC LIMIT 1").get(userId);
  if (paid) return true;
  return Boolean(db.prepare("SELECT id FROM users WHERE id=? AND seller_trial_ends_at IS NOT NULL AND datetime(seller_trial_ends_at)>datetime('now')").get(userId));
}

app.get("/api/config", (req, res) => res.json({
  currencies: ["USD", "NGN"], defaultCurrency: process.env.DEFAULT_CURRENCY || "NGN",
  paymentsEnabled: Boolean(stripe || process.env.FLW_SECRET_KEY),
  usdCardCheckoutEnabled: Boolean(stripe || (process.env.FLW_SECRET_KEY && process.env.FLW_ENABLE_USD_CARD_PAYMENTS === "true")),
  subscriptionsEnabled: Boolean(process.env.FLW_SECRET_KEY && ['MONTHLY','QUARTERLY','YEARLY'].every(p => process.env[`FLW_${p}_PLAN_ID_NGN`] && process.env[`FLW_${p}_PLAN_ID_USD`])),
  plans: { monthly: { USD: 1500, NGN: Number(process.env.MONTHLY_PRICE_NGN_KOBO || 1500000) }, quarterly: { USD: 4000, NGN: Number(process.env.QUARTERLY_PRICE_NGN_KOBO || 4000000) }, yearly: { USD: 12000, NGN: Number(process.env.YEARLY_PRICE_NGN_KOBO || 12000000) } },
  commissionPercent: 10,
  socialLinks: {
    facebook: process.env.MUIZMARKET_FACEBOOK_URL || "",
    instagram: process.env.MUIZMARKET_INSTAGRAM_URL || "",
    twitter: process.env.MUIZMARKET_TWITTER_URL || "",
    tiktok: process.env.MUIZMARKET_TIKTOK_URL || ""
  }
}));
app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare("SELECT id, name, email, role, seller_status FROM users WHERE id = ?").get(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.json({ user: null }); }
  res.json({ user });
});
app.post("/api/register", authRateLimit(5), async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: "Enter a name between 2 and 80 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 10 || password.length > 200) return res.status(400).json({ error: "Password must be at least 10 characters." });
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return res.status(409).json({ error: "An account with this email already exists. Sign in or contact support if you need help." });
  let code; try { mailer(); code = makeVerificationCode(); } catch (err) { return res.status(503).json({ error: err.message }); }
  const hash = await bcrypt.hash(password, 12);
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const result = db.prepare("INSERT INTO users (name,email,password_hash,email_verified,email_verification_hash,email_verification_expires_at) VALUES (?,?,?,0,?,?)").run(name,email,hash,codeHash,expires);
  try { await sendVerificationEmail(email, code); }
  catch (err) { db.prepare("DELETE FROM users WHERE id=?").run(result.lastInsertRowid); console.error("Verification email error:", err.message); return res.status(503).json({ error: "We couldn't send the verification email. Please check the email service configuration and try again." }); }
  res.status(201).json({ needsVerification: true, email, message: "We sent a 6-digit verification code to your email. Enter it to activate your account." });
});
app.post("/api/verify-email", authRateLimit(8), async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter your email and the 6-digit code." });
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || user.email_verified || !user.email_verification_hash || !user.email_verification_expires_at || new Date(user.email_verification_expires_at).getTime() < Date.now()) return res.status(400).json({ error: "That code is invalid or expired. Please register again or request a new code." });
  const submitted = crypto.createHash('sha256').update(code).digest('hex');
  if (submitted !== user.email_verification_hash) return res.status(400).json({ error: "That verification code is incorrect." });
  db.prepare("UPDATE users SET email_verified=1,email_verification_hash=NULL,email_verification_expires_at=NULL WHERE id=?").run(user.id);
  try { await establishUserSession(req, user.id); }
  catch (err) { console.error("Session setup error:", err.message); return res.status(500).json({ error: "Your email is verified, but we couldn't sign you in. Please sign in now." }); }
  res.json({ user: safeUser({ ...user, email_verified: 1 }), message: "Email verified. Welcome to MuiZMarket." });
});
app.post("/api/resend-verification", authRateLimit(3), async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = db.prepare("SELECT id,email_verified FROM users WHERE email=?").get(email);
  if (!user || user.email_verified) return res.json({ message: "If the account needs verification, a new code will be sent." });
  let code; try { mailer(); code = makeVerificationCode(); await sendVerificationEmail(email, code); }
  catch (err) { console.error("Verification resend error:", err.message); return res.status(503).json({ error: "Unable to send a new code right now. Please try again later." }); }
  db.prepare("UPDATE users SET email_verification_hash=?,email_verification_expires_at=? WHERE id=?").run(crypto.createHash('sha256').update(code).digest('hex'),new Date(Date.now()+10*60*1000).toISOString(),user.id);
  res.json({ message: "If the account needs verification, a new code will be sent." });
});
app.post("/api/login", authRateLimit(12), async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect." });
  if (!user.email_verified) return res.status(403).json({ error: "Please verify your email first. Check your inbox for the 6-digit code, or use Resend code." });
  try { await establishUserSession(req, user.id); }
  catch (err) { console.error("Session setup error:", err.message); return res.status(500).json({ error: "Could not create a secure session. Please try again." }); }
  res.json({ user: safeUser(user) });
});
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.post("/api/support/tickets", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0,80);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0,254);
  const subject = String(req.body.subject || "General question").trim().slice(0,120);
  const message = String(req.body.message || "").trim().slice(0,5000);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) return res.status(400).json({ error: "Enter your name, a valid email, and a message of at least 10 characters." });
  const user = req.session.userId ? db.prepare("SELECT id FROM users WHERE id=?").get(req.session.userId) : null;
  const result = db.prepare("INSERT INTO support_tickets (user_id,name,email,subject,message) VALUES (?,?,?,?,?)").run(user?.id || null,name,email,subject,message);
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.SUPPORT_INBOX_EMAIL) {
    try { await mailer().sendMail({ from: `MuiZMarket Support <${process.env.GMAIL_USER}>`, to: process.env.SUPPORT_INBOX_EMAIL, subject: `MuiZMarket support #${result.lastInsertRowid}: ${subject}`, text: `From: ${name} <${email}>\nTicket: #${result.lastInsertRowid}\n\n${message}\n\nReply from the owner support inbox in the website.` }); } catch (err) { console.error("Support notification email error:",err.message); }
  }
  res.status(201).json({ ok: true, ticketId: result.lastInsertRowid, message: `Your message was received. Your support ticket number is #${result.lastInsertRowid}.` });
});
app.post("/api/support/ai", async (req, res) => {
  const question = String(req.body.message || "").trim().slice(0,1200);
  if (question.length < 2) return res.status(400).json({ error: "Type a question first." });
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", { method:"POST", headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({model:process.env.OPENAI_SUPPORT_MODEL||"gpt-4.1-mini",input:[{role:"system",content:"You are MuiZMarket's concise customer-support assistant. Answer only general questions about shopping, accounts, seller applications, listing moderation, subscription prices ($15 monthly, $40 quarterly, $120 yearly; NGN ₦15,000, ₦40,000, ₦120,000), the 7-day seller trial, orders, and contacting support. Never claim to see private orders or perform account actions. Never request passwords, verification codes, bank credentials, or payment card details. If unsure, ask the user to submit the contact form so the owner can help."},{role:"user",content:question}]}) });
      const data=await response.json(); if(!response.ok) throw new Error(data.error?.message||"AI support is temporarily unavailable.");
      const answer=(data.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==="output_text").map(item=>item.text).join("\n").trim();
      if(answer) return res.json({answer});
    } catch(err) { console.error("AI support error:",err.message); }
  }
  const q=question.toLowerCase(); let answer="I can help with general MuiZMarket questions. If your question is account-specific, please use the contact form so the owner can review it.";
  if(q.includes("trial")) answer="Approved sellers receive one 7-day free trial. The trial starts when the owner approves the seller account. It does not automatically charge you; choose and pay for a plan after it ends.";
  else if(q.includes("subscription")||q.includes("price")||q.includes("plan")) answer="Seller plans are $15 monthly, $40 every 3 months, or $120 yearly. The NGN prices are ₦15,000 monthly, ₦40,000 every 3 months, and ₦120,000 yearly.";
  else if(q.includes("seller")||q.includes("sell")) answer="Create a buyer account, apply to become a seller, and wait for owner approval. Your listings also need approval. Approved sellers get a 7-day free trial.";
  else if(q.includes("order")||q.includes("payment")) answer="Sign in and open your Buyer Dashboard to view order history. For a payment or order issue, submit the contact form with your ticket details. Never send card details or passwords.";
  else if(q.includes("contact")||q.includes("human")||q.includes("owner")) answer="You can contact the owner using the form on this page. Your message is saved as a support ticket for the owner to review.";
  res.json({answer,limited:true});
});
app.get("/api/admin/support-tickets", requireAuth, requireAdmin, (req,res) => {
  const tickets=db.prepare("SELECT id,name,email,subject,message,status,owner_reply,created_at,updated_at FROM support_tickets ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, id DESC LIMIT 200").all();
  res.json({tickets});
});
app.patch("/api/admin/support-tickets/:id", requireAuth, requireAdmin, async (req,res) => {
  const id=Number(req.params.id); const reply=String(req.body.reply||"").trim().slice(0,5000); const status=["open","in_progress","closed"].includes(req.body.status)?req.body.status:"in_progress";
  const ticket=db.prepare("SELECT * FROM support_tickets WHERE id=?").get(id); if(!ticket) return res.status(404).json({error:"Support ticket not found."});
  db.prepare("UPDATE support_tickets SET owner_reply=?,replied_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(reply||ticket.owner_reply,reply?new Date().toISOString():ticket.replied_at,status,id);
  if(reply && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) { try { await mailer().sendMail({from:`MuiZMarket Support <${process.env.GMAIL_USER}>`,to:ticket.email,subject:`Reply to your MuiZMarket support ticket #${id}`,text:`Hello ${ticket.name},\n\n${reply}\n\nMuiZMarket Support`}); } catch(err) { console.error("Support reply email error:",err.message); } }
  res.json({ok:true,message:reply?"Reply saved and email attempted.":"Ticket status updated."});
});

app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  const category = String(req.query.category || "").trim().slice(0, 60);
  let rows = db.prepare("SELECT p.id, p.name, p.category, p.description, p.price_cents, p.currency, p.seller_id FROM products p LEFT JOIN users u ON u.id=p.seller_id WHERE p.active = 1 AND p.approval_status = 'approved' AND (p.seller_id IS NULL OR (u.seller_status='approved' AND (EXISTS (SELECT 1 FROM seller_subscriptions ss WHERE ss.seller_id=u.id AND ss.status='active' AND datetime(ss.current_period_end) > datetime('now')) OR (u.seller_trial_ends_at IS NOT NULL AND datetime(u.seller_trial_ends_at)>datetime('now'))))) ORDER BY p.id DESC").all();
  if (q) rows = rows.filter(p => `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q.toLowerCase()));
  if (category && category !== "All products") rows = rows.filter(p => p.category === category);
  res.json({ products: rows.map(p => { return { ...p, price: money(p.price_cents), currency: p.currency || "USD" }; }) });
});
app.get("/api/categories", (req, res) => {
  const listed = db.prepare("SELECT DISTINCT p.category FROM products p LEFT JOIN users u ON u.id=p.seller_id WHERE p.active = 1 AND p.approval_status = 'approved' AND (p.seller_id IS NULL OR (u.seller_status='approved' AND (EXISTS (SELECT 1 FROM seller_subscriptions ss WHERE ss.seller_id=u.id AND ss.status='active' AND datetime(ss.current_period_end) > datetime('now')) OR (u.seller_trial_ends_at IS NOT NULL AND datetime(u.seller_trial_ends_at)>datetime('now'))))) ORDER BY p.category").all().map(x => x.category);
  const digitalCategories = ["Instagram Content Kits", "Facebook Marketing Assets", "X (Twitter) Resources", "Pinterest Templates", "Social Media Marketing Tools", "Graphic Design Assets", "Website Templates", "Software & Plugins", "E-books & Learning", "Business Templates", "Digital Services", "Other Digital Products"];
  res.json({ categories: ["All products", ...new Set([...digitalCategories, ...listed])] });
});

// Seller role is granted only by this application flow or by an owner; clients cannot submit a role.
app.post("/api/seller/apply", requireAuth, (req, res) => {
  const user = db.prepare("SELECT role, seller_status FROM users WHERE id = ?").get(req.session.userId);
  if (user.role === "admin") return res.status(400).json({ error: "Owner accounts do not need a seller application." });
  db.prepare("UPDATE users SET role = 'seller', seller_status = CASE WHEN seller_status = 'approved' THEN 'approved' ELSE 'pending' END WHERE id = ?").run(req.session.userId);
  res.status(201).json({ ok: true, role: "seller", seller_status: user.seller_status === "approved" ? "approved" : "pending", message: "Seller application submitted. You can manage your listings after approval." });
});
app.get("/api/seller/dashboard", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, role, seller_status, seller_trial_started_at, seller_trial_ends_at, payout_currency, payout_bank_name, payout_bank_code, payout_account_name, payout_account_verified, payout_country FROM users WHERE id = ?").get(req.session.userId);
  if (!user || !["seller", "admin"].includes(user.role)) return res.status(403).json({ error: "Apply for a seller account first." });
  const products = db.prepare("SELECT id, name, category, description, price_cents, currency, approval_status, active FROM products WHERE seller_id = ? ORDER BY id DESC").all(user.id);
  const subscriptions = db.prepare("SELECT plan_code, currency, amount_cents, status, current_period_end, cancel_at_period_end FROM seller_subscriptions WHERE seller_id = ? ORDER BY id DESC LIMIT 1").get(user.id) || null;
  const balances = db.prepare(`SELECT l.currency,
    COALESCE(SUM(l.seller_net_cents),0) AS earned_cents,
    COALESCE(SUM(l.seller_net_cents),0) - COALESCE((SELECT SUM(a.amount_cents) FROM payout_allocations a JOIN payout_requests p ON p.id=a.payout_id WHERE p.seller_id=l.seller_id AND p.currency=l.currency AND p.status <> 'rejected'),0) AS available_cents,
    COALESCE((SELECT SUM(p.amount_cents) FROM payout_requests p WHERE p.seller_id=l.seller_id AND p.currency=l.currency AND p.status IN ('requested','approved','processing')),0) AS pending_cents,
    COALESCE((SELECT SUM(p.amount_cents) FROM payout_requests p WHERE p.seller_id=l.seller_id AND p.currency=l.currency AND p.status='paid'),0) AS paid_cents
    FROM commission_ledger l WHERE l.seller_id = ? AND l.status = 'available' GROUP BY l.currency`).all(user.id);
  const payouts = db.prepare("SELECT id, currency, amount_cents, status, note, created_at FROM payout_requests WHERE seller_id = ? ORDER BY id DESC LIMIT 20").all(user.id);
  res.json({ seller: user, products: products.map(p => ({...p, price: money(p.price_cents)})), subscription: subscriptions, trialActive: Boolean(user.seller_trial_ends_at && new Date(user.seller_trial_ends_at).getTime() > Date.now()), balances, payouts, payoutLimits: { NGN: { min: 1000, max: 500000 }, USD: { min: 10, max: 2000 } } });
});
app.post("/api/seller/products", requireAuth, (req, res) => {
  const user = db.prepare("SELECT role, seller_status FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.role !== "seller" || user.seller_status !== "approved") return res.status(403).json({ error: "Your seller account must be approved before you can list products." });
  if (!hasActiveSellerSubscription(req.session.userId)) return res.status(403).json({error:"An active seller subscription is required to list products."});
  const name = String(req.body.name || "").trim().slice(0,120), category = String(req.body.category || "").trim().slice(0,60), description = String(req.body.description || "").trim().slice(0,1000);
  const price = Number(req.body.price), currency = String(req.body.currency || "NGN").toUpperCase();
  if (!name || !category || !description || !Number.isFinite(price) || price <= 0 || price > 100000 || !["USD","NGN"].includes(currency)) return res.status(400).json({ error: "Enter valid product details, price, and currency (USD or NGN)." });
  const result = db.prepare("INSERT INTO products (name, category, description, price_cents, seller_id, approval_status, active, currency) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)").run(name, category, description, Math.round(price*100), req.session.userId, currency);
  res.status(201).json({ id: result.lastInsertRowid, status: "pending", message: "Listing submitted for moderation." });
});
app.post("/api/seller/subscription/checkout", requireAuth, async (req, res) => {
  const user = db.prepare("SELECT id, role, seller_status, email, name FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.role !== "seller" || user.seller_status !== "approved") return res.status(403).json({ error: "Your seller account must be approved first." });
  const plan = String(req.body.plan || ""), currency = String(req.body.currency || "NGN").toUpperCase();
  if (!["monthly","quarterly","yearly"].includes(plan) || !["USD","NGN"].includes(currency)) return res.status(400).json({ error: "Choose a valid subscription plan and currency." });
  const trial = db.prepare("SELECT seller_trial_ends_at FROM users WHERE id=? AND seller_trial_ends_at IS NOT NULL AND datetime(seller_trial_ends_at)>datetime('now')").get(user.id);
  if (trial) return res.status(409).json({ error: "Your 7-day free trial is active until " + new Date(trial.seller_trial_ends_at).toLocaleDateString() + ". Choose and pay for a plan after your trial ends." });
  if (!process.env.FLW_SECRET_KEY) return res.status(503).json({ error: "Subscription payments are not configured yet. Add approved Flutterwave credentials before accepting payments." });
  const activeSubscription = db.prepare("SELECT id FROM seller_subscriptions WHERE seller_id=? AND status='active' AND datetime(current_period_end)>datetime('now') ORDER BY id DESC LIMIT 1").get(user.id);
  if (activeSubscription) return res.status(409).json({error:"You already have an active seller subscription. Contact support to change plans or cancel."});
  const envKey = `FLW_${plan.toUpperCase()}_PLAN_ID_${currency}`;
  const paymentPlan = process.env[envKey];
  if (!paymentPlan) return res.status(503).json({ error: `Flutterwave recurring plan ${plan}/${currency} is not configured yet.` });
  const usdPrices = { monthly: 1500, quarterly: 4000, yearly: 12000 };
  const ngnDefaults = { monthly: 1500000, quarterly: 4000000, yearly: 12000000 };
  const amountCents = currency === "USD" ? usdPrices[plan] : Number(process.env[`${plan.toUpperCase()}_PRICE_NGN_KOBO`] || ngnDefaults[plan]);
  const txRef = `MZSUB-${user.id}-${plan}-${crypto.randomBytes(8).toString("hex")}`;
  db.prepare("INSERT INTO seller_subscriptions (seller_id, plan_code, currency, amount_cents, status, provider_reference, provider_plan_id) VALUES (?, ?, ?, ?, 'pending', ?, ?)").run(user.id, plan, currency, amountCents, txRef, String(paymentPlan));
  try {
    const response = await fetch("https://api.flutterwave.com/v3/payments", { method: "POST", headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ tx_ref: txRef, amount: (amountCents/100).toFixed(2), currency, redirect_url: `${APP_URL}/?subscription=return`, payment_plan: paymentPlan, customer: { email: user.email, name: user.name }, customizations: { title: "MuiZMarket Seller Plan", description: `${plan} seller subscription` } }) });
    const data = await response.json();
    if (!response.ok || data.status !== "success" || !data.data?.link) throw new Error("Provider did not return a checkout link");
    res.json({ url: data.data.link });
  } catch (e) {
    db.prepare("UPDATE seller_subscriptions SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE provider_reference=?").run(txRef);
    console.error("Flutterwave subscription checkout error:", e.message);
    res.status(502).json({ error: "Could not start subscription checkout. Please try again later." });
  }
});
app.post("/api/seller/subscription/cancel", requireAuth, async (req,res) => {
  const user = db.prepare("SELECT id,email,role FROM users WHERE id=?").get(req.session.userId);
  if (!user || user.role !== "seller") return res.status(403).json({error:"Seller account required."});
  const sub = db.prepare("SELECT * FROM seller_subscriptions WHERE seller_id=? AND status IN ('active','past_due') ORDER BY id DESC LIMIT 1").get(user.id);
  if (!sub) return res.status(404).json({error:"No active subscription was found."});
  if (!process.env.FLW_SECRET_KEY) return res.status(503).json({error:"Subscription provider is not configured."});
  try {
    let providerSubId = sub.provider_subscription_id;
    if (!providerSubId) {
      const params = new URLSearchParams({ email: user.email, status: 'active' });
      if (sub.provider_plan_id) params.set('plan', String(sub.provider_plan_id));
      const lookup = await flwRequest(`/subscriptions?${params.toString()}`);
      const candidates = Array.isArray(lookup.data) ? lookup.data : [];
      const match = candidates.filter(x => String(x.customer?.email || x.customer_email || x.customer?.customer_email || '').toLowerCase() === user.email.toLowerCase() && (!sub.provider_plan_id || String(x.plan?.id || x.plan || '') === String(sub.provider_plan_id)) && String(x.status || '').toLowerCase() === 'active').sort((a,b) => new Date(b.created_at || 0)-new Date(a.created_at || 0))[0];
      providerSubId = match?.id;
      if (!providerSubId) return res.status(409).json({error:"We could not safely identify the provider subscription to cancel. Please cancel it in your Flutterwave dashboard and contact support."});
      db.prepare("UPDATE seller_subscriptions SET provider_subscription_id=? WHERE id=?").run(String(providerSubId), sub.id);
    }
    await flwRequest(`/subscriptions/${encodeURIComponent(providerSubId)}/cancel`, { method: 'PUT' });
    db.prepare("UPDATE seller_subscriptions SET cancel_at_period_end=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sub.id);
    return res.json({ok:true,message:"Auto-renewal has been cancelled. Your seller access remains active until the paid period ends."});
  } catch (e) { console.error('Subscription cancellation failed:',e.message); return res.status(502).json({error:"Could not cancel automatic renewal. Please try again or contact support."}); }
});
app.post("/api/seller/payout-account", requireAuth, async (req, res) => {
  const user = db.prepare("SELECT id,role,seller_status,name FROM users WHERE id=?").get(req.session.userId);
  if (!user || user.role !== 'seller' || user.seller_status !== 'approved') return res.status(403).json({error:'Approved seller account required.'});
  const bankCode = String(req.body.bank_code || '').trim().slice(0,20);
  const accountNumber = String(req.body.account_number || '').replace(/\s/g,'').slice(0,34);
  const phone = String(req.body.phone || '').trim().slice(0,30);
  if (!bankCode || !/^\d{10}$/.test(accountNumber) || phone.length < 7) return res.status(400).json({error:'Enter a valid Nigerian bank code, 10-digit account number, and phone number.'});
  if (!process.env.FLW_SECRET_KEY) return res.status(503).json({error:'Payout account verification requires configured Flutterwave credentials.'});
  try { payoutEncryptionKey(); } catch (e) { return res.status(503).json({error:'Configure PAYOUT_ENCRYPTION_KEY before saving payout details.'}); }
  try {
    const result = await flwRequest('/accounts/resolve', {method:'POST',body:JSON.stringify({account_number:accountNumber,account_bank:bankCode})});
    const resolved = result.data || {};
    const accountName = String(resolved.account_name || resolved.accountName || '').trim();
    if (!accountName) return res.status(422).json({error:'The bank account could not be verified. Check the details and try again.'});
    db.prepare("UPDATE users SET payout_bank_code=?,payout_bank_name=?,payout_account_name=?,payout_account_number=?,payout_account_verified=1,payout_phone=?,payout_country='NG',payout_currency='NGN' WHERE id=?").run(bankCode,String(resolved.bank_name || '').slice(0,120),accountName,encryptPayoutAccount(accountNumber),phone,user.id);
    return res.json({ok:true,account:{bank_name:resolved.bank_name || '',account_name:accountName,account_number:`••••••${accountNumber.slice(-4)}`,verified:true},message:'Bank account verified and saved.'});
  } catch(e) { console.error('Payout account verification failed:',e.message); return res.status(502).json({error:'Could not verify that bank account. Confirm the bank code and try again.'}); }
});

app.post("/api/seller/payouts", requireAuth, (req, res) => {
  const user = db.prepare("SELECT role, seller_status FROM users WHERE id = ?").get(req.session.userId);
  if (!user || user.role !== "seller" || user.seller_status !== "approved") return res.status(403).json({ error: "Approved seller account required." });
  const amount = Number(req.body.amount), currency = String(req.body.currency || "NGN").toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !["NGN","USD"].includes(currency)) return res.status(400).json({ error: "Enter a valid payout amount and currency." });
  const minAmount = currency === 'NGN' ? 1000 : 10;
  const maxAmount = currency === 'NGN' ? 500000 : 2000;
  if (amount < minAmount || amount > maxAmount) return res.status(400).json({ error: currency === 'NGN' ? 'NGN withdrawals must be between ₦1,000 and ₦500,000 per request.' : 'Manual USD payouts must be between $10 and $2,000 per request.' });
  const cents = Math.round(amount*100);
  const available = db.prepare("SELECT COALESCE(SUM(l.seller_net_cents),0) - COALESCE((SELECT SUM(a.amount_cents) FROM payout_allocations a JOIN payout_requests p ON p.id=a.payout_id WHERE p.seller_id=l.seller_id AND p.currency=l.currency AND p.status <> 'rejected'),0) AS total FROM commission_ledger l WHERE l.seller_id=? AND l.currency=? AND l.status='available'").get(req.session.userId,currency).total;
  if (cents > available) return res.status(400).json({ error: "Payout exceeds your available balance." });
  const createPayout = db.transaction(() => {
    const result = db.prepare("INSERT INTO payout_requests (seller_id,currency,amount_cents) VALUES (?,?,?)").run(req.session.userId,currency,cents);
    let remaining = cents;
    const rows = db.prepare("SELECT l.id,l.seller_net_cents,COALESCE((SELECT SUM(a.amount_cents) FROM payout_allocations a JOIN payout_requests p ON p.id=a.payout_id WHERE a.ledger_id=l.id AND p.status <> 'rejected'),0) AS allocated FROM commission_ledger l WHERE l.seller_id=? AND l.currency=? AND l.status='available' ORDER BY l.id").all(req.session.userId,currency);
    const add = db.prepare("INSERT INTO payout_allocations (payout_id,ledger_id,amount_cents) VALUES (?,?,?)");
    for (const row of rows) { const free = row.seller_net_cents-row.allocated; if (free<=0) continue; const amount = Math.min(free,remaining); if (amount>0) add.run(result.lastInsertRowid,row.id,amount); remaining-=amount; if (remaining===0) break; }
    if (remaining>0) throw new Error("Payout balance changed; please try again.");
    return result.lastInsertRowid;
  });
  const payoutId = createPayout();
  res.status(201).json({ id: payoutId, status: "requested", message: "Payout request sent for owner review." });
});
app.get("/api/admin/finance", requireAuth, requireAdmin, (req,res) => {
  // This is the marketplace's internal ledger, not a live bank/provider balance.
  const sales = db.prepare("SELECT currency, COUNT(*) AS orders_count, COALESCE(SUM(total_cents),0) AS gross_cents FROM orders WHERE status='paid' GROUP BY currency").all();
  const ledger = db.prepare("SELECT currency, COALESCE(SUM(gross_cents),0) AS seller_sales_cents, COALESCE(SUM(commission_cents),0) AS commission_cents, COALESCE(SUM(seller_net_cents),0) AS seller_earnings_cents FROM commission_ledger GROUP BY currency").all();
  const payouts = db.prepare("SELECT currency, status, COALESCE(SUM(amount_cents),0) AS amount_cents, COUNT(*) AS count FROM payout_requests GROUP BY currency,status").all();
  const subscriptions = db.prepare("SELECT currency, COUNT(*) AS subscriptions_count, COALESCE(SUM(amount_cents),0) AS latest_subscription_amount_cents FROM seller_subscriptions WHERE last_payment_at IS NOT NULL GROUP BY currency").all();
  const recentOrders = db.prepare("SELECT o.id,o.total_cents,o.currency,o.status,o.created_at,u.email AS buyer_email,u.name AS buyer_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 30").all();
  const sellerLiabilities = db.prepare("SELECT l.currency, COALESCE(SUM(l.seller_net_cents),0)-COALESCE((SELECT SUM(a.amount_cents) FROM payout_allocations a JOIN payout_requests p ON p.id=a.payout_id WHERE p.currency=l.currency AND p.status<>'rejected'),0) AS allocated_or_held_cents FROM commission_ledger l WHERE l.status='available' GROUP BY l.currency").all();
  res.json({sales,ledger,payouts,subscriptions,recentOrders,sellerLiabilities,providerBalanceAvailable:false,notice:"Internal ledger figures only. Confirm actual settled funds, fees, refunds, disputes, and payout balances in your payment provider dashboard."});
});
app.get("/api/admin/seller-applications", requireAuth, requireAdmin, (req,res) => res.json({ sellers: db.prepare("SELECT id,name,email,seller_status,created_at FROM users WHERE role='seller' ORDER BY id DESC").all() }));
app.patch("/api/admin/sellers/:id", requireAuth, requireAdmin, (req,res) => {
  const status = String(req.body.status || ""); if (!["approved","rejected","suspended"].includes(status)) return res.status(400).json({error:"Invalid seller status."});
  const sellerId = Number(req.params.id);
  let result;
  if (status === 'approved') {
    // Start one 7-day trial on first approval only; never reset it on later re-approval.
    result = db.prepare("UPDATE users SET seller_status=?, seller_trial_started_at=COALESCE(seller_trial_started_at, CURRENT_TIMESTAMP), seller_trial_ends_at=COALESCE(seller_trial_ends_at, datetime('now','+7 days')) WHERE id=? AND role='seller'").run(status,sellerId);
  } else { result = db.prepare("UPDATE users SET seller_status=? WHERE id=? AND role='seller'").run(status,sellerId); }
  if (!result.changes) return res.status(404).json({error:"Seller not found."}); res.json({ok:true});
});
app.get("/api/admin/listings", requireAuth, requireAdmin, (req,res) => res.json({ products: db.prepare("SELECT p.*,u.name AS seller_name FROM products p LEFT JOIN users u ON u.id=p.seller_id ORDER BY CASE WHEN p.approval_status='pending' THEN 0 ELSE 1 END,p.id DESC").all() }));
app.patch("/api/admin/listings/:id", requireAuth, requireAdmin, (req,res) => {
  const status = String(req.body.status || ""); if (!["approved","rejected","pending"].includes(status)) return res.status(400).json({error:"Invalid moderation status."});
  const result = db.prepare("UPDATE products SET approval_status=?,active=? WHERE id=? AND seller_id IS NOT NULL").run(status,status === "approved" ? 1 : 0,Number(req.params.id));
  if (!result.changes) return res.status(404).json({error:"Seller listing not found."}); res.json({ok:true});
});
app.get("/api/admin/payouts", requireAuth, requireAdmin, (req,res) => res.json({ payouts: db.prepare("SELECT p.*,u.name AS seller_name,u.email FROM payout_requests p JOIN users u ON u.id=p.seller_id ORDER BY p.id DESC").all() }));
app.post("/api/admin/payouts/:id/transfer", requireAuth, requireAdmin, async (req,res) => {
  const payoutId = Number(req.params.id);
  if (!Number.isSafeInteger(payoutId) || payoutId < 1) return res.status(400).json({error:'Invalid payout ID.'});
  const payout = db.prepare("SELECT p.*,u.name AS seller_name,u.email,u.payout_bank_code,u.payout_bank_name,u.payout_account_name,u.payout_account_number,u.payout_account_verified,u.payout_phone FROM payout_requests p JOIN users u ON u.id=p.seller_id WHERE p.id=?").get(payoutId);
  if (!payout) return res.status(404).json({error:'Payout request not found.'});
  if (payout.status !== 'approved') return res.status(409).json({error:'Approve the payout before initiating a transfer.'});
  if (payout.currency !== 'NGN') return res.status(409).json({error:'Automated bank transfers are currently enabled only for NGN. Handle USD payouts manually until an approved USD transfer route is configured.'});
  if (!payout.payout_account_verified || !payout.payout_bank_code || !payout.payout_account_number || !payout.payout_account_name) return res.status(409).json({error:'Seller must verify their Nigerian bank account before payout.'});
  if (!process.env.FLW_SECRET_KEY) return res.status(503).json({error:'Flutterwave transfers are not configured.'});
  let decryptedAccountNumber;
  try { decryptedAccountNumber = decryptPayoutAccount(payout.payout_account_number); } catch (e) { return res.status(503).json({error:'Payout encryption key is missing or invalid. Restore the correct key before transferring funds.'}); }
  if (payout.provider_reference && ['processing','paid'].includes(payout.status)) return res.status(409).json({error:'A transfer has already been initiated for this payout.'});
  const reference = `MZPAY-${payout.id}-${crypto.randomBytes(6).toString('hex')}`;
  try {
    const changed = db.prepare("UPDATE payout_requests SET status='processing',provider_reference=?,reviewed_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved'").run(reference,req.session.userId,payout.id);
    if (!changed.changes) return res.status(409).json({error:'Payout status changed. Refresh and try again.'});
    const transfer = await flwRequest('/transfers', {method:'POST',body:JSON.stringify({account_bank:payout.payout_bank_code,account_number:decryptedAccountNumber,amount:(payout.amount_cents/100).toFixed(2),currency:'NGN',narration:`MuiZMarket seller payout #${payout.id}`,reference,beneficiary_name:payout.payout_account_name,callback_url:`${APP_URL}/api/flutterwave/transfer-webhook`})});
    const data = transfer.data || {};
    const status = String(data.status || '').toLowerCase();
    db.prepare("UPDATE payout_requests SET status=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status === 'successful' ? 'paid' : 'processing',`Flutterwave transfer ${data.id || reference}; status: ${status || 'pending'}`,payout.id);
    return res.json({ok:true,status:status === 'successful' ? 'paid' : 'processing',message:status === 'successful' ? 'Transfer reported successful by Flutterwave.' : 'Transfer submitted to Flutterwave and is awaiting final status.'});
  } catch(e) {
    console.error('Payout transfer request failed:',e.message);
    db.prepare("UPDATE payout_requests SET note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run('Transfer submission result needs reconciliation in the Flutterwave dashboard before retrying.',payout.id);
    return res.status(502).json({error:'Transfer status is uncertain. Check Flutterwave transfers before retrying to avoid a duplicate payout.'});
  }
});

app.post("/api/flutterwave/transfer-webhook", async (req,res) => {
  const signature = req.headers['verif-hash'];
  const expected = process.env.FLW_SECRET_HASH || '';
  const sig = typeof signature === 'string' ? signature : '';
  if (!expected || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return res.status(401).send('Invalid webhook signature.');
  const data = req.body?.data || {};
  const reference = String(data.reference || '');
  if (!reference.startsWith('MZPAY-')) return res.json({received:true,ignored:true});
  const payout = db.prepare('SELECT id FROM payout_requests WHERE provider_reference=?').get(reference);
  if (!payout) return res.json({received:true,ignored:true});
  const status = String(data.status || '').toLowerCase();
  if (status === 'successful') db.prepare("UPDATE payout_requests SET status='paid',note='Flutterwave confirmed transfer successful.',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='processing'").run(payout.id);
  else if (['failed','reversed'].includes(status)) db.prepare("UPDATE payout_requests SET status='approved',note='Flutterwave reported transfer failed/reversed. Verify provider balance before retrying.',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='processing'").run(payout.id);
  res.json({received:true});
});

app.patch("/api/admin/payouts/:id", requireAuth, requireAdmin, (req,res) => {
  const status = String(req.body.status || ""), note = String(req.body.note || "").slice(0,500);
  if (!["approved","rejected"].includes(status)) return res.status(400).json({error:"Payout status must be approved or rejected."});
  const payout = db.prepare("SELECT * FROM payout_requests WHERE id=?").get(Number(req.params.id)); if (!payout) return res.status(404).json({error:"Payout request not found."});
  if (!["requested","approved"].includes(payout.status)) return res.status(409).json({error:"This payout is already processing or closed and cannot be changed here."});
  db.prepare("UPDATE payout_requests SET status=?,note=?,reviewed_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status,note,req.session.userId,payout.id);
  res.json({ok:true, note:"Status updated. A 'paid' status must only be set after the transfer is confirmed in the provider dashboard."});
});

app.post("/api/checkout/confirm", requireAuth, async (req, res) => {
  const transactionId = String(req.body.transaction_id || "").trim();
  const txRef = String(req.body.tx_ref || "").trim();
  if (!/^\d+$/.test(transactionId) || !/^MZORD-\d+-[a-f0-9]+$/i.test(txRef)) return res.status(400).json({ error: "Invalid payment confirmation details." });
  const order = db.prepare("SELECT id,user_id,total_cents,currency,status FROM orders WHERE stripe_session_id=? AND user_id=?").get(txRef, req.session.userId);
  if (!order) return res.status(404).json({ error: "We could not find this order for your account." });
  if (!process.env.FLW_SECRET_KEY) return res.status(503).json({ error: "Flutterwave confirmation is not configured." });
  try {
    const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` } });
    const result = await response.json().catch(() => ({}));
    const tx = result?.data;
    if (!response.ok || result.status !== "success" || tx?.status !== "successful" || String(tx.id) !== transactionId || tx.tx_ref !== txRef) return res.status(400).json({ error: "The provider has not verified this payment as successful." });
    if (String(tx.currency || "").toUpperCase() !== order.currency || Math.round(Number(tx.amount) * 100) !== order.total_cents) return res.status(400).json({ error: "Payment amount or currency does not match your order." });
    db.transaction(() => {
      const seen = db.prepare("INSERT OR IGNORE INTO processed_payments (provider_transaction_id,tx_ref) VALUES (?,?)").run(transactionId, txRef);
      if (seen.changes) {
        db.prepare("UPDATE orders SET status='paid' WHERE id=? AND status='pending'").run(order.id);
        const lines = db.prepare("SELECT seller_id,gross_cents,commission_cents,seller_net_cents FROM order_items WHERE order_id=? AND seller_id IS NOT NULL").all(order.id);
        const addLedger = db.prepare("INSERT OR IGNORE INTO commission_ledger (order_id,seller_id,currency,gross_cents,commission_cents,seller_net_cents,status) VALUES (?,?,?,?,?,?, 'available')");
        for (const line of lines) addLedger.run(order.id,line.seller_id,order.currency,line.gross_cents,line.commission_cents,line.seller_net_cents);
      }
    })();
    const updated = db.prepare("SELECT status FROM orders WHERE id=?").get(order.id);
    if (updated.status !== "paid") return res.status(409).json({ error: "Payment was verified but the order is not yet marked paid. Contact support before paying again." });
    return res.json({ ok: true, orderId: order.id, status: "paid" });
  } catch (err) {
    console.error("Checkout confirmation error:", err.message);
    return res.status(502).json({ error: "Could not confirm the payment right now. Your payment will be checked again automatically." });
  }
});

app.post("/api/checkout", requireAuth, async (req, res) => {
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  const quantities = new Map();
  for (const item of rawItems) {
    const id = Number(item.id), qty = Number(item.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 10) return res.status(400).json({ error: "Invalid cart item." });
    quantities.set(id, Math.min(10, (quantities.get(id) || 0) + qty));
  }
  if (!quantities.size || quantities.size > 30) return res.status(400).json({ error: "Your cart is empty or too large." });
  const ids = [...quantities.keys()];
  const placeholders = ids.map(() => "?").join(",");
  const products = db.prepare(`SELECT id, name, price_cents, seller_id, currency FROM products WHERE active = 1 AND approval_status='approved' AND id IN (${placeholders})`).all(...ids);
  if (products.length !== ids.length) return res.status(400).json({ error: "One or more products are unavailable." });
  const currencies = [...new Set(products.map(p => p.currency || "USD"))];
  const sellers = [...new Set(products.map(p => p.seller_id).filter(Boolean))];
  if (currencies.length > 1) return res.status(400).json({ error: "Please check out products in one currency at a time." });
  if (sellers.length > 1) return res.status(400).json({ error: "For payout accuracy, please check out one seller's products at a time." });
  const currency = currencies[0] || "USD";
  const total = products.reduce((sum, p) => sum + p.price_cents * quantities.get(p.id), 0);
  const useFlutterwave = Boolean(process.env.FLW_SECRET_KEY) && !(currency === "USD" && stripe && process.env.FLW_ENABLE_USD_CARD_PAYMENTS !== "true");
  if (currency === "USD" && !useFlutterwave && !stripe) {
    return res.status(503).json({ error: "USD card checkout is not enabled yet. The marketplace owner must enable international USD card payments with the provider first." });
  }
  if (currency === "USD" && useFlutterwave && process.env.FLW_ENABLE_USD_CARD_PAYMENTS !== "true") {
    return res.status(503).json({ error: "USD card checkout is disabled until international card payments are approved and enabled in the Flutterwave merchant account." });
  }
  if (useFlutterwave) {
    const user = db.prepare("SELECT email,name FROM users WHERE id=?").get(req.session.userId);
    const orderResult = db.prepare("INSERT INTO orders (user_id, total_cents, status, currency) VALUES (?, ?, 'pending', ?)").run(req.session.userId, total, currency);
    const orderId = orderResult.lastInsertRowid;
    const addItem = db.prepare("INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity, seller_id, gross_cents, commission_cents, seller_net_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const saveItems = db.transaction(() => products.forEach(p => { const gross=p.price_cents*quantities.get(p.id), commission=p.seller_id?Math.round(gross*0.10):0; addItem.run(orderId,p.id,p.name,p.price_cents,quantities.get(p.id),p.seller_id,gross,commission,gross-commission); }));
    saveItems();
    const txRef = `MZORD-${orderId}-${crypto.randomBytes(8).toString("hex")}`;
    try {
      const response = await fetch("https://api.flutterwave.com/v3/payments", { method:"POST", headers:{Authorization:`Bearer ${process.env.FLW_SECRET_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({tx_ref:txRef,amount:(total/100).toFixed(2),currency,payment_options:currency === "USD" ? "card" : "card, banktransfer, ussd",redirect_url:`${APP_URL}/?checkout=return`,customer:{email:user.email,name:user.name},meta:{order_id:String(orderId),user_id:String(req.session.userId)},customizations:{title:"MuiZMarket checkout",description:`Order #${orderId}`}}) });
      const data = await response.json();
      if (!response.ok || data.status !== "success" || !data.data?.link) throw new Error("Provider did not return a checkout link");
      db.prepare("UPDATE orders SET stripe_session_id=? WHERE id=?").run(txRef,orderId);
      return res.json({url:data.data.link});
    } catch (err) {
      db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(orderId); console.error("Flutterwave checkout error:",err.message);
      return res.status(502).json({error:"Could not start checkout. Please try again later."});
    }
  }
  if (stripe && currency === "USD") {
    const orderResult = db.prepare("INSERT INTO orders (user_id, total_cents, status, currency) VALUES (?, ?, 'pending', ?)").run(req.session.userId, total, currency);
    const orderId = orderResult.lastInsertRowid;
    const addItem = db.prepare("INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity, seller_id, gross_cents, commission_cents, seller_net_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const saveItems = db.transaction(() => products.forEach(p => { const gross=p.price_cents*quantities.get(p.id), commission=p.seller_id?Math.round(gross*0.10):0; addItem.run(orderId,p.id,p.name,p.price_cents,quantities.get(p.id),p.seller_id,gross,commission,gross-commission); }));
    saveItems();
    try {
      const checkout = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: products.map(p => ({
          quantity: quantities.get(p.id),
          price_data: { currency: currency.toLowerCase(), unit_amount: p.price_cents, product_data: { name: p.name, description: "MuiZMarket digital product" } }
        })),
        success_url: `${APP_URL}/?checkout=success`,
        cancel_url: `${APP_URL}/?checkout=cancelled`,
        metadata: { orderId: String(orderId), userId: String(req.session.userId), currency }
      });
      db.prepare("UPDATE orders SET stripe_session_id = ? WHERE id = ?").run(checkout.id, orderId);
      return res.json({ url: checkout.url });
    } catch (err) {
      db.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").run(orderId);
      console.error("Stripe checkout error:", err.message);
      return res.status(502).json({ error: "Could not start checkout. Please try again later." });
    }
  }
  return res.status(503).json({ error: "Secure checkout is not configured yet. The marketplace owner must configure and test a payment provider before accepting orders." });
});

app.get("/api/orders", requireAuth, (req, res) => {
  const orders = db.prepare("SELECT id, total_cents, status, currency, created_at FROM orders WHERE user_id = ? ORDER BY id DESC").all(req.session.userId);
  const items = db.prepare("SELECT order_id, product_name, unit_price_cents, quantity FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?) ORDER BY id").all(req.session.userId);
  res.json({ orders: orders.map(o => ({ ...o, total: money(o.total_cents), currency: o.currency || "USD", items: items.filter(i => i.order_id === o.id).map(i => ({ name: i.product_name, price: money(i.unit_price_cents), quantity: i.quantity })) })) });
});

app.get("/api/admin/products", requireAuth, requireAdmin, (req, res) => {
  res.json({ products: db.prepare("SELECT * FROM products ORDER BY id DESC").all() });
});
app.post("/api/admin/products", requireAuth, requireAdmin, (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 120);
  const category = String(req.body.category || "").trim().slice(0, 60);
  const description = String(req.body.description || "").trim().slice(0, 1000);
  const price = Number(req.body.price);
  if (!name || !category || !description || !Number.isFinite(price) || price < 0 || price > 100000) return res.status(400).json({ error: "Complete all fields and enter a valid price." });
  const result = db.prepare("INSERT INTO products (name, category, description, price_cents) VALUES (?, ?, ?, ?)").run(name, category, description, Math.round(price * 100));
  res.status(201).json({ id: result.lastInsertRowid });
});
app.patch("/api/admin/products/:id", requireAuth, requireAdmin, (req, res) => {
  const active = req.body.active ? 1 : 0;
  const result = db.prepare("UPDATE products SET active = ? WHERE id = ?").run(active, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Product not found." });
  res.json({ ok: true });
});

// One-time admin bootstrap command: `node server.js --create-admin email@example.com`
if (process.argv[2] === "--create-admin") {
  (async () => {
    const email = String(process.argv[3] || "").trim().toLowerCase();
    if (!email) { console.error("Usage: node server.js --create-admin admin@example.com"); process.exit(1); }
    const result = db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
    if (!result.changes) { console.error("That account does not exist yet. Register on the site first, then run this command."); process.exit(1); }
    console.log(`Admin role granted to ${email}.`);
    process.exit(0);
  })();
}

app.get("/about", (req,res) => res.sendFile(path.join(__dirname,"public","about.html")));
app.get("/contact", (req,res) => res.sendFile(path.join(__dirname,"public","contact.html")));
app.get("/buyer", (req,res) => res.sendFile(path.join(__dirname,"public","buyer.html")));
app.get("/seller", (req,res) => res.sendFile(path.join(__dirname,"public","seller.html")));
app.get("/owner-support", (req,res) => res.sendFile(path.join(__dirname,"public","support-inbox.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`MuiZMarket running at ${APP_URL}`));
