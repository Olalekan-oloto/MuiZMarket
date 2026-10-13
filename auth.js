(() => {
  const $ = (s) => document.querySelector(s);
  const registerForm = $('#registerForm'), loginForm = $('#loginForm'), resetForm = $('#resetForm');
  const title = $('#formTitle'), subtitle = $('#formSubtitle'), message = $('#accountMessage');
  const tabs = [...document.querySelectorAll('[data-view]')];
  let auth = null, db = null, currentView = 'register';
  const accountStatusEl = document.querySelector('#accountStatus');
  const signOutButtonEl = document.querySelector('#signOutButton');
  if (accountStatusEl) accountStatusEl.hidden = true;
  if (signOutButtonEl) signOutButtonEl.hidden = true;
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
    'auth/operation-not-allowed':'Email/password sign-in is disabled for this Firebase project. Enable the Email/Password provider in Firebase Authentication.',
    'auth/invalid-api-key':'Firebase API key is invalid. Check the existing web app configuration.',
    'permission-denied':'Firestore denied a database operation during registration or sign-in. Your current rules appear compatible with the profile fields, so verify that the website is using the intended Firebase project and that the published rules match SETUP-FIREBASE.txt. No security rules were changed.'
  };return messages[code]||(code ? 'Could not complete this request ('+code+'). Check the browser console for details, then verify your Firebase setup.' : 'Could not complete this request. Check your connection and Firebase setup, then try again.');}
  const normalUsername=v=>v.trim().toLowerCase();
  const apiBase=()=>String(window.MUIZMARKET_API_URL||'').trim().replace(/\/$/,'');
  async function apiRequest(path, options={}) {
    const base=apiBase(); if(!base) throw new Error('API_NOT_CONFIGURED');
    const user=auth.currentUser; const token=user?await user.getIdToken():'';
    const response=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{})}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(body.error||'API_REQUEST_FAILED');
    return body;
  }
  registerForm.addEventListener('submit',async e=>{
    e.preventDefault(); say(''); if(!registerForm.reportValidity())return;
    const f=new FormData(registerForm), fullName=String(f.get('fullName')).trim(), username=String(f.get('username')).trim(), usernameKey=normalUsername(username), email=String(f.get('email')).trim().toLowerCase(), password=String(f.get('password')), role=String(f.get('role')||'buyer').toLowerCase(), country=String(f.get('country')), phone=String(f.get('phone')).trim(), dob=String(f.get('dob'));
    if(!['buyer','seller'].includes(role)){say('Choose Buyer or Seller to continue.','error');return;}
    if(!/^[A-Za-z0-9_]{3,24}$/.test(username)){say('Username must be 3–24 letters, numbers, or underscores.','error');return;}
    if(!/^\+[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g,''))){say('Enter your phone number with country code, such as +2348012345678.','error');return;}
    if(new Date(dob+'T00:00:00')>=new Date()){say('Enter a valid date of birth in the past.','error');return;}
    if(password.length<12){say('Use a password with at least 12 characters.','error');return;}
    setBusy(registerForm,true);
    let credential=null, reserved=false;
    try{
      credential=await auth.createUserWithEmailAndPassword(email,password);
      const user=credential.user, usernameRef=db.collection('usernames').doc(usernameKey), profileRef=db.collection('users').doc(user.uid);
      // Keep the profile fields compatible with the existing Firestore rules.
      await db.runTransaction(async tx=>{const existing=await tx.get(usernameRef);if(existing.exists)throw new Error('USERNAME_TAKEN');tx.set(usernameRef,{uid:user.uid});tx.set(profileRef,{uid:user.uid,fullName,username,usernameKey,email,country,phone,dob,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});});
      let roleSaved = role === 'buyer';
      if(apiBase()) {
        try { await apiRequest('/api/account/role',{method:'POST',body:JSON.stringify({role})}); roleSaved=true; }
        catch(roleError) { console.error('MuiZMarket role setup:',roleError); }
      }
      let verificationSent=true;
      try { await user.sendEmailVerification({url:window.location.origin+window.location.pathname,handleCodeInApp:false}); }
      catch(emailError) { verificationSent=false; console.error('MuiZMarket verification email:',emailError); }
      registerForm.reset();
      const roleNote=roleSaved?'':(role==='seller'?' Your account was created, but seller role setup needs the deployed API. Keep this account; do not register again.':'');
      const mailNote=verificationSent?' Check your email for the verification link.':' Your account was created, but the verification email could not be sent. Sign in to request another verification email.';
      view('login'); say('Account created successfully.'+mailNote+roleNote,'success');
    }catch(err){
      console.error('MuiZMarket registration failed:', {
        code: err && err.code ? err.code : null,
        message: err && err.message ? err.message : String(err)
      });
      // Delete the Auth user only when profile creation failed; never delete an account
      // because verification email delivery or role assignment had a temporary failure.
      if(credential && credential.user) {
        try { const profile=await db.collection('users').doc(credential.user.uid).get(); if(!profile.exists) await credential.user.delete(); } catch(_) { /* preserve the account if cleanup cannot be confirmed */ }
      }
      say(err.message==='USERNAME_TAKEN'?'That username is already taken. Choose another one.':cleanError(err),'error');
    }finally{setBusy(registerForm,false);}
  });
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    say('');
    if (!loginForm.reportValidity()) return;
    const f = new FormData(loginForm);
    const email = String(f.get('email')).trim().toLowerCase();
    const password = String(f.get('password'));
    setBusy(loginForm, true);
    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      // Refresh the user so a verification completed in another tab is recognized.
      await result.user.reload();
      const user = auth.currentUser || result.user;
      if (!user.emailVerified) {
        let resent=false;
        try { await user.sendEmailVerification({url:window.location.origin+window.location.pathname,handleCodeInApp:false}); resent=true; } catch (_) {}
        await auth.signOut();
        say(resent?'Your email is not verified yet. We sent a fresh verification link; check your inbox and spam folder.':'Your email is not verified yet. Check your inbox and spam folder, wait a little, then try signing in again to request another link.', 'error');
        return;
      }
      // Read the role saved in this user's existing profile. The user does not
      // need to choose a dashboard during sign-in.
      let role = 'buyer';
      try {
        const profileSnap = await db.collection('users').doc(user.uid).get();
        if (profileSnap.exists) {
          const profile = profileSnap.data() || {};
          const rawRole = String(profile.role || profile.accountType || profile.userType || profile.accountRole || '').trim().toLowerCase();
          if (['seller', 'vendor', 'merchant'].includes(rawRole)) role = 'seller';
          else if (['buyer', 'customer'].includes(rawRole)) role = 'buyer';
          // Legacy profiles without a recognized role use the buyer default.
        }
      } catch (profileError) {
        // Avoid guessing a dashboard if the role lookup itself failed.
        say('You are signed in, but MuiZMarket could not read your account profile to choose the right dashboard. Please try again.', 'error');
        return;
      }
      say(`Signed in successfully. Opening your ${role} dashboard…`, 'success');
      $('#accountStatus').hidden = false;
      $('#accountStatus').textContent = 'Signed in as ' + user.email;
      $('#signOutButton').hidden = false;
      loginForm.reset();
      // Replace the URL so Back does not return to the submitted login form.
      const dashboard = role === 'seller' ? './seller.html' : './buyer.html';
      window.location.replace(new URL(dashboard, window.location.href).href);
    } catch (err) {
      say(cleanError(err), 'error');
    } finally {
      setBusy(loginForm, false);
    }
  });
  resetForm.addEventListener('submit',async e=>{e.preventDefault();say('');if(!resetForm.reportValidity())return;const email=String(new FormData(resetForm).get('email')).trim().toLowerCase();setBusy(resetForm,true);try{await auth.sendPasswordResetEmail(email);say('If an account exists for that address, a password-reset email has been sent. Check your inbox and spam folder.','success');resetForm.reset();}catch(err){say(cleanError(err),'error');}finally{setBusy(resetForm,false);}});
  $('#signOutButton').addEventListener('click',async()=>{try{await auth.signOut();$('#accountStatus').hidden=true;$('#signOutButton').hidden=true;say('You have signed out.','success');view('login');}catch(err){say(cleanError(err),'error');}});
  auth.onAuthStateChanged(user=>{if(user && user.emailVerified){$('#accountStatus').hidden=false;$('#accountStatus').textContent='Signed in as '+user.email;$('#signOutButton').hidden=false;}else{$('#accountStatus').hidden=true;$('#signOutButton').hidden=true;}});
})();