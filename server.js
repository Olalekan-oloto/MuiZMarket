// MuiZMarket API server. Requires Node.js 20+ and Firebase Admin credentials.
// Never commit service-account keys or .env files.
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();
app.use(express.json({limit:'1mb'}));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
app.use(cors({origin(origin, cb){ if(!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return cb(null,true); return cb(new Error('Origin not allowed')); }}));
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
 console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Set it in your hosting provider.');
 process.exit(1);
}
admin.initializeApp({credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
const db=admin.firestore();
const auth=admin.auth();
// Configure comma-separated Firebase Auth UIDs for trusted administrators on the host.
// Never use a client-editable Firestore field or email supplied by the browser for admin access.
const ADMIN_UIDS=new Set((process.env.ADMIN_UIDS||'').split(',').map(x=>x.trim()).filter(Boolean));
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
async function requireUser(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Sign in required'});req.user=await auth.verifyIdToken(h.slice(7));next();}catch(e){return res.status(401).json({error:'Your session is invalid or expired'});}}
async function profile(uid){const s=await db.collection('users').doc(uid).get();return s.exists?s.data():{};}
async function requireSeller(req,res,next){try{const p=await profile(req.user.uid);if(p.role!=='seller' && p.accountType!=='seller')return res.status(403).json({error:'This account is not registered as a seller'});req.profile=p;next();}catch(e){next(e)}}
function requireAdmin(req,res,next){if(!ADMIN_UIDS.size)return res.status(503).json({error:'Admin access is not configured. Set ADMIN_UIDS on the backend host.'});if(!ADMIN_UIDS.has(req.user.uid))return res.status(403).json({error:'Administrator access required'});next();}
app.get('/health',(req,res)=>res.json({ok:true,service:'MuiZMarket API'}));
app.get('/api/me',requireUser,asyncRoute(async(req,res)=>res.json({uid:req.user.uid, ...(await profile(req.user.uid))})));
app.post('/api/account/role',requireUser,asyncRoute(async(req,res)=>{
 const role=String((req.body||{}).role||'').toLowerCase();
 if(!['buyer','seller'].includes(role))return res.status(400).json({error:'Role must be buyer or seller'});
 const ref=db.collection('users').doc(req.user.uid), snap=await ref.get();
 if(!snap.exists)return res.status(404).json({error:'Create your account profile before assigning a role'});
 const existing=String(snap.data().role||snap.data().accountType||'').toLowerCase();
 if(existing && existing!==role)return res.status(409).json({error:'Your account already has a role. Contact support if it needs to be changed.'});
 await ref.set({uid:req.user.uid,role,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
 res.json({ok:true,role});
}));
app.get('/api/admin/summary',requireUser,requireAdmin,asyncRoute(async(req,res)=>{
 const [usersSnap,productsSnap]=await Promise.all([db.collection('users').get(),db.collection('products').get()]);
 let buyers=0,sellers=0,unassigned=0;
 for(const doc of usersSnap.docs){const p=doc.data()||{},role=String(p.role||p.accountType||'').toLowerCase();if(role==='seller')sellers++;else if(role==='buyer')buyers++;else unassigned++;}
 res.json({totalUsers:usersSnap.size,buyers,sellers,unassigned,totalProducts:productsSnap.size});
}));
app.get('/api/admin/users',requireUser,requireAdmin,asyncRoute(async(req,res)=>{
 const limit=Math.min(Math.max(Number.parseInt(req.query.limit,10)||100,1),200);
 const snap=await db.collection('users').orderBy('createdAt','desc').limit(limit).get();
 const users=snap.docs.map(doc=>{const p=doc.data()||{};return {uid:doc.id,fullName:p.fullName||'',username:p.username||'',email:p.email||'',country:p.country||'',role:String(p.role||p.accountType||'unassigned').toLowerCase(),createdAt:p.createdAt&&typeof p.createdAt.toDate==='function'?p.createdAt.toDate().toISOString():null};});
 res.json({users});
}));
app.get('/api/products',asyncRoute(async(req,res)=>{let q=db.collection('products').where('status','==','live').orderBy('createdAt','desc').limit(100);const snap=await q.get();res.json({products:snap.docs.map(d=>({id:d.id,...d.data()}))});}));
app.post('/api/products',requireUser,requireSeller,asyncRoute(async(req,res)=>{const {name,description,price,currency='NGN',imageUrl,category}=req.body||{};if(typeof name!=='string'||name.trim().length<2||typeof description!=='string'||!Number.isFinite(Number(price))||Number(price)<=0)return res.status(400).json({error:'Provide a product name, description and positive price'});const ref=await db.collection('products').add({name:name.trim().slice(0,120),description:description.trim().slice(0,5000),price:Number(price),currency:['NGN','USD'].includes(currency)?currency:'NGN',imageUrl:typeof imageUrl==='string'?imageUrl.slice(0,2000):'',category:typeof category==='string'?category.slice(0,80):'General',sellerId:req.user.uid,sellerName:req.profile.fullName||req.profile.username||req.user.email,status:'live',createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});res.status(201).json({id:ref.id,ok:true});}));
app.patch('/api/products/:id',requireUser,requireSeller,asyncRoute(async(req,res)=>{const ref=db.collection('products').doc(req.params.id), snap=await ref.get();if(!snap.exists)return res.status(404).json({error:'Product not found'});if(snap.data().sellerId!==req.user.uid)return res.status(403).json({error:'You can edit only your own products'});const allowed={};for(const k of ['name','description','imageUrl','category','status'])if(req.body[k]!==undefined)allowed[k]=req.body[k];if(req.body.price!==undefined){const n=Number(req.body.price);if(!Number.isFinite(n)||n<=0)return res.status(400).json({error:'Price must be positive'});allowed.price=n;}allowed.updatedAt=admin.firestore.FieldValue.serverTimestamp();await ref.update(allowed);res.json({ok:true});}));
app.delete('/api/products/:id',requireUser,requireSeller,asyncRoute(async(req,res)=>{const ref=db.collection('products').doc(req.params.id),snap=await ref.get();if(!snap.exists)return res.status(404).json({error:'Product not found'});if(snap.data().sellerId!==req.user.uid)return res.status(403).json({error:'You can remove only your own products'});await ref.update({status:'removed',updatedAt:admin.firestore.FieldValue.serverTimestamp()});res.json({ok:true});}));
app.get('/api/seller/summary',requireUser,requireSeller,asyncRoute(async(req,res)=>{const snap=await db.collection('products').where('sellerId','==',req.user.uid).get();res.json({productCount:snap.size,products:snap.docs.map(d=>({id:d.id,...d.data()})),earnings:0,note:'Earnings become available only after verified payment and order processing are integrated.'});}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error. Check server logs for details.'});});
const port=Number(process.env.PORT)||3000;app.listen(port,()=>console.log(`MuiZMarket API listening on ${port}`));
