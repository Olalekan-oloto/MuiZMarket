// MuiZMarket API server. Requires Node.js 20+ and Firebase Admin credentials.
// Never commit service-account keys or .env files.
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to MuiZMarket API",
    status: "success",
    endpoints: [
      "/health",
      "/api/products"
    ]
  });
});
app.use(express.json({limit:'1mb'}));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
app.use(cors({origin(origin, cb){ if(!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return cb(null,true); return cb(new Error('Origin not allowed')); }}));
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
 console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Set it in your hosting provider.');
 process.exit(1);
}
const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!rawCredentials) {
  console.error("Firebase credentials are missing.");
  process.exit(1);
}

let credentials;

try {
  credentials = JSON.parse(rawCredentials);
} catch (error) {
  console.error(
    "Firebase credentials are not valid JSON. Check the Render environment variable value."
  );
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(credentials)
});
const db=admin.firestore();
const auth=admin.auth();
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
async function requireUser(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Sign in required'});req.user=await auth.verifyIdToken(h.slice(7));next();}catch(e){return res.status(401).json({error:'Your session is invalid or expired'});}}
async function profile(uid){const s=await db.collection('users').doc(uid).get();return s.exists?s.data():{};}
async function requireSeller(req,res,next){try{const p=await profile(req.user.uid);if(p.role!=='seller' && p.accountType!=='seller')return res.status(403).json({error:'Choose or activate a seller account first'});req.profile=p;next();}catch(e){next(e)}}
app.get('/health',(req,res)=>res.json({ok:true,service:'MuiZMarket API'}));
app.get('/api/me',requireUser,asyncRoute(async(req,res)=>res.json({uid:req.user.uid, ...(await profile(req.user.uid))})));
app.post('/api/account/role',requireUser,asyncRoute(async(req,res)=>{const role=req.body.role;if(!['buyer','seller'].includes(role))return res.status(400).json({error:'Role must be buyer or seller'});const ref=db.collection('users').doc(req.user.uid);await ref.set({uid:req.user.uid,role,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});res.json({ok:true,role});}));
app.get('/api/products',asyncRoute(async(req,res)=>{let q=db.collection('products').where('status','==','live').orderBy('createdAt','desc').limit(100);const snap=await q.get();res.json({products:snap.docs.map(d=>({id:d.id,...d.data()}))});}));
app.post('/api/products',requireUser,requireSeller,asyncRoute(async(req,res)=>{const {name,description,price,currency='NGN',imageUrl,category}=req.body||{};if(typeof name!=='string'||name.trim().length<2||typeof description!=='string'||!Number.isFinite(Number(price))||Number(price)<=0)return res.status(400).json({error:'Provide a product name, description and positive price'});const ref=await db.collection('products').add({name:name.trim().slice(0,120),description:description.trim().slice(0,5000),price:Number(price),currency:['NGN','USD'].includes(currency)?currency:'NGN',imageUrl:typeof imageUrl==='string'?imageUrl.slice(0,2000):'',category:typeof category==='string'?category.slice(0,80):'General',sellerId:req.user.uid,sellerName:req.profile.fullName||req.profile.username||req.user.email,status:'live',createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});res.status(201).json({id:ref.id,ok:true});}));
app.patch('/api/products/:id',requireUser,requireSeller,asyncRoute(async(req,res)=>{const ref=db.collection('products').doc(req.params.id), snap=await ref.get();if(!snap.exists)return res.status(404).json({error:'Product not found'});if(snap.data().sellerId!==req.user.uid)return res.status(403).json({error:'You can edit only your own products'});const allowed={};for(const k of ['name','description','imageUrl','category','status'])if(req.body[k]!==undefined)allowed[k]=req.body[k];if(req.body.price!==undefined){const n=Number(req.body.price);if(!Number.isFinite(n)||n<=0)return res.status(400).json({error:'Price must be positive'});allowed.price=n;}allowed.updatedAt=admin.firestore.FieldValue.serverTimestamp();await ref.update(allowed);res.json({ok:true});}));
app.delete('/api/products/:id',requireUser,requireSeller,asyncRoute(async(req,res)=>{const ref=db.collection('products').doc(req.params.id),snap=await ref.get();if(!snap.exists)return res.status(404).json({error:'Product not found'});if(snap.data().sellerId!==req.user.uid)return res.status(403).json({error:'You can remove only your own products'});await ref.update({status:'removed',updatedAt:admin.firestore.FieldValue.serverTimestamp()});res.json({ok:true});}));
app.get('/api/seller/summary',requireUser,requireSeller,asyncRoute(async(req,res)=>{const snap=await db.collection('products').where('sellerId','==',req.user.uid).get();res.json({productCount:snap.size,products:snap.docs.map(d=>({id:d.id,...d.data()})),earnings:0,note:'Earnings become available only after verified payment and order processing are integrated.'});}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Server error. Check server logs for details.'});});
const port=Number(process.env.PORT)||3000;app.listen(port,()=>console.log(`MuiZMarket API listening on ${port}`));
