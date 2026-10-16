/* MuiZMarket static-site safe page logic.
   GitHub Pages cannot run /api routes. Firebase handles identity; marketplace
   transactions require a separately deployed Node.js API. */
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = (amount, currency="USD") => new Intl.NumberFormat("en-US", {style:"currency",currency:["USD","NGN"].includes(currency)?currency:"USD",maximumFractionDigits:2}).format(Number(amount)||0);
const firebaseReady = () => Boolean(window.firebase && window.MUIZMARKET_FIREBASE_CONFIG && window.MUIZMARKET_FIREBASE_CONFIG.apiKey && window.MUIZMARKET_FIREBASE_CONFIG.projectId);
function getAuth(){ if(!firebaseReady()) return null; if(!firebase.apps.length) firebase.initializeApp(window.MUIZMARKET_FIREBASE_CONFIG); return firebase.auth(); }
async function getAccountRole(user){
 const snap=await firebase.firestore().collection("users").doc(user.uid).get();
 const p=snap.exists?(snap.data()||{}):{};
 const raw=String(p.role||p.accountType||p.userType||p.accountRole||"").trim().toLowerCase();
 if(["seller","vendor","merchant"].includes(raw))return "seller";
 return "buyer";
}
function redirectToRoleDashboard(role, current){
 const expected=role==="seller"?"seller":"buyer";
 if(current!==expected){location.replace(`./${expected}.html`);return true;}
 return false;
}
function toast(message){const el=$("#toast");if(!el)return;el.textContent=message;el.classList.add("show");}
function backendUnavailable(){return '<div class="form-message">Your Firebase account is available. Orders, checkout, seller applications, payouts, and support submissions need the separate MuiZMarket Node.js API server to be deployed and connected.</div>';}
async function setPageAuth(){
 const el=$("#pageAuth"); if(!el)return;
 try { const auth=getAuth(); if(!auth){el.textContent="Sign in";el.href="./account.html";return;}
  auth.onAuthStateChanged(user=>{ if(user&&user.emailVerified){el.textContent="Sign out";el.href="#signout";}else{el.textContent="Sign in";el.href="./account.html";} });
  el.addEventListener("click",async e=>{if(el.getAttribute("href")!=="#signout")return;e.preventDefault();try{await auth.signOut();location.href="./index.html";}catch(_){toast("Could not sign out. Please try again.");}});
 }catch(_){el.textContent="Sign in";el.href="./account.html";}
}
async function loadBuyer(){
 const root=$("#buyerDashboard");if(!root)return;
 root.innerHTML='<p>Checking your account…</p>';
 try {const auth=getAuth();if(!auth){root.innerHTML='<h2>Account setup needed</h2><p>Firebase could not be initialized. Check firebase-config.js and your Firebase project settings.</p><a class="btn btn-gold" href="./account.html">Open account ↗</a>';return;}
  const user=await new Promise((resolve,reject)=>{let unsubscribe;const timeout=setTimeout(()=>{if(unsubscribe)unsubscribe();reject(new Error("Account check timed out"));},10000);unsubscribe=auth.onAuthStateChanged(u=>{clearTimeout(timeout);unsubscribe();resolve(u);},err=>{clearTimeout(timeout);if(unsubscribe)unsubscribe();reject(err);});});
  if(!user){root.innerHTML='<h2>Sign in to continue</h2><p>Your order history is private to your account.</p><a class="btn btn-gold" href="./account.html">Sign in / create account ↗</a>';return;}
  if(!user.emailVerified){root.innerHTML=`<h2>Verify your email</h2><p>${esc(user.email)} is signed in, but the email address has not been verified.</p><p>Open the verification link sent to your inbox, then sign in again.</p><button class="btn btn-outline" id="resendVerification">Resend verification email</button><div id="buyerMessage" class="form-message" role="status"></div><button class="btn btn-outline" id="buyerSignOut">Sign out</button>`;
   $("#resendVerification").addEventListener("click",async()=>{const out=$("#buyerMessage");try{await user.sendEmailVerification();out.textContent="Verification email sent. Check your inbox and spam folder.";}catch(e){out.textContent=e.code==="auth/too-many-requests"?"Please wait before requesting another email.":"Could not send the email. Check your connection and Firebase settings.";}});
   $("#buyerSignOut").addEventListener("click",async()=>{await auth.signOut();location.href="./account.html";});return;
  }
  let role;
  try { role=await getAccountRole(user); } catch (_) { root.innerHTML='<h2>Could not check your account role</h2><p>Please refresh the page or sign in again so MuiZMarket can open the correct dashboard.</p><a class="btn btn-outline" href="./account.html">Return to sign in ↗</a>'; return; }
  if(redirectToRoleDashboard(role,"buyer"))return;
  let name=user.displayName||user.email.split("@")[0];
  try{const doc=await firebase.firestore().collection("users").doc(user.uid).get();if(doc.exists)name=doc.data().fullName||name;}catch(_){/* Profile is optional for the basic dashboard. */}
  root.innerHTML=`<h2>Welcome, ${esc(name)}</h2><p>${esc(user.email)} · Verified Firebase account</p>${backendUnavailable()}<a class="btn btn-gold" href="./index.html#marketplace">Browse marketplace ↗</a><button class="btn btn-outline" id="buyerSignOut">Sign out</button>`;
  $("#buyerSignOut").addEventListener("click",async()=>{await auth.signOut();location.href="./account.html";});
 }catch(e){root.innerHTML='<h2>We could not load your account</h2><p>Please check your internet connection and Firebase Authentication settings, then refresh this page.</p><a class="btn btn-outline" href="./account.html">Return to sign in ↗</a>';console.error("MuiZMarket buyer dashboard:",e);}
}
async function loadSeller(){
 const root=$("#sellerDashboard");if(!root)return;root.innerHTML='<p>Checking your account…</p>';
 try{const auth=getAuth();if(!auth){root.innerHTML='<h2>Account setup needed</h2><p>Check firebase-config.js and Firebase settings.</p><a class="btn btn-gold" href="./account.html">Sign in ↗</a>';return;}
  const user=await new Promise((resolve,reject)=>{let unsub;const timeout=setTimeout(()=>{if(unsub)unsub();reject(new Error("timeout"));},10000);unsub=auth.onAuthStateChanged(u=>{clearTimeout(timeout);unsub();resolve(u);},err=>{clearTimeout(timeout);if(unsub)unsub();reject(err);});});
  if(!user){root.innerHTML='<h2>Sign in to continue</h2><p>Create a buyer account first, then sign in here.</p><a class="btn btn-gold" href="./account.html">Sign in / create account ↗</a>';return;}
  if(!user.emailVerified){root.innerHTML='<h2>Verify your email first</h2><p>Open the verification link sent to your email, then sign in again.</p><a class="btn btn-outline" href="./account.html">Account sign-in ↗</a>';return;}
  let role;
  try { role=await getAccountRole(user); } catch (_) { root.innerHTML='<h2>Could not check your account role</h2><p>Please refresh the page or sign in again so MuiZMarket can open the correct dashboard.</p><a class="btn btn-outline" href="./account.html">Return to sign in ↗</a>'; return; }
  if(redirectToRoleDashboard(role,"seller"))return;
  let name=user.displayName||user.email.split("@")[0];try{const doc=await firebase.firestore().collection("users").doc(user.uid).get();if(doc.exists)name=doc.data().fullName||name;}catch(_){}
  root.innerHTML=`<h2>Welcome, ${esc(name)}</h2><p>${esc(user.email)} · Verified Firebase account</p><div class="seller-video-tool" style="margin:20px 0;padding:18px;border:1px solid #c8a85d;border-radius:14px"><h3>Product video preview</h3><p>Select a video from your device to preview it before preparing a digital product listing.</p><label for="sellerVideoFile">Choose product video</label><input id="sellerVideoFile" type="file" accept="video/mp4,video/webm,video/quicktime" style="display:block;margin:12px 0"><video id="sellerVideoPreview" controls playsinline hidden style="width:100%;max-height:360px;border-radius:10px;background:#000"></video><p id="sellerVideoStatus" role="status">Video preview only. Publishing and secure video uploads will be connected when the seller listing backend is deployed.</p></div>${backendUnavailable()}<a class="btn btn-gold" href="./index.html#sellerPortal">Return to marketplace ↗</a><a class="btn btn-outline" href="./settings.html">Profile settings ↗</a><button class="btn btn-outline" id="sellerSignOut">Sign out</button>`;
  const videoInput=$('#sellerVideoFile'),video=$('#sellerVideoPreview'),videoStatus=$('#sellerVideoStatus');let oldUrl='';videoInput?.addEventListener('change',()=>{const file=videoInput.files&&videoInput.files[0];if(!file)return;if(!file.type.startsWith('video/')){videoStatus.textContent='Choose a video file.';videoInput.value='';return;}if(file.size>100*1024*1024){videoStatus.textContent='For this preview, choose a video under 100 MB.';videoInput.value='';return;}if(oldUrl)URL.revokeObjectURL(oldUrl);oldUrl=URL.createObjectURL(file);video.src=oldUrl;video.hidden=false;videoStatus.textContent='Video ready to preview. This does not publish it to the marketplace yet.';});$('#sellerSignOut')?.addEventListener('click',async()=>{await auth.signOut();location.href='./account.html';});
 }catch(e){root.innerHTML='<h2>We could not load your seller page</h2><p>Check your connection and Firebase settings, then refresh.</p><a class="btn btn-outline" href="./account.html">Return to sign in ↗</a>';console.error("MuiZMarket seller dashboard:",e);}
}
async function loadSupportInbox(){
 const root=$("#supportInbox");if(!root)return;
 const auth=getAuth();
 if(!auth){root.innerHTML='<h2>Admin sign-in unavailable</h2><p>Firebase configuration is missing.</p><a class="btn btn-gold" href="./account.html">Sign in ↗</a>';return;}
 try{
  const user=await new Promise((resolve,reject)=>{let unsub;const timeout=setTimeout(()=>{if(unsub)unsub();reject(new Error('timeout'));},10000);unsub=auth.onAuthStateChanged(u=>{clearTimeout(timeout);unsub();resolve(u);},err=>{clearTimeout(timeout);if(unsub)unsub();reject(err);});});
  if(!user){root.innerHTML='<h2>Administrator sign-in required</h2><p>Sign in with the account whose Firebase UID is configured in the backend ADMIN_UIDS environment variable.</p><a class="btn btn-gold" href="./account.html">Sign in ↗</a>';return;}
  if(!user.emailVerified){root.innerHTML='<h2>Verify your email first</h2><p>Verify the administrator email address, then sign in again.</p><a class="btn btn-outline" href="./account.html">Account page ↗</a>';return;}
  const base=String(window.MUIZMARKET_API_URL||'').trim().replace(/\/$/,'');
  if(!base){root.innerHTML='<h2>Backend not connected</h2><p>Set MUIZMARKET_API_URL to your deployed Node.js API URL in firebase-config.js, then redeploy the frontend. Admin access requires the backend.</p>';return;}
  const token=await user.getIdToken();
  async function get(path){const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Admin request failed');return data;}
  const [summary,data]=await Promise.all([get('/api/admin/summary'),get('/api/admin/users?limit=200')]);
  const fmt=n=>new Intl.NumberFormat().format(Number(n)||0);
  const date=v=>v?new Date(v).toLocaleDateString():'—';
  root.innerHTML=`<div class="plan-grid"><div><b>Total accounts</b><strong>${fmt(summary.totalUsers)}</strong></div><div><b>Buyers</b><strong>${fmt(summary.buyers)}</strong></div><div><b>Sellers</b><strong>${fmt(summary.sellers)}</strong></div><div><b>Role missing</b><strong>${fmt(summary.unassigned)}</strong></div><div><b>Product records</b><strong>${fmt(summary.totalProducts)}</strong></div></div><div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:24px 0 12px"><h2>Registered accounts</h2><button class="btn btn-outline" id="adminRefresh">Refresh list ↻</button></div><label>Search accounts<input id="adminSearch" type="search" placeholder="Search name, username, email, country or role"></label><div style="overflow-x:auto"><table class="admin-users-table" style="width:100%;border-collapse:collapse;margin-top:14px"><thead><tr><th style="text-align:left;padding:10px">Name</th><th style="text-align:left;padding:10px">Username</th><th style="text-align:left;padding:10px">Email</th><th style="text-align:left;padding:10px">Country</th><th style="text-align:left;padding:10px">Role</th><th style="text-align:left;padding:10px">Joined</th></tr></thead><tbody id="adminUsersBody"></tbody></table></div><p class="account-muted small">For privacy, this list does not display phone numbers, dates of birth, or passwords.</p>`;
  const tbody=$('#adminUsersBody'),search=$('#adminSearch');
  function renderUsers(){const q=search.value.trim().toLowerCase();const rows=(data.users||[]).filter(u=>[u.fullName,u.username,u.email,u.country,u.role].join(' ').toLowerCase().includes(q));tbody.innerHTML=rows.length?rows.map(u=>`<tr><td style="padding:10px;border-top:1px solid #ddd">${esc(u.fullName||'—')}</td><td style="padding:10px;border-top:1px solid #ddd">${esc(u.username||'—')}</td><td style="padding:10px;border-top:1px solid #ddd">${esc(u.email||'—')}</td><td style="padding:10px;border-top:1px solid #ddd">${esc(u.country||'—')}</td><td style="padding:10px;border-top:1px solid #ddd">${esc(u.role||'unassigned')}</td><td style="padding:10px;border-top:1px solid #ddd">${date(u.createdAt)}</td></tr>`).join(''):'<tr><td colspan="6" style="padding:14px">No matching accounts.</td></tr>';}
  renderUsers();search.addEventListener('input',renderUsers);$('#adminRefresh').addEventListener('click',()=>loadSupportInbox());
 }catch(e){root.innerHTML=`<h2>Admin dashboard unavailable</h2><p>${esc(e.message==='Administrator access required'?'This signed-in account is not on the administrator allowlist.':e.message)}</p><p>Confirm the backend is deployed, ADMIN_UIDS contains your Firebase Auth UID, and MUIZMARKET_API_URL is correct.</p><button class="btn btn-outline" id="adminRetry">Try again ↻</button>`;$('#adminRetry')?.addEventListener('click',loadSupportInbox);}
}
async function init(){const year=$("#year");if(year)year.textContent=new Date().getFullYear();await setPageAuth();await loadBuyer();await loadSeller();await loadSupportInbox();const menu=$("#menuToggle");menu?.addEventListener("click",()=>{const nav=document.querySelector(".desktop-nav");if(!nav)return;const shown=nav.style.display==="flex";nav.style.display=shown?"none":"flex";if(!shown){nav.style.position="absolute";nav.style.top="70px";nav.style.left="0";nav.style.right="0";nav.style.padding="20px 7%";nav.style.background="#151512";nav.style.flexDirection="column";nav.style.borderBottom="1px solid #343126";}});}
document.addEventListener("click",e=>{if(e.target.closest("#applySeller"))toast("Seller applications need the Node.js API server to be deployed first.");if(e.target.closest("#refreshSeller")||e.target.closest("#refreshOrders"))toast("Refresh the page after the marketplace backend has been deployed.");});
const chatForm=$("#aiChatForm");chatForm?.addEventListener("submit",e=>{e.preventDefault();const log=$("#chatLog");if(log)log.insertAdjacentHTML("beforeend",'<div class="chat-bubble assistant">AI support is not connected yet. Deploy and configure the Node.js API server to enable it.</div>');});
const contactForm=$("#contactForm");contactForm?.addEventListener("submit",e=>{e.preventDefault();const out=$("#contactMessage");if(out)out.textContent="Contact submissions are temporarily unavailable until the Node.js API server is deployed.";});
init().catch(err=>{console.error("MuiZMarket page initialization:",err);});
