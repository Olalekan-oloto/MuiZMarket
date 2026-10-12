(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const registerForm = $('#registerForm');
  const loginForm = $('#loginForm');
  const resetForm = $('#resetForm');
  const title = $('#formTitle');
  const subtitle = $('#formSubtitle');
  const message = $('#accountMessage');
  const tabs = [...document.querySelectorAll('[data-view]')];

  const say = (text, type = '') => {
    if (!message) return;
    message.textContent = text;
    message.className = `form-message ${type}`;
  };

  const setBusy = (form, busy) => {
    const button = form && form.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.original) button.dataset.original = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? 'Please wait…' : button.dataset.original;
  };

  function view(which) {
    if (registerForm) registerForm.hidden = which !== 'register';
    if (loginForm) loginForm.hidden = which !== 'login';
    if (resetForm) resetForm.hidden = which !== 'reset';
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === which));
    if (title) title.textContent =
      which === 'register' ? 'Create your account' :
      which === 'login' ? 'Sign in' : 'Reset your password';
    if (subtitle) subtitle.textContent =
      which === 'register' ? 'Join the marketplace to manage your digital purchases.' :
      which === 'login' ? 'Welcome back. Sign in to your MuiZMarket account.' :
      'We will email you a secure password-reset link.';
    say('');
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => view(tab.dataset.view)));
  $('#forgotLink')?.addEventListener('click', () => view('reset'));
  $('#backToLogin')?.addEventListener('click', () => view('login'));

  if (!registerForm || !loginForm || !resetForm || !message) {
    console.error('MuiZMarket auth.js: missing required HTML elements. Check the IDs for the forms and #accountMessage.');
    return;
  }

  const config = window.MUIZMARKET_FIREBASE_CONFIG;
  const configReady = !!(
    config &&
    typeof config.apiKey === 'string' && config.apiKey.trim() &&
    typeof config.projectId === 'string' && config.projectId.trim() &&
    typeof config.appId === 'string' && config.appId.trim() &&
    !config.apiKey.includes('PASTE_') &&
    !config.projectId.includes('YOUR_') &&
    !config.appId.includes('YOUR_')
  );

  if (!window.firebase || !configReady) {
    const notice = $('#setupNotice');
    if (notice) notice.hidden = false;
    say(
      !window.firebase
        ? 'Firebase SDK did not load. Check that the Firebase app, auth, and Firestore SDK scripts load before auth.js.'
        : 'Firebase configuration is missing or incomplete. Set window.MUIZMARKET_FIREBASE_CONFIG before auth.js.',
      'error'
    );
    document.querySelectorAll('form button[type="submit"]').forEach((button) => { button.disabled = true; });
    return;
  }

  let auth;
  let db;
  try {
    if (!firebase.apps.length) firebase.initializeApp(config);
    auth = firebase.auth();
    if (typeof firebase.firestore !== 'function') {
      throw new Error('Firestore SDK is not loaded.');
    }
    db = firebase.firestore();
    auth.useDeviceLanguage();
  } catch (error) {
    const notice = $('#setupNotice');
    if (notice) notice.hidden = false;
    say(`Firebase initialization failed: ${error.message || 'Check the SDK and configuration.'}`, 'error');
    console.error('MuiZMarket Firebase initialization error:', error);
    return;
  }

  function cleanError(error) {
    const code = error && error.code ? String(error.code) : '';
    const known = {
      'auth/email-already-in-use': 'An account already uses this email. Try signing in instead.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/weak-password': 'Choose a stronger password with at least 12 characters.',
      'auth/user-not-found': 'No matching account was found. Check the email or request a password reset.',
      'auth/wrong-password': 'Email or password is incorrect.',
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/too-many-requests': 'Too many attempts. Wait a while before trying again.',
      'auth/network-request-failed': 'Firebase could not reach the server. Check your internet connection.',
      'auth/operation-not-allowed': 'Email/Password sign-in is disabled in the Firebase project used by this website.',
      'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication settings.',
      'auth/invalid-api-key': 'The Firebase API key in the website configuration is invalid.',
      'auth/app-not-authorized': 'This website app is not authorized for the Firebase project.',
      'permission-denied': 'Firestore denied access. Check the security rules for the usernames and users collections.',
      'unavailable': 'Firestore is temporarily unavailable. Check your connection and try again.',
      'failed-precondition': 'Firestore needs setup or an index. Check the error details in the browser console.'
    };
    if (code && known[code]) return `${known[code]} (${code})`;
    // Include Firebase's error code so the real cause is not hidden by a generic message.
    if (code) return `Request failed (${code}). ${error && error.message ? error.message : 'Check Firebase settings and browser console.'}`;
    return error && error.message
      ? `Request failed: ${error.message}`
      : 'Request failed for an unknown reason. Check the browser console and Firebase setup.';
  }

  const normalUsername = (value) => value.trim().toLowerCase();

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    say('');
    if (!registerForm.reportValidity()) return;

    const data = new FormData(registerForm);
    const fullName = String(data.get('fullName') || '').trim();
    const username = String(data.get('username') || '').trim();
    const usernameKey = normalUsername(username);
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const country = String(data.get('country') || '');
    const phone = String(data.get('phone') || '').trim().replace(/[\s()-]/g, '');
    const dob = String(data.get('dob') || '');

    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
      say('Username must be 3–24 letters, numbers, or underscores.', 'error');
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      say('Enter your phone number with country code, such as +2348012345678.', 'error');
      return;
    }
    if (!dob || Number.isNaN(Date.parse(dob)) || new Date(`${dob}T00:00:00`) >= new Date()) {
      say('Enter a valid date of birth in the past.', 'error');
      return;
    }
    if (password.length < 12) {
      say('Use a password with at least 12 characters.', 'error');
      return;
    }

    setBusy(registerForm, true);
    let user = null;
    let profileSaved = false;

    try {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      user = credential.user;

      // Claim the username and create the profile. Firestore security rules must allow
      // the signed-in user to create these documents safely.
      await db.runTransaction(async (transaction) => {
        const usernameRef = db.collection('usernames').doc(usernameKey);
        const profileRef = db.collection('users').doc(user.uid);
        const existing = await transaction.get(usernameRef);
        if (existing.exists) {
          const duplicate = new Error('That username is already taken. Choose another one.');
          duplicate.code = 'app/username-taken';
          throw duplicate;
        }
        transaction.set(usernameRef, { uid: user.uid });
        transaction.set(profileRef, {
          uid: user.uid,
          fullName,
          username,
          usernameKey,
          email,
          country,
          phone,
          dob,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      profileSaved = true;

      // Send verification after the profile transaction succeeds. If email delivery
      // fails, keep the account so the user can sign in and request verification again.
      try {
        await user.sendEmailVerification({
          url: window.location.origin + window.location.pathname,
          handleCodeInApp: false
        });
        registerForm.reset();
        view('login');
        say('Account created. Check your email for a verification link before signing in.', 'success');
      } catch (emailError) {
        console.error('MuiZMarket verification email error:', emailError);
        say(`Your account was created, but the verification email could not be sent. ${cleanError(emailError)} You can sign in after verification; ask the site administrator to check Firebase email settings.`, 'error');
      }
    } catch (error) {
      if (error && error.code === 'app/username-taken') {
        say(error.message, 'error');
      } else {
        say(cleanError(error), 'error');
      }
      console.error('MuiZMarket registration error:', error);

      // Do not silently delete the Firebase user here. If Firestore failed, deleting
      // can also fail and leave an unclear account state. The visible error now tells
      // the administrator which Firebase permission/configuration needs fixing.
      if (user && !profileSaved) {
        console.warn('A Firebase Auth account may have been created, but its Firestore profile was not saved. Check Firebase Console before retrying with the same email.');
      }
    } finally {
      setBusy(registerForm, false);
    }
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    say('');
    if (!loginForm.reportValidity()) return;

    const data = new FormData(loginForm);
    const email = String(data.get('email') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    setBusy(loginForm, true);

    try {
      const result = await auth.signInWithEmailAndPassword(email, password);
      if (!result.user.emailVerified) {
        await auth.signOut();
        say('Please verify your email using the link sent to you before signing in. Check your inbox and spam folder.', 'error');
        return;
      }
      say('Signed in successfully. Opening MuiZMarket...', 'success');

setTimeout(() => {
  window.location.href = 'menu.html';
}, 1000);
      const status = $('#accountStatus');
      const signOutButton = $('#signOutButton');
      if (status) {
        status.hidden = false;
        status.textContent = `Signed in as ${result.user.email}`;
      }
      if (signOutButton) signOutButton.hidden = false;
      loginForm.reset();
    } catch (error) {
      say(cleanError(error), 'error');
      console.error('MuiZMarket sign-in error:', error);
    } finally {
      setBusy(loginForm, false);
    }
  });

  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    say('');
    if (!resetForm.reportValidity()) return;

    const email = String(new FormData(resetForm).get('email') || '').trim().toLowerCase();
    setBusy(resetForm, true);
    try {
      await auth.sendPasswordResetEmail(email);
      say('If an account exists for that address, a password-reset email has been sent. Check your inbox and spam folder.', 'success');
      resetForm.reset();
    } catch (error) {
      say(cleanError(error), 'error');
      console.error('MuiZMarket password reset error:', error);
    } finally {
      setBusy(resetForm, false);
    }
  });

  $('#signOutButton')?.addEventListener('click', async () => {
    try {
      await auth.signOut();
      const status = $('#accountStatus');
      const signOutButton = $('#signOutButton');
      if (status) status.hidden = true;
      if (signOutButton) signOutButton.hidden = true;
      view('login');
      say('You have signed out.', 'success');
    } catch (error) {
      say(cleanError(error), 'error');
      console.error('MuiZMarket sign-out error:', error);
    }
  });

  auth.onAuthStateChanged((user) => {
    const status = $('#accountStatus');
    const signOutButton = $('#signOutButton');
    if (user && user.emailVerified) {
      if (status) {
        status.hidden = false;
        status.textContent = `Signed in as ${user.email}`;
      }
      if (signOutButton) signOutButton.hidden = false;
    } else {
      if (status) status.hidden = true;
      if (signOutButton) signOutButton.hidden = true;
    }
  });
})();
