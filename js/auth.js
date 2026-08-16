/* ═══════════════════════════════════════════════════════════
   CAMPUS PORTAL — Authentication System (Secured)
   545 student accounts across 5 departments
   Default password for ALL accounts: 1234
   First-time login forces password change
   
   Security measures:
   ─ Input sanitization (XSS prevention)
   ─ Brute-force protection (account lockout after 5 attempts)
   ─ Rate limiting (1 attempt per second)
   ─ Password hashing (SHA-256)
   ─ Session expiry (auto-logout after 30 min inactivity)
   ─ Session integrity validation
   ─ Input length & format validation
   ─ No eval/innerHTML — textContent only
   ─ First-time password change enforcement
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Security Constants ──
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 30 * 1000;
  const MIN_ATTEMPT_INTERVAL_MS = 1000;
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  const MAX_INPUT_LENGTH = 64;
  const MIN_PASSWORD_LENGTH = 4;
  const MAX_PASSWORD_LENGTH = 32;

  // ── Default password hash (SHA-256 of '1234') ──
  const DEFAULT_PASSWORD_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

  // ══════════════════════════════════════════════════════════
  // SECURITY UTILITIES
  // ══════════════════════════════════════════════════════════

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

  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Custom password storage (localStorage, keyed per user) ──
  function getStoredPasswordHash(username) {
    try {
      const store = JSON.parse(localStorage.getItem('campus_portal_passwords') || '{}');
      return store[username] || null;
    } catch (e) {
      return null;
    }
  }

  function setStoredPasswordHash(username, hash) {
    try {
      const store = JSON.parse(localStorage.getItem('campus_portal_passwords') || '{}');
      store[username] = hash;
      localStorage.setItem('campus_portal_passwords', JSON.stringify(store));
    } catch (e) { /* ignore */ }
  }

  function hasCustomPassword(username) {
    return getStoredPasswordHash(username) !== null;
  }

  // ── Rate limiter / brute-force tracker ──
  const loginTracker = {
    attempts: 0,
    lastAttemptTime: 0,
    lockedUntil: 0,

    load() {
      try {
        const saved = sessionStorage.getItem('campus_portal_lockout');
        if (saved) {
          const data = JSON.parse(saved);
          this.attempts = data.attempts || 0;
          this.lastAttemptTime = data.lastAttemptTime || 0;
          this.lockedUntil = data.lockedUntil || 0;
        }
      } catch (e) { /* ignore */ }
    },

    save() {
      try {
        sessionStorage.setItem('campus_portal_lockout', JSON.stringify({
          attempts: this.attempts,
          lastAttemptTime: this.lastAttemptTime,
          lockedUntil: this.lockedUntil
        }));
      } catch (e) { /* ignore */ }
    },

    isLocked() {
      if (Date.now() < this.lockedUntil) return true;
      if (this.lockedUntil > 0 && Date.now() >= this.lockedUntil) {
        this.attempts = 0;
        this.lockedUntil = 0;
        this.save();
      }
      return false;
    },

    getRemainingLockout() {
      return Math.ceil((this.lockedUntil - Date.now()) / 1000);
    },

    isTooFast() {
      return (Date.now() - this.lastAttemptTime) < MIN_ATTEMPT_INTERVAL_MS;
    },

    recordFailure() {
      this.attempts++;
      this.lastAttemptTime = Date.now();
      if (this.attempts >= MAX_LOGIN_ATTEMPTS) {
        this.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      }
      this.save();
    },

    reset() {
      this.attempts = 0;
      this.lastAttemptTime = 0;
      this.lockedUntil = 0;
      this.save();
    }
  };

  loginTracker.load();

  // ══════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ══════════════════════════════════════════════════════════

  function createSession(studentData) {
    const session = {
      id: studentData.id,
      name: studentData.name,
      initials: getInitials(studentData.name),
      dept: studentData.dept,
      deptName: studentData.deptName,
      role: studentData.role || 'student',
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TIMEOUT_MS,
      checksum: null
    };
    session.checksum = generateChecksum(session);
    return session;
  }

  function generateChecksum(session) {
    const raw = `${session.id}|${session.name}|${session.dept}|${session.role}|${session.createdAt}|${session.expiresAt}|campus_portal_v1`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  function validateSession(session) {
    if (!session || typeof session !== 'object') return false;
    if (!session.id || !session.name || !session.dept || !session.expiresAt) return false;
    if (Date.now() > session.expiresAt) return false;
    if (session.checksum !== generateChecksum(session)) return false;
    return true;
  }

  function getInitials(name) {
    const parts = String(name).trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return String(name).substring(0, 2).toUpperCase();
  }

  // ══════════════════════════════════════════════════════════
  // STUDENT DATA
  // ══════════════════════════════════════════════════════════

  function generateDeptStudents(prefix, deptId, deptName, count) {
    const students = [];
    for (let i = 1; i <= count; i++) {
      const num = String(i).padStart(3, '0');
      students.push({
        id: `${prefix}${num}`,
        username: `${prefix.toLowerCase()}${num}`,
        name: `Student ${prefix}${num}`,
        dept: deptId,
        deptName: deptName
      });
    }
    return students;
  }

  const STUDENT_LIST = [
    { id: 'ADMIN001', username: 'admin', name: 'System Administrator', dept: 'admin', deptName: 'Administration', role: 'admin' },
    ...generateDeptStudents('CS',  'cs',    'Computer Science',       120),
    ...generateDeptStudents('ME',  'mech',  'Mechanical Engineering', 110),
    ...generateDeptStudents('EE',  'eee',   'Electrical Engineering', 105),
    ...generateDeptStudents('CE',  'civil', 'Civil Engineering',      100),
    ...generateDeptStudents('EC',  'ece',   'Electronics & Comm.',    110)
  ];

  const ALL_STUDENTS = {};
  STUDENT_LIST.forEach(s => { ALL_STUDENTS[s.username] = s; });

  // ══════════════════════════════════════════════════════════
  // UI — LOGIN FORM
  // ══════════════════════════════════════════════════════════

  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('usernameInput');
  const passwordInput = document.getElementById('passwordInput');
  const usernameWrapper = document.getElementById('usernameWrapper');
  const passwordWrapper = document.getElementById('passwordWrapper');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const rememberMe = document.getElementById('rememberMe');
  const errorMessage = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
  const loginBtn = document.getElementById('loginBtn');
  const forgotLink = document.getElementById('forgotLink');

  // ── Change Password Modal DOM ──
  const cpModal = document.getElementById('changePasswordModal');
  const cpOverlay = document.getElementById('cpOverlay');
  const cpForm = document.getElementById('cpForm');
  const cpNewPassword = document.getElementById('cpNewPassword');
  const cpConfirmPassword = document.getElementById('cpConfirmPassword');
  const cpError = document.getElementById('cpError');
  const cpErrorText = document.getElementById('cpErrorText');
  const cpSubmitBtn = document.getElementById('cpSubmitBtn');
  const cpStrengthBar = document.getElementById('cpStrengthBar');
  const cpStrengthText = document.getElementById('cpStrengthText');

  // Track current login user for password change
  let pendingLoginUser = null;
  let pendingLoginUsername = null;

  // ── Toggle password visibility ──
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePasswordBtn.querySelector('.material-symbols-outlined').textContent =
      isPassword ? 'visibility_off' : 'visibility';
  });

  // ── Input focus & error clearing ──
  [usernameInput, passwordInput].forEach(input => {
    input.setAttribute('maxlength', MAX_INPUT_LENGTH);
    input.addEventListener('focus', () => input.closest('.input-wrapper').classList.add('focused'));
    input.addEventListener('blur', () => input.closest('.input-wrapper').classList.remove('focused'));
    input.addEventListener('input', () => {
      errorMessage.classList.remove('visible');
      usernameWrapper.classList.remove('error');
      passwordWrapper.classList.remove('error');
    });
    input.addEventListener('paste', (e) => {
      setTimeout(() => {
        if (input.value.length > MAX_INPUT_LENGTH) input.value = input.value.substring(0, MAX_INPUT_LENGTH);
      }, 0);
    });
  });

  // ── Load remembered username ──
  function loadSavedCredentials() {
    const saved = localStorage.getItem('campus_portal_remember');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        usernameInput.value = sanitizeInput(data.username || '');
        rememberMe.checked = true;
      } catch (e) {
        localStorage.removeItem('campus_portal_remember');
      }
    }
  }
  loadSavedCredentials();

  // ── Show login error ──
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
      { label: 'Too short', color: '#ef4444', width: '5%' },
      { label: 'Weak', color: '#ef4444', width: '20%' },
      { label: 'Fair', color: '#f59e0b', width: '40%' },
      { label: 'Good', color: '#f59e0b', width: '60%' },
      { label: 'Strong', color: '#10b981', width: '80%' },
      { label: 'Excellent', color: '#10b981', width: '100%' }
    ];

    return levels[Math.min(score, levels.length - 1)];
  }

  // ══════════════════════════════════════════════════════════
  // CHANGE PASSWORD MODAL LOGIC
  // ══════════════════════════════════════════════════════════

  function showChangePasswordModal() {
    cpModal.classList.add('active');
    cpNewPassword.value = '';
    cpConfirmPassword.value = '';
    cpError.classList.remove('visible');
    cpStrengthBar.style.width = '0%';
    cpStrengthText.textContent = '';
    setTimeout(() => cpNewPassword.focus(), 300);
  }

  function hideChangePasswordModal() {
    cpModal.classList.remove('active');
  }

  // ── Password strength live indicator ──
  if (cpNewPassword) {
    cpNewPassword.addEventListener('input', () => {
      const pw = cpNewPassword.value;
      if (pw.length === 0) {
        cpStrengthBar.style.width = '0%';
        cpStrengthText.textContent = '';
        return;
      }
      const strength = checkPasswordStrength(pw);
      cpStrengthBar.style.width = strength.width;
      cpStrengthBar.style.background = strength.color;
      cpStrengthText.textContent = strength.label;
      cpStrengthText.style.color = strength.color;
    });
  }

  // ── Toggle password visibility in modal ──
  document.querySelectorAll('.cp-toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.querySelector('.material-symbols-outlined').textContent =
        isPassword ? 'visibility_off' : 'visibility';
    });
  });

  // ── Change password form submit ──
  if (cpForm) {
    cpForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newPw = cpNewPassword.value;
      const confirmPw = cpConfirmPassword.value;

      // Validate
      if (newPw.length < MIN_PASSWORD_LENGTH) {
        cpErrorText.textContent = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
        cpError.classList.add('visible');
        return;
      }

      if (newPw.length > MAX_PASSWORD_LENGTH) {
        cpErrorText.textContent = `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
        cpError.classList.add('visible');
        return;
      }

      if (newPw !== confirmPw) {
        cpErrorText.textContent = 'Passwords do not match.';
        cpError.classList.add('visible');
        return;
      }

      // Check it's not the same as default
      let newHash;
      try {
        newHash = await sha256(newPw);
      } catch (err) {
        newHash = null;
      }

      if (newHash === DEFAULT_PASSWORD_HASH) {
        cpErrorText.textContent = 'Please choose a different password than the default.';
        cpError.classList.add('visible');
        return;
      }

      // Save the new password hash
      if (newHash && pendingLoginUsername) {
        setStoredPasswordHash(pendingLoginUsername, newHash);
      }

      // Hide modal and proceed to dashboard
      hideChangePasswordModal();
      cpSubmitBtn.classList.add('success');
      cpSubmitBtn.querySelector('.btn-text').textContent = 'Password Changed!';

      // Create session and redirect
      const session = createSession(pendingLoginUser);
      sessionStorage.setItem('campus_portal_user', JSON.stringify(session));

      if (rememberMe.checked) {
        localStorage.setItem('campus_portal_remember', JSON.stringify({ username: pendingLoginUsername }));
      } else {
        localStorage.removeItem('campus_portal_remember');
      }

      loginBtn.classList.remove('loading');
      loginBtn.classList.add('success');
      loginBtn.querySelector('.btn-text').textContent = 'Welcome!';

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 800);
    });
  }

  // ── Close modal on overlay click (only if not first-time) ──
  if (cpOverlay) {
    cpOverlay.addEventListener('click', () => {
      // Don't allow closing if it's a forced password change
      // They must set a new password
    });
  }

  // ══════════════════════════════════════════════════════════
  // LOGIN FORM SUBMIT
  // ══════════════════════════════════════════════════════════

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (loginTracker.isLocked()) {
      showError(`Too many failed attempts. Try again in ${loginTracker.getRemainingLockout()} seconds.`);
      return;
    }

    if (loginTracker.isTooFast()) {
      showError('Please wait a moment before trying again.');
      return;
    }

    const username = sanitizeInput(usernameInput.value).toLowerCase();
    const password = passwordInput.value.substring(0, MAX_INPUT_LENGTH);

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

    // Hash the entered password
    let enteredHash;
    try {
      enteredHash = await sha256(password);
    } catch (err) {
      enteredHash = null;
    }

    setTimeout(async () => {
      const student = ALL_STUDENTS[username];

      if (!student) {
        loginTracker.recordFailure();
        usernameWrapper.classList.add('error');
        const remaining = MAX_LOGIN_ATTEMPTS - loginTracker.attempts;
        showError(remaining > 0
          ? `Student ID not found. ${remaining} attempt(s) remaining.`
          : `Account locked for ${LOCKOUT_DURATION_MS / 1000} seconds.`
        );
        loginBtn.classList.remove('loading');
        return;
      }

      // ── Check password ──
      // First check if user has a custom password
      const customHash = getStoredPasswordHash(username);
      let passwordMatch = false;

      if (customHash) {
        // User has changed their password — compare against custom hash
        passwordMatch = enteredHash ? (enteredHash === customHash) : false;
      } else {
        // Still using default password
        passwordMatch = enteredHash
          ? (enteredHash === DEFAULT_PASSWORD_HASH)
          : (password === '1234');
      }

      if (!passwordMatch) {
        loginTracker.recordFailure();
        passwordWrapper.classList.add('error');
        const remaining = MAX_LOGIN_ATTEMPTS - loginTracker.attempts;
        showError(remaining > 0
          ? `Incorrect password. ${remaining} attempt(s) remaining.`
          : `Account locked for ${LOCKOUT_DURATION_MS / 1000} seconds.`
        );
        loginBtn.classList.remove('loading');
        return;
      }

      // ── Login success ──
      loginTracker.reset();

      // ── First-time login: force password change ──
      if (!customHash) {
        pendingLoginUser = student;
        pendingLoginUsername = username;
        loginBtn.classList.remove('loading');
        showChangePasswordModal();
        return;
      }

      // ── Returning user: proceed to dashboard ──
      const session = createSession(student);
      sessionStorage.setItem('campus_portal_user', JSON.stringify(session));

      if (rememberMe.checked) {
        localStorage.setItem('campus_portal_remember', JSON.stringify({ username: username }));
      } else {
        localStorage.removeItem('campus_portal_remember');
      }

      loginBtn.classList.remove('loading');
      loginBtn.classList.add('success');
      loginBtn.querySelector('.btn-text').textContent = 'Welcome!';

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 600);

    }, 800);
  });

  // ── Forgot password ──
  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    showError('Default password: 1234. Contact admin to reset your custom password.');
  });

  // ── Auto-redirect if already logged in ──
  try {
    const raw = sessionStorage.getItem('campus_portal_user');
    if (raw) {
      const session = JSON.parse(raw);
      if (validateSession(session)) {
        window.location.href = 'dashboard.html';
      } else {
        sessionStorage.removeItem('campus_portal_user');
      }
    }
  } catch (e) {
    sessionStorage.removeItem('campus_portal_user');
  }

})();
