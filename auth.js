(() => {
  const $ = (s) => document.querySelector(s);
  const registerForm = $('#registerForm'), loginForm = $('#loginForm'), resetForm = $('#resetForm');
  const title = $('#formTitle'), subtitle = $('#formSubtitle'), message = $('#accountMessage');
  const tabs = [...document.querySelectorAll('[data-view]')];
  let auth = null, db = null, currentView = 'register';
  const config = window.MUIZMARKET_FIREBASE_CONFIG;
  const configReady = config && config.apiKey && !config.apiKey.includes('PASTE_') && config.projectId && !config.projectId.includes('YOUR_') && config.appId && !config.appId.includes('YOUR_');
  const say = (text, type='') => { message.textContent = text; message.className = `form-message ${type}`; };
  const setBusy = (form, busy, text) => { const button=form.querySelector('button[type="submit"]'); if(button){button.disabled=busy; if(!button.dataset.original)button.dataset.original=button.textContent; button.textContent=busy?'Please wait…':(text||button.dataset.original);} };
  function view(which){currentView=which; registerForm.hidden=which!=='register'; loginForm.hidden=which!=='login'; resetForm.hidden=which!=='reset'; tabs.forEach(t=>t.classList.toggle('active',t.dataset.view===which)); title.textContent=which==='register'?'Create your account':which==='login'?'Sign in':'Reset your password'; subtitle.textContent=which==='register'?'Join the marketplace to manage your digital purchases.':which==='login'?'Welcome back. Sign in to your MuiZMarket account.':'We will email you a secure password-reset link.'; say('');}
  tabs.forEach(t=>t.addEventListener('click',()=>view(t.dataset.view)));
  $('#forgotLink').addEventListener('click',()=>view('reset')); $('#backToLogin').addEventListener('click',()=>view('login'));
  if(!configReady || !window.firebase){$('#setupNotice').hidden=false; say('Setup is not complete yet. No account data has been submitted. Follow SETUP-FIREBASE.txt before testing registration.','error'); [...document.querySelectorAll('form button[type="submit"]')].forEach(b=>b.disabled=true); return;}
  try { if(!firebase.apps.length) firebase.initializeApp(config); auth=firebase.auth(); db=firebase.firestore(); auth.useDeviceLanguage(); }
  catch(err){$('#setupNotice').hidden=false;say('Firebase setup error: '+err.message,'error');return;}
  function cleanError(err){const code=err&&err.code;const messages={
    'auth/email-already-in-use':'An account already uses this email. Try signing in instead.',
    'auth/invalid-email':'Enter a valid email address.',
    'auth/weak-password':'Choose a stronger password with at least 12 characters.',
    'auth/user-not-found':'If that email has an account, you can request a password-reset email.',
    'auth/wrong-password':'Email or password is incorrect.',
    'auth/invalid-credential':'Email or password is incorrect.',
    'auth/too-many-requests':'Too many attempts. Wait a while before trying again.',
    'auth/network-request-failed':'Network error. Check your connection and try again.',
    'permission-denied':'The database rejected this action. Check the Firestore security rules in SETUP-FIREBASE.txt.'
  };return messages[code]||'Could not complete this request. Check your connection and Firebase setup, then try again.';}
  const normalUsername=v=>v.trim().toLowerCase();
  registerForm.addEventListener('submit',async e=>{
    e.preventDefault(); say(''); if(!registerForm.reportValidity())return;
    const f=new FormData(registerForm), fullName=String(f.get('fullName')).trim(), username=String(f.get('username')).trim(), usernameKey=normalUsername(username), email=String(f.get('email')).trim().toLowerCase(), password=String(f.get('password')), country=String(f.get('country')), phone=String(f.get('phone')).trim(), dob=String(f.get('dob'));
    if(!/^[A-Za-z0-9_]{3,24}$/.test(username)){say('Username must be 3–24 letters, numbers, or underscores.','error');return;}
    if(!/^\+[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g,''))){say('Enter your phone number with country code, such as +2348012345678.','error');return;}
    if(new Date(dob+'T00:00:00')>=new Date()){say('Enter a valid date of birth in the past.','error');return;}
    if(password.length<12){say('Use a password with at least 12 characters.','error');return;}
    setBusy(registerForm,true);
    let credential=null, reserved=false;
    try{
      // Reserve username and write the profile in one transaction; Firestore rules must be installed first.
      credential=await auth.createUserWithEmailAndPassword(email,password);
      const user=credential.user, usernameRef=db.collection('usernames').doc(usernameKey), profileRef=db.collection('users').doc(user.uid);
      // Send verification before profile transaction so a mail-service failure cannot leave a saved profile behind.
      await user.sendEmailVerification({url:window.location.origin+window.location.pathname,handleCodeInApp:false});
      await db.runTransaction(async tx=>{const existing=await tx.get(usernameRef);if(existing.exists)throw new Error('USERNAME_TAKEN');tx.set(usernameRef,{uid:user.uid});tx.set(profileRef,{uid:user.uid,fullName,username,usernameKey,email,country,phone,dob,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});});
      registerForm.reset(); say('Account created. Check your email for a verification link before using account features. You can now sign in after verifying your address.','success'); view('login');
    }catch(err){
      if(credential && credential.user){
        // If profile creation failed, remove the newly-created unverified auth account to avoid an orphan account.
        try{await credential.user.delete();}catch(_){ }
      }
      say(err.message==='USERNAME_TAKEN'?'That username is already taken. Choose another one.':cleanError(err),'error');
    }finally{setBusy(registerForm,false);}
  });
  loginForm.addEventListener('submit',async e=>{e.preventDefault();say('');if(!loginForm.reportValidity())return;const f=new FormData(loginForm),email=String(f.get('email')).trim().toLowerCase(),password=String(f.get('password'));setBusy(loginForm,true);try{const result=await auth.signInWithEmailAndPassword(email,password);if(!result.user.emailVerified){await auth.signOut();say('Please verify your email using the link we sent before signing in. Check your inbox and spam folder.','error');return;}say('Signed in successfully. Opening your buyer dashboard…','success');$('#accountStatus').hidden=false;$('#accountStatus').textContent='Signed in as '+result.user.email;$('#signOutButton').hidden=false;loginForm.reset();window.setTimeout(()=>{window.location.href='./buyer.html';},700);}catch(err){say(cleanError(err),'error');}finally{setBusy(loginForm,false);}});
  resetForm.addEventListener('submit',async e=>{e.preventDefault();say('');if(!resetForm.reportValidity())return;const email=String(new FormData(resetForm).get('email')).trim().toLowerCase();setBusy(resetForm,true);try{await auth.sendPasswordResetEmail(email);say('If an account exists for that address, a password-reset email has been sent. Check your inbox and spam folder.','success');resetForm.reset();}catch(err){say(cleanError(err),'error');}finally{setBusy(resetForm,false);}});
  $('#signOutButton').addEventListener('click',async()=>{try{await auth.signOut();$('#accountStatus').hidden=true;$('#signOutButton').hidden=true;say('You have signed out.','success');view('login');}catch(err){say(cleanError(err),'error');}});
  auth.onAuthStateChanged(user=>{if(user && user.emailVerified){$('#accountStatus').hidden=false;$('#accountStatus').textContent='Signed in as '+user.email;$('#signOutButton').hidden=false;}else{$('#accountStatus').hidden=true;$('#signOutButton').hidden=true;}});
})();