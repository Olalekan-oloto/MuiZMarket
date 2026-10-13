/* MuiZMarket static-site safe page logic.
   GitHub Pages cannot run /api routes. Firebase handles identity; marketplace
   transactions require a separately deployed Node.js API. */
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = (amount, currency="USD") => new Intl.NumberFormat("en-US", {style:"currency",currency:["USD","NGN"].includes(currency)?currency:"USD",maximumFractionDigits:2}).format(Number(amount)||0);
const firebaseReady = () => Boolean(window.firebase && window.MUIZMARKET_FIREBASE_CONFIG && window.MUIZMARKET_FIREBASE_CONFIG.apiKey && window.MUIZMARKET_FIREBASE_CONFIG.projectId);
function getAuth(){ if(!firebaseReady()) return null; if(!firebase.apps.length) firebase.initializeApp(window.MUIZMARKET_FIREBASE_CONFIG); return firebase.auth(); }
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
  let name=user.displayName||user.email.split("@")[0];try{const doc=await firebase.firestore().collection("users").doc(user.uid).get();if(doc.exists)name=doc.data().fullName||name;}catch(_){}
  root.innerHTML=`<h2>Welcome, ${esc(name)}</h2><p>${esc(user.email)} · Verified Firebase account</p>${backendUnavailable()}<p>Seller applications and seller tools will become active when the Node.js API server is deployed.</p><a class="btn btn-gold" href="./index.html#sellerPortal">Return to marketplace ↗</a>`;
 }catch(e){root.innerHTML='<h2>We could not load your seller page</h2><p>Check your connection and Firebase settings, then refresh.</p><a class="btn btn-outline" href="./account.html">Return to sign in ↗</a>';console.error("MuiZMarket seller dashboard:",e);}
}
async function loadSupportInbox(){const root=$("#supportInbox");if(root)root.innerHTML='<h2>Support inbox requires the backend</h2><p>Deploy the Node.js API and configure administrator access to use this page.</p>';}
async function init(){const year=$("#year");if(year)year.textContent=new Date().getFullYear();await setPageAuth();await loadBuyer();await loadSeller();await loadSupportInbox();const menu=$("#menuToggle");menu?.addEventListener("click",()=>{const nav=document.querySelector(".desktop-nav");if(!nav)return;const shown=nav.style.display==="flex";nav.style.display=shown?"none":"flex";if(!shown){nav.style.position="absolute";nav.style.top="70px";nav.style.left="0";nav.style.right="0";nav.style.padding="20px 7%";nav.style.background="#151512";nav.style.flexDirection="column";nav.style.borderBottom="1px solid #343126";}});}
document.addEventListener("click",e=>{if(e.target.closest("#applySeller"))toast("Seller applications need the Node.js API server to be deployed first.");if(e.target.closest("#refreshSeller")||e.target.closest("#refreshOrders"))toast("Refresh the page after the marketplace backend has been deployed.");});
const chatForm=$("#aiChatForm");chatForm?.addEventListener("submit",e=>{e.preventDefault();const log=$("#chatLog");if(log)log.insertAdjacentHTML("beforeend",'<div class="chat-bubble assistant">AI support is not connected yet. Deploy and configure the Node.js API server to enable it.</div>');});
const contactForm=$("#contactForm");contactForm?.addEventListener("submit",e=>{e.preventDefault();const out=$("#contactMessage");if(out)out.textContent="Contact submissions are temporarily unavailable until the Node.js API server is deployed.";});
init().catch(err=>{console.error("MuiZMarket page initialization:",err);});
