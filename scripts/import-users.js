#!/usr/bin/env node
/**
 * Campus Portal — Bulk User Import Script
 * =========================================
 * Creates all 545 student accounts in Firebase Auth and their
 * corresponding Firestore user profile documents.
 *
 * Run once after setting up Firebase Auth:
 *   node scripts/import-users.js
 *
 * Prerequisites:
 *   npm install firebase-admin
 *   Set GOOGLE_APPLICATION_CREDENTIALS env var to your service account JSON
 *   OR place serviceAccountKey.json in this scripts/ directory
 *
 * Get service account key:
 *   Firebase Console → Project Settings → Service Accounts → Generate new private key
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (e) {
  console.error('ERROR: serviceAccountKey.json not found in scripts/ directory.');
  console.error('Download it from: Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

// ── Initialize Admin SDK ──
initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth();
const db   = getFirestore();


// ── Student data — mirrors auth.js original structure ──
const DEFAULT_PASSWORD = 'Campus@1234';

function generateDeptStudents(prefix, deptId, deptName, count) {
  return Array.from({ length: count }, (_, i) => {
    const num = String(i + 1).padStart(3, '0');
    return {
      id:       `${prefix}${num}`,
      username: `${prefix.toLowerCase()}${num}`,
      name:     `Student ${prefix}${num}`,
      dept:     deptId,
      deptName: deptName,
      role:     'student'
    };
  });
}

const USERS = [
  { id: 'ADMIN001', username: 'admin', name: 'System Administrator', dept: 'admin', deptName: 'Administration', role: 'admin' },
  ...generateDeptStudents('CS',  'cs',    'Computer Science',       120),
  ...generateDeptStudents('ME',  'mech',  'Mechanical Engineering', 110),
  ...generateDeptStudents('EE',  'eee',   'Electrical Engineering', 105),
  ...generateDeptStudents('CE',  'civil', 'Civil Engineering',      100),
  ...generateDeptStudents('EC',  'ece',   'Electronics & Comm.',    110)
];

// ── Helper: username → Firebase email ──
function toEmail(username) {
  return `${username.toLowerCase()}@campus.local`;
}

// ── Import a single user ──
async function importUser(userData) {
  const email = toEmail(userData.username);
  try {
    // Create Firebase Auth user
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email,
        password:    DEFAULT_PASSWORD,
        displayName: userData.name,
        disabled:    false
      });
    } catch (authErr) {
      if (authErr.code === 'auth/email-already-exists') {
        // Already exists — fetch it
        userRecord = await auth.getUserByEmail(email);
        console.log(`  ⚠  Already exists: ${email}`);
      } else {
        throw authErr;
      }
    }

    // Create Firestore user profile
    await db.collection('users').doc(userRecord.uid).set({
      uid:               userRecord.uid,
      username:          userData.username,
      name:              userData.name,
      dept:              userData.dept,
      deptName:          userData.deptName,
      role:              userData.role,
      mustChangePassword: true,   // Force password change on first login
      createdAt:         FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, email };
  } catch (err) {
    return { success: false, email, error: err.message };
  }
}

// ── Main import loop ──
async function main() {
  console.log(`\n🚀 Campus Portal — Bulk User Import`);
  console.log(`   Importing ${USERS.length} users with password: ${DEFAULT_PASSWORD}\n`);

  let success = 0, failed = 0;
  const BATCH_SIZE = 10; // Process in batches to avoid rate limits

  for (let i = 0; i < USERS.length; i += BATCH_SIZE) {
    const batch = USERS.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(importUser));

    results.forEach(r => {
      if (r.success) {
        console.log(`  ✓  ${r.email}`);
        success++;
      } else {
        console.log(`  ✗  ${r.email} — ${r.error}`);
        failed++;
      }
    });

    // Small delay between batches
    if (i + BATCH_SIZE < USERS.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n✅ Import complete: ${success} succeeded, ${failed} failed`);
  console.log(`\nAll students can log in with:`);
  console.log(`  Username: their student ID (e.g., cs001, me042, admin)`);
  console.log(`  Password: ${DEFAULT_PASSWORD}`);
  console.log(`  (They will be forced to change password on first login)\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
