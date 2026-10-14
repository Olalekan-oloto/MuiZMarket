(() => {
  const $=s=>document.querySelector(s), message=$('#settingsMessage'), panel=$('#settingsPanel'), form=$('#profileForm');
  let auth,db,storage,currentUser=null,profile=null;
  const config=window.MUIZMARKET_FIREBASE_CONFIG||{};
  const ready=!!(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
  const say=(text,kind='')=>{message.textContent=text;message.className='form-message '+kind;};
  const busy=(on)=>{const b=$('#saveProfile');b.disabled=on;b.textContent=on?'Saving…':'Save changes';};
  const norm=s=>String(s||'').trim().toLowerCase();
  function friendly(err){const c=err&&err.code; if(c==='auth/unauthorized-domain')return 'Add olalekan-oloto.github.io to Firebase Authentication → Settings → Authorized domains.';if(c==='permission-denied')return 'Firestore denied this update. Confirm the latest firestore.rules have been published.';if(c==='storage/unauthorized')return 'Photo upload was blocked. Publish storage.rules and enable Firebase Storage.';if(c==='storage/bucket-not-found')return 'The Firebase Storage bucket is not configured. Enable Storage in your Firebase project and verify storageBucket in firebase-config.js.';if(c==='USERNAME_TAKEN')return 'That username is already in use. Choose another one.';return err&&err.message?err.message:'Could not save. Check your connection and Firebase settings.';}
  if(!ready||!window.firebase){say('Firebase is not configured. Add the correct web app values to firebase-config.js first.','error');return;}
  try{if(!firebase.apps.length)firebase.initializeApp(config);auth=firebase.auth();db=firebase.firestore();storage=firebase.storage();}catch(e){say('Firebase setup error: '+e.message,'error');return;}
  function fill(p,user){form.elements.fullName.value=p.fullName||user.displayName||'';form.elements.username.value=p.username||'';form.elements.email.value=user.email||p.email||'';form.elements.country.value=p.country||'';form.elements.phone.value=p.phone||'';form.elements.dob.value=p.dob||'';if(p.profilePhotoURL)$('#profilePreview').src=p.profilePhotoURL;else if(user.photoURL)$('#profilePreview').src=user.photoURL;}
  auth.onAuthStateChanged(async user=>{
    if(!user){window.location.replace(new URL('./account.html',location.href).href);return;}
    currentUser=user;
    try{const snap=await db.collection('users').doc(user.uid).get();profile=snap.exists?snap.data():{uid:user.uid,fullName:user.displayName||'',username:'',email:user.email||'',country:'',phone:'',dob:'',profilePhotoURL:user.photoURL||''};fill(profile,user);panel.hidden=false;say('You are signed in. Complete your profile and save your changes.','success');}
    catch(err){say(friendly(err),'error');}
  });
  $('#profilePhoto').addEventListener('change',async e=>{
    const file=e.target.files&&e.target.files[0];if(!file||!currentUser)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){say('Choose a JPG, PNG or WebP image.','error');e.target.value='';return;}
    if(file.size>5*1024*1024){say('That image is larger than 5 MB. Choose a smaller picture.','error');e.target.value='';return;}
    try{
      say('Uploading profile picture…');
      const ref=storage.ref(`users/${currentUser.uid}/profilePicture`);
      await ref.put(file,{contentType:file.type});
      const url=await ref.getDownloadURL();
      await db.collection('users').doc(currentUser.uid).set({profilePhotoURL:url,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      await currentUser.updateProfile({photoURL:url});
      $('#profilePreview').src=url; if(profile)profile.profilePhotoURL=url;say('Profile picture updated.','success');
    }catch(err){say(friendly(err),'error');}
  });
  form.addEventListener('submit',async e=>{
    e.preventDefault();say('');if(!form.reportValidity())return;
    const fullName=form.elements.fullName.value.trim(), username=form.elements.username.value.trim(), key=norm(username), country=form.elements.country.value, phone=form.elements.phone.value.trim(), dob=form.elements.dob.value;
    if(!/^[A-Za-z0-9_]{3,24}$/.test(username)){say('Username must be 3–24 letters, numbers, or underscores.','error');return;}
    if(!/^\+[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g,''))){say('Enter the phone number with country code, for example +2348012345678.','error');return;}
    if(!dob||new Date(dob+'T00:00:00')>=new Date()){say('Enter a valid date of birth in the past.','error');return;}
    busy(true);
    try{
      const ref=db.collection('users').doc(currentUser.uid), oldKey=norm(profile&&profile.usernameKey||profile&&profile.username||'');
      await db.runTransaction(async tx=>{
        const usernameRef=db.collection('usernames').doc(key);
        const newSnap=await tx.get(usernameRef);
        if(newSnap.exists&&newSnap.data().uid!==currentUser.uid)throw new Error('USERNAME_TAKEN');
        if(oldKey&&oldKey!==key){const oldRef=db.collection('usernames').doc(oldKey);const oldSnap=await tx.get(oldRef);if(oldSnap.exists&&oldSnap.data().uid===currentUser.uid)tx.delete(oldRef);}
        tx.set(usernameRef,{uid:currentUser.uid});
        tx.set(ref,{uid:currentUser.uid,fullName,username,usernameKey:key,email:currentUser.email||'',country,phone,dob,profilePhotoURL:(profile&&profile.profilePhotoURL)||currentUser.photoURL||'',updatedAt:firebase.firestore.FieldValue.serverTimestamp(),createdAt:(profile&&profile.createdAt)||firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      });
      await currentUser.updateProfile({displayName:fullName});
      const snap=await ref.get();profile=snap.data();fill(profile,currentUser);say('Your MuiZMarket profile has been saved.','success');
    }catch(err){say(friendly(err),'error');}finally{busy(false);}
  });
  $('#settingsSignOut').addEventListener('click',async()=>{try{await auth.signOut();window.location.replace(new URL('./account.html',location.href).href);}catch(err){say(friendly(err),'error');}});
})();
