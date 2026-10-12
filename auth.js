(() => {
  const $ = (s) => document.querySelector(s);
  const registerForm = $('#registerForm');
  const loginForm = $('#loginForm');
  const resetForm = $('#resetForm');
  const title = $('#formTitle');
  const subtitle = $('#formSubtitle');
  const message = $('#accountMessage');
  const tabs = [...document.querySelectorAll('[data-view]')];

  let auth = null;
  let db = null;
  const config = window.MUIZMARKET_FIREBASE_CONFIG;
  const configReady = config &&
    config.apiKey && !config.apiKey.includes('PASTE_') &&
    config.projectId && !config.projectId.includes('YOUR_') &&
    config.appId && !config.appId.includes('YOUR_');

  const say = (text, type = '') => {
    if (!message) return;
    message.textContent = text;
    message.className = `form-message ${type}`;
  };

  const setBusy = (form, busy) => {
    const button = form.querySelector('button[type="submit"]');
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
    console.error('MuiZMarket auth.js: required form elements are missing from the page.');
    return;
  }

  if (!configReady || !window.firebase) {
    const notice = $('#setupNotice');
    if (notice) notice.hidden = false;
    say('Firebase setup is incomplete. Add your Firebase configuration and load the Firebase SDK before testing account creation.', 'error');
    document.querySelectorAll('form button[type="submit"]').forEach((button) => {
      button.disabled = true;
    });
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(config);
    auth = firebase.auth();
    db = firebase.firestore();
    auth.useDeviceLanguage();
  } catch (err) {
    const notice = $('#setupNotice');
    if (notice) notice.hidden = false;
    say('Firebase setup error. Check your Firebase SDK and configuration.', 'error');
    console.error(err);
    return;
  }

  function cleanError(err) {
    const code = err && err.code;
    const messages = {
      'auth/email-already-in-use': 'An account already uses this email. Try signing in instead.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/weak-password': 'Choose a stronger password with at least 12 characters.',
      'auth/user-not-found': 'If that email has an account, you can request a password-reset email.',
      'auth/wrong-password': 'Email or password is incorrect.',
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/too-many-requests': 'Too many attempts. Wait a while before trying again.',
      'auth/network-request-failed': 'Network error. Check your connection and try again.',
      'permission-denied': 'The database rejected this action. Check your Firestore security rules.'
    };
    return messages[code] || 'Could not complete this request. Check your connection and Firebase setup, then try again.';
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
    let credential = null;

    try {
      credential = await auth.createUserWithEmailAndPassword(email, password);
      const user = credential.user;
      const usernameRef = db.collection('usernames').doc(usernameKey);
      const profileRef = db.collection('users').doc(user.uid);

      await user.sendEmailVerification({
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: false
      });

      await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(usernameRef);
        if (existing.exists) throw new Error('USERNAME_TAKEN');
        transaction.set(usernameRef, { uid: user.uid });
        transaction.set(profileRef, {
          uid: user.uid, fullName, username, usernameKey, email, country, phone, dob,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      registerForm.reset();
      view('login');
      say('Account created. Check your email for a verification link before signing in.', 'success');
    } catch (err) {
      if (credential && credential.user) {
        try { await credential.user.delete(); } catch (_) {}
      }
      say(err.message === 'USERNAME_TAKEN'
        ? 'That username is already taken. Choose another one.'
        : cleanError(err), 'error');
      console.error('MuiZMarket registration error:', err);
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
        say('Verify your email using the link we sent before signing in. Check your inbox and spam folder.', 'error');
        return;
      }
      say('Signed in successfully. Your account is ready.', 'success');
      const status = $('#accountStatus');
      const signOutButton = $('#signOutButton');
      if (status) {
        status.hidden = false;
        status.textContent = `Signed in as ${result.user.email}`;
      }
      if (signOutButton) signOutButton.hidden = false;
      loginForm.reset();
    } catch (err) {
      say(cleanError(err), 'error');
      console.error('MuiZMarket sign-in error:', err);
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
    } catch (err) {
      say(cleanError(err), 'error');
      console.error('MuiZMarket password reset error:', err);
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
    } catch (err) {
      say(cleanError(err), 'error');
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
