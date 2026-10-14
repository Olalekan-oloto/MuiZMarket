(() => {
  const $ = s => document.querySelector(s);
  const registerForm = $('#registerForm'), loginForm = $('#loginForm'), resetForm = $('#resetForm');
  const tabs = [...document.querySelectorAll('.auth-tab')];
  const title = $('#formTitle'), subtitle = $('#formSubtitle'), message = $('#accountMessage');
  let auth, db, configReady = false, currentView = 'register', phoneWidget = null;
  const config = window.MUIZMARKET_FIREBASE_CONFIG || {};
  const phoneInput = $('#phoneInput');
  if (phoneInput && window.intlTelInput) { phoneWidget = window.intlTelInput(phoneInput, { initialCountry: 'ng', separateDialCode: true, nationalMode: false, preferredCountries: ['ng','gh','za','ke','us','gb','ca'], utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@25.3.1/build/js/utils.js' }); }
  const countrySelect = document.querySelector('select[name="country"]');
  if (countrySelect && phoneWidget) { countrySelect.addEventListener('change', () => { const map = { 'Nigeria':'ng','United States':'us','United Kingdom':'gb','Canada':'ca','Ghana':'gh','South Africa':'za','Kenya':'ke','India':'in','Australia':'au','Germany':'de','France':'fr' }; const code = map[countrySelect.value]; if (code) phoneWidget.setCountry(code); }); }
  configReady = !!(config.apiKey && config.authDomain && config.projectId && config.appId);
  const say = (text, kind='') => { if (!message) return; message.textContent=text; message.className='form-message '+kind; };
  const setBusy = (el, busy) => { if(!el)return; const buttons=el.matches&&el.matches('button')?[el]:[...el.querySelectorAll('button')]; buttons.forEach(b=>{if(!b.dataset.label)b.dataset.label=b.textContent;b.disabled=busy;b.textContent=busy?'Please wait…':b.dataset.label;}); };
  const view = which => { currentView=which; registerForm.hidden=which!=='register'; loginForm.hidden=which!=='login'; resetForm.hidden=which!=='reset'; tabs.forEach(t=>t.classList.toggle('active',t.dataset.view===which)); title.textContent=which==='register'?'Create your account':which==='login'?'Sign in':'Reset your password'; subtitle.textContent=which==='register'?'Join the marketplace to manage your digital purchases.':which==='login'?'Welcome back. Sign in to your MuiZMarket account.':'We will email you a secure password-reset link.'; say(''); };
  tabs.forEach(t=>t.addEventListener('click',()=>view(t.dataset.view)));
  $('#forgotLink').addEventListener('click',()=>view('reset')); $('#backToLogin').addEventListener('click',()=>view('login'));
  if(!configReady || !window.firebase) { $('#setupNotice').hidden=false; say('Firebase setup is not complete. Fill firebase-config.js with the web app settings for the correct Firebase project, then enable Authentication and Firestore.','error'); [...document.querySelectorAll('form button[type="submit"],#googleAuth,#appleAuth')].forEach(b=>b.disabled=true); return; }
  try { if(!firebase.apps.length) firebase.initializeApp(config); auth=firebase.auth(); db=firebase.firestore(); auth.useDeviceLanguage(); }
  catch(err){ $('#setupNotice').hidden=false; say('Firebase setup error: '+err.message,'error'); return; }

  function cleanError(err) {
    const code=err&&err.code;
    const messages={
      'auth/email-already-in-use':'An account already uses this email. Try signing in instead.',
      'auth/invalid-email':'Enter a valid email address.',
      'auth/weak-password':'Choose a stronger password with at least 12 characters.',
      'auth/user-not-found':'If an account exists for that address, you can request a password-reset email.',
      'auth/wrong-password':'Email or password is incorrect.',
      'auth/invalid-credential':'Email or password is incorrect.',
      'auth/too-many-requests':'Too many attempts. Wait a while before trying again.',
      'auth/network-request-failed':'Network error. Check your connection and try again.',
      'auth/operation-not-allowed':'This sign-in method is not enabled in Firebase Authentication yet.',
      'auth/unauthorized-domain':'This website domain is not authorized. Add olalekan-oloto.github.io under Firebase Authentication settings → Authorized domains.',
      'auth/popup-blocked':'Your browser blocked the sign-in window. Try again or allow pop-ups.',
      'auth/operation-not-supported-in-this-environment':'This sign-in method is not supported in this browser context. Open the HTTPS GitHub Pages website in Chrome.',
      'permission-denied':'Firestore denied a profile operation. Check that the updated firestore.rules have been published.',
      'storage/unauthorized':'Firebase Storage denied this photo upload. Publish the storage.rules file and check that Storage is enabled.'
    };
    return messages[code]||(err&&err.message?err.message:'Could not complete this request. Check your connection and Firebase setup.');
  }
  const norm = s => String(s||'').trim().toLowerCase();
  function usernameFromName(name, uid) {
    const base=norm(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_]+/g,'').slice(0,16) || 'member';
    return (base.length<3 ? (base+'user').slice(0,24) : base) + String(uid||'').replace(/[^a-z0-9]/gi,'').slice(-5).toLowerCase();
  }
  async function ensureProfile(user, overrides={}) {
    const ref=db.collection('users').doc(user.uid);
    const snap=await ref.get();
    if(snap.exists) {
      const old=snap.data()||{};
      const patch={updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
      if(!old.fullName && (user.displayName||overrides.fullName)) patch.fullName=user.displayName||overrides.fullName;
      if(!old.email && user.email) patch.email=user.email;
      if(!old.profilePhotoURL && user.photoURL) patch.profilePhotoURL=user.photoURL;
      if(!old.username) {
        const uname=usernameFromName(user.displayName||overrides.fullName,user.uid);
        const key=norm(uname);
        await db.runTransaction(async tx=>{const uref=db.collection('usernames').doc(key);const u=await tx.get(uref);if(!u.exists){tx.set(uref,{uid:user.uid});tx.update(ref,{username:uname,usernameKey:key,...patch});}});
      } else if(Object.keys(patch).length>1) await ref.update(patch);
      return (await ref.get()).data()||old;
    }
    const fullName=String(overrides.fullName||user.displayName||'').trim();
    const proposed=String(overrides.username||usernameFromName(fullName,user.uid)).trim();
    const usernameKey=norm(proposed);
    const profile={
      uid:user.uid, fullName, username:proposed, usernameKey,
      email:user.email||'', country:String(overrides.country||''),
      phone:String(overrides.phone||''), dob:String(overrides.dob||''), role:overrides.role==='seller'?'seller':'buyer',
      profilePhotoURL:user.photoURL||'',
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.runTransaction(async tx=>{
      const uref=db.collection('usernames').doc(usernameKey);
      const existing=await tx.get(uref);
      if(existing.exists && existing.data().uid!==user.uid) {
        if(overrides.username) throw new Error('USERNAME_TAKEN');
        const fallback=usernameFromName(fullName,user.uid);
        const fallbackKey=norm(fallback);
        if(fallbackKey===usernameKey) throw new Error('USERNAME_TAKEN');
        profile.username=fallback; profile.usernameKey=fallbackKey;
        const fallbackRef=db.collection('usernames').doc(fallbackKey);
        const fallbackSnap=await tx.get(fallbackRef);
        if(fallbackSnap.exists && fallbackSnap.data().uid!==user.uid) throw new Error('USERNAME_TAKEN');
        tx.set(fallbackRef,{uid:user.uid});
      } else tx.set(uref,{uid:user.uid});
      tx.set(ref,profile);
    });
    return profile;
  }
  async function destinationFor(user) {
    const snap=await db.collection('users').doc(user.uid).get();
    const p=snap.exists?snap.data():{};
    if(!p.country || !p.phone || !p.dob) return './settings.html';
    return p.role==='seller'?'./seller.html':'./buyer.html';
  }
  async function continueUser(user, welcome=false) {
    const p=await ensureProfile(user);
    const dest=(!p.country||!p.phone||!p.dob)?'./settings.html':(p.role==='seller'?'./seller.html':'./buyer.html');
    if(welcome && dest==='./settings.html') say('Signed in. Your profile has been started using your provider name. Complete country, phone number and date of birth in Profile Settings.','success');
    window.location.assign(new URL(dest,window.location.href).href);
  }

  async function oauth(providerName) {
    say('');
    const button=$('#'+providerName+'Auth'); setBusy(button,true);
    try {
      let provider;
      if(providerName==='google') provider=new firebase.auth.GoogleAuthProvider();
      else { provider=new firebase.auth.OAuthProvider('apple.com'); provider.addScope('email'); provider.addScope('name'); }
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      // Redirect is the recommended OAuth flow on mobile browsers.
      await auth.signInWithRedirect(provider);
    } catch(err) { say(cleanError(err),'error'); setBusy(button,false); }
  }
  $('#googleAuth').addEventListener('click',()=>oauth('google'));
  $('#appleAuth').addEventListener('click',()=>oauth('apple'));
  auth.getRedirectResult().then(async result=>{
    if(result && result.user) {
      await ensureProfile(result.user);
      await continueUser(result.user,true);
    }
  }).catch(err=>say(cleanError(err),'error'));

  registerForm.addEventListener('submit',async e=>{
    e.preventDefault(); say(''); if(!registerForm.reportValidity())return;
    const f=new FormData(registerForm), fullName=String(f.get('fullName')).trim(), username=String(f.get('username')).trim(), usernameKey=norm(username), email=norm(f.get('email')), password=String(f.get('password')), country=String(f.get('country')), role=String(f.get('role')||'buyer'), phone=phoneWidget?phoneWidget.getNumber():String(f.get('phone')).trim(), dob=String(f.get('dob'));
    if(phoneWidget && !phoneWidget.isValidNumber()){say('Choose the correct phone country code and enter a valid phone number.','error');return;}
    if(!/^[A-Za-z0-9_]{3,24}$/.test(username)){say('Username must be 3–24 letters, numbers, or underscores.','error');return;}
    if(!/^\+[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g,''))){say('Enter your phone number with country code, such as +2348012345678.','error');return;}
    if(new Date(dob+'T00:00:00')>=new Date()){say('Enter a valid date of birth in the past.','error');return;}
    if(password.length<12){say('Use a password with at least 12 characters.','error');return;}
    setBusy(registerForm,true); let credential=null;
    try {
      credential=await auth.createUserWithEmailAndPassword(email,password);
      await credential.user.updateProfile({displayName:fullName});
      await ensureProfile(credential.user,{fullName,username,country,phone,dob,role});
      let verificationSent=true;
      try { await credential.user.sendEmailVerification({url:window.location.href,handleCodeInApp:false}); } catch(err){verificationSent=false;console.error('Verification email failed',err);}
      say(verificationSent?'Account created! Check your email to verify your address. Opening your '+(role==='seller'?'seller':'buyer')+' dashboard…':'Account created, but the verification email could not be sent. Check Firebase email settings. Opening your dashboard…','success');
      const target=role==='seller'?'./seller.html':'./buyer.html'; window.setTimeout(()=>window.location.assign(new URL(target,window.location.href).href),1200);
    } catch(err) {
      console.error('MuiZMarket registration failed',err);
      if(credential&&credential.user){try{const s=await db.collection('users').doc(credential.user.uid).get();if(!s.exists)await credential.user.delete();}catch(_){}}
      say(err.message==='USERNAME_TAKEN'?'That username is already taken. Choose another.':cleanError(err),'error');
    } finally {setBusy(registerForm,false);}
  });
  loginForm.addEventListener('submit',async e=>{
    e.preventDefault(); say(''); if(!loginForm.reportValidity())return;
    const f=new FormData(loginForm); setBusy(loginForm,true);
    try {
      const result=await auth.signInWithEmailAndPassword(norm(f.get('email')),String(f.get('password')));
      await result.user.reload(); const user=auth.currentUser||result.user;
      if(!user.emailVerified){try{await user.sendEmailVerification({url:window.location.href,handleCodeInApp:false});}catch(_){} await auth.signOut();say('Please verify your email first. Check your inbox and spam folder for the verification link.','error');return;}
      await ensureProfile(user); await continueUser(user);
    } catch(err){say(cleanError(err),'error');} finally{setBusy(loginForm,false);}
  });
  resetForm.addEventListener('submit',async e=>{e.preventDefault();say('');if(!resetForm.reportValidity())return;const email=norm(new FormData(resetForm).get('email'));setBusy(resetForm,true);try{await auth.sendPasswordResetEmail(email);say('If an account exists for that address, a password-reset email has been sent. Check your inbox and spam folder.','success');resetForm.reset();}catch(err){say(cleanError(err),'error');}finally{setBusy(resetForm,false);}});
  $('#signOutButton').addEventListener('click',async()=>{try{await auth.signOut();say('You have signed out.','success');view('login');}catch(err){say(cleanError(err),'error');}});
  auth.onAuthStateChanged(user=>{if(user){$('#accountStatus').hidden=false;$('#accountStatus').textContent='Signed in as '+(user.email||'your account');$('#signOutButton').hidden=false;}else{$('#accountStatus').hidden=true;$('#signOutButton').hidden=true;}});
})();
