/* ═══════════════════════════════════════════════════════════
   CAMPUS PORTAL — Authentication (Firebase Auth)
   Replaces all client-side auth with Firebase signIn.
   Username → cs001@campus.local email mapping is handled here.
   First-time login forces password change via Firestore flag.
   ═══════════════════════════════════════════════════════════ */

import { auth, db } from './firebase-init.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  updatePassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ── Security Constants ──
const MAX_INPUT_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 32;
const MIN_ATTEMPT_INTERVAL_MS = 1000;
let lastAttemptTime = 0;

// ── Username → Firebase email mapping ──
// Students log in with their ID (e.g. cs001), we map to cs001@campus.local
function toEmail(username) {
  return `${username.toLowerCase()}@campus.local`;
}

// ── Input sanitization (XSS prevention) ──
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>'"&\/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, MAX_INPUT_LENGTH);
}

function isValidUsername(str) {
  return /^[a-zA-Z0-9]{2,20}$/.test(str);
}

// ── DOM References ──
const form           = document.getElementById('loginForm');
const usernameInput  = document.getElementById('usernameInput');
const passwordInput  = document.getElementById('passwordInput');
const usernameWrapper = document.getElementById('usernameWrapper');
const passwordWrapper = document.getElementById('passwordWrapper');
const togglePasswordBtn = document.getElementById('togglePassword');
const rememberMe     = document.getElementById('rememberMe');
const errorMessage   = document.getElementById('errorMessage');
const errorText      = document.getElementById('errorText');
const loginBtn       = document.getElementById('loginBtn');
const forgotLink     = document.getElementById('forgotLink');

// ── Change Password Modal (first-time login) ──
const cpModal           = document.getElementById('changePasswordModal');
const cpForm            = document.getElementById('cpForm');
const cpNewPassword     = document.getElementById('cpNewPassword');
const cpConfirmPassword = document.getElementById('cpConfirmPassword');
const cpError           = document.getElementById('cpError');
const cpErrorText       = document.getElementById('cpErrorText');
const cpSubmitBtn       = document.getElementById('cpSubmitBtn');
const cpStrengthBar     = document.getElementById('cpStrengthBar');
const cpStrengthText    = document.getElementById('cpStrengthText');

// Holds the Firebase user object while they set their new password
let pendingFirebaseUser = null;

// ══════════════════════════════════════════════════════════
// AUTO-REDIRECT — if already signed in, go to dashboard
// ══════════════════════════════════════════════════════════
// Show a brief loading overlay to prevent flash of login UI
const loadingOverlay = document.createElement('div');
loadingOverlay.id = 'authLoading';
loadingOverlay.style.cssText = `
  position:fixed; inset:0; background:var(--bg-base, #0f1117);
  display:flex; align-items:center; justify-content:center;
  z-index:9999; transition: opacity 0.3s ease;
`;
loadingOverlay.innerHTML = `<div style="width:40px;height:40px;border:3px solid rgba(255,255,255,.1);border-top-color:#4a6cf7;border-radius:50%;animation:spin 0.8s linear infinite"></div>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
document.body.appendChild(loadingOverlay);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      // Temporarily disabled for testing
      if (userDoc.exists() && false /* userDoc.data().mustChangePassword */) {
        // First-time login: show modal on top of form
        loadingOverlay.remove();
        pendingFirebaseUser = user;
        showChangePasswordModal();
        return;
      }
    } catch (e) {
      // Can't read Firestore (no rules yet / offline) — redirect anyway
    }
    window.location.href = 'dashboard.html';
  } else {
    // Not signed in — show the login form
    loadingOverlay.style.opacity = '0';
    setTimeout(() => loadingOverlay.remove(), 300);
  }
});

// ══════════════════════════════════════════════════════════
// INPUT INTERACTIONS
// ══════════════════════════════════════════════════════════

// Load remembered username
(function loadSavedCredentials() {
  try {
    const saved = localStorage.getItem('campus_portal_remember');
    if (saved) {
      const data = JSON.parse(saved);
      usernameInput.value = sanitizeInput(data.username || '');
      rememberMe.checked = true;
    }
  } catch (e) {
    localStorage.removeItem('campus_portal_remember');
  }
})();

// Toggle password visibility
togglePasswordBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordBtn.querySelector('.material-symbols-outlined').textContent =
    isPassword ? 'visibility_off' : 'visibility';
});

// Input focus rings & error clearing
[usernameInput, passwordInput].forEach(input => {
  input.setAttribute('maxlength', MAX_INPUT_LENGTH);
  input.addEventListener('focus', () => input.closest('.input-wrapper').classList.add('focused'));
  input.addEventListener('blur',  () => input.closest('.input-wrapper').classList.remove('focused'));
  input.addEventListener('input', () => {
    errorMessage.classList.remove('visible');
    usernameWrapper.classList.remove('error');
    passwordWrapper.classList.remove('error');
  });
  input.addEventListener('paste', () => {
    setTimeout(() => {
      if (input.value.length > MAX_INPUT_LENGTH) input.value = input.value.substring(0, MAX_INPUT_LENGTH);
    }, 0);
  });
});

// ── Show error with shake animation ──
function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.add('visible');
  loginBtn.classList.remove('loading');
  const card = document.querySelector('.login-card');
  card.classList.add('shake');
  setTimeout(() => card.classList.remove('shake'), 500);
}

// ══════════════════════════════════════════════════════════
// PASSWORD STRENGTH CHECKER
// ══════════════════════════════════════════════════════════

function checkPasswordStrength(password) {
  let score = 0;
  if (password.length >= 4) score++;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const levels = [
    { label: 'Too short', color: '#ef4444', width: '5%'  },
    { label: 'Weak',      color: '#ef4444', width: '20%' },
    { label: 'Fair',      color: '#f59e0b', width: '40%' },
    { label: 'Good',      color: '#f59e0b', width: '60%' },
    { label: 'Strong',    color: '#10b981', width: '80%' },
    { label: 'Excellent', color: '#10b981', width: '100%'}
  ];
  return levels[Math.min(score, levels.length - 1)];
}

// ══════════════════════════════════════════════════════════
// CHANGE PASSWORD MODAL (first-time login)
// ══════════════════════════════════════════════════════════

function showChangePasswordModal() {
  cpModal.classList.add('active');
  cpNewPassword.value = '';
  cpConfirmPassword.value = '';
  if (cpError) cpError.classList.remove('visible');
  if (cpStrengthBar) cpStrengthBar.style.width = '0%';
  if (cpStrengthText) cpStrengthText.textContent = '';
  setTimeout(() => cpNewPassword && cpNewPassword.focus(), 300);
}

function hideChangePasswordModal() {
  cpModal.classList.remove('active');
}

// Live password strength
if (cpNewPassword) {
  cpNewPassword.addEventListener('input', () => {
    const pw = cpNewPassword.value;
    if (!pw) { cpStrengthBar.style.width = '0%'; cpStrengthText.textContent = ''; return; }
    const s = checkPasswordStrength(pw);
    cpStrengthBar.style.width = s.width;
    cpStrengthBar.style.background = s.color;
    cpStrengthText.textContent = s.label;
    cpStrengthText.style.color = s.color;
  });
}

// Toggle password visibility inside modal
document.querySelectorAll('.cp-toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.querySelector('.material-symbols-outlined').textContent =
      isPassword ? 'visibility_off' : 'visibility';
  });
});

// Change password form submit
if (cpForm) {
  cpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingFirebaseUser) return;

    const newPw      = cpNewPassword.value;
    const confirmPw  = cpConfirmPassword.value;

    if (newPw.length < MIN_PASSWORD_LENGTH) {
      cpErrorText.textContent = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      cpError.classList.add('visible'); return;
    }
    if (newPw.length > MAX_PASSWORD_LENGTH) {
      cpErrorText.textContent = `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
      cpError.classList.add('visible'); return;
    }
    if (newPw !== confirmPw) {
      cpErrorText.textContent = 'Passwords do not match.';
      cpError.classList.add('visible'); return;
    }
    // Reject the default passwords
    if (newPw === 'Campus@1234' || newPw === '1234') {
      cpErrorText.textContent = 'Please choose a different password than the default.';
      cpError.classList.add('visible'); return;
    }

    cpSubmitBtn.classList.add('loading');
    try {
      // Update password in Firebase Auth
      await updatePassword(pendingFirebaseUser, newPw);
      // Clear the first-login flag in Firestore
      await updateDoc(doc(db, 'users', pendingFirebaseUser.uid), { mustChangePassword: false });

      hideChangePasswordModal();
      cpSubmitBtn.classList.remove('loading');
      cpSubmitBtn.classList.add('success');
      cpSubmitBtn.querySelector('.btn-text').textContent = 'Password Changed!';
      loginBtn.classList.add('success');
      loginBtn.querySelector('.btn-text').textContent = 'Welcome!';
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);

    } catch (err) {
      console.error('Password update error:', err);
      cpErrorText.textContent = 'Failed to update password. Please try again.';
      cpError.classList.add('visible');
      cpSubmitBtn.classList.remove('loading');
    }
  });
}

// ══════════════════════════════════════════════════════════
// LOGIN FORM SUBMIT
// ══════════════════════════════════════════════════════════

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Client-side rate limiter (Firebase also throttles server-side)
  const now = Date.now();
  if ((now - lastAttemptTime) < MIN_ATTEMPT_INTERVAL_MS) {
    showError('Please wait a moment before trying again.');
    return;
  }
  lastAttemptTime = now;

  const username = sanitizeInput(usernameInput.value).toLowerCase();
  const password = passwordInput.value.substring(0, MAX_INPUT_LENGTH);

  // Validate inputs
  if (!username) {
    usernameWrapper.classList.add('error');
    showError('Please enter your username or student ID.');
    return;
  }
  if (!isValidUsername(username)) {
    usernameWrapper.classList.add('error');
    showError('Username must be 2-20 characters, letters and numbers only.');
    return;
  }
  if (!password) {
    passwordWrapper.classList.add('error');
    showError('Please enter your password.');
    return;
  }

  loginBtn.classList.add('loading');

  // Set Firebase Auth persistence based on "Remember Me"
  try {
    await setPersistence(auth, rememberMe.checked ? browserLocalPersistence : browserSessionPersistence);
  } catch (e) { /* ignore — not critical */ }

  // Save / clear remembered username
  if (rememberMe.checked) {
    localStorage.setItem('campus_portal_remember', JSON.stringify({ username }));
  } else {
    localStorage.removeItem('campus_portal_remember');
  }

  const email = toEmail(username);

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Check first-time login flag
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      // Temporarily disabled for testing
      if (userDoc.exists() && false /* userDoc.data().mustChangePassword */) {
        pendingFirebaseUser = user;
        loginBtn.classList.remove('loading');
        showChangePasswordModal();
        return;
      }
    } catch (firestoreErr) {
      // Firestore unavailable — proceed to dashboard
      console.warn('Could not check mustChangePassword:', firestoreErr);
    }

    // Success — redirect
    loginBtn.classList.remove('loading');
    loginBtn.classList.add('success');
    loginBtn.querySelector('.btn-text').textContent = 'Welcome!';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);

  } catch (err) {
    loginBtn.classList.remove('loading');
    usernameWrapper.classList.add('error');
    passwordWrapper.classList.add('error');

    // Map Firebase error codes to user-friendly messages
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        showError('Invalid username or password.');
        break;
      case 'auth/too-many-requests':
        showError('Too many failed attempts. Account temporarily locked. Try again later.');
        break;
      case 'auth/network-request-failed':
        showError('Network error. Please check your connection.');
        break;
      case 'auth/user-disabled':
        showError('This account has been disabled. Contact your admin.');
        break;
      default:
        showError('Sign in failed. Please try again.');
        console.error('Login error:', err.code, err.message);
    }
  }
});

// ── Forgot password link ──
forgotLink.addEventListener('click', (e) => {
  e.preventDefault();
  showError('Contact your administrator to reset your password.');
});
