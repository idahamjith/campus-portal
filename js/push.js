/* ═══════════════════════════════════════════════════════════
   CAMPUS PORTAL — Push Notifications (Firebase Cloud Messaging)
   Replaces the dead /api/subscribe + /api/sendPush Node.js backend.
   FCM tokens are saved to Firestore fcm_tokens collection.
   Admin sends broadcasts via Firebase Console (free, no Cloud Functions).
   ═══════════════════════════════════════════════════════════ */

import { messaging, auth, db } from './firebase-init.js';
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Your VAPID public key from Firebase Console → Project Settings → Cloud Messaging
// Replace this with YOUR key from: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLj8eLlsnCpo';

// ── Register service worker ──
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Workers not supported');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    console.log('[FCM] Service Worker registered, scope:', reg.scope);
    return reg;
  } catch (err) {
    console.error('[FCM] Service Worker registration failed:', err);
    return null;
  }
}

// ── Get FCM token and save to Firestore ──
async function subscribeUserToPush(user) {
  if (!messaging) {
    console.warn('[FCM] Messaging not available (requires HTTPS)');
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log('[FCM] Token obtained:', token.substring(0, 20) + '...');
      // Save token to Firestore (keyed by token, tagged with user uid)
      await setDoc(doc(db, 'fcm_tokens', token), {
        token,
        uid: user.uid,
        updatedAt: serverTimestamp()
      });
      console.log('[FCM] Token saved to Firestore');
      return token;
    } else {
      console.warn('[FCM] No token received — notification permission may be denied');
    }
  } catch (err) {
    console.error('[FCM] Error getting token:', err);
  }
}

// ── Handle foreground messages (app is open) ──
function setupForegroundMessages() {
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    console.log('[FCM] Foreground message received:', payload);
    const { title, body } = payload.notification || {};
    if (title && Notification.permission === 'granted') {
      new Notification(title, {
        body: body || '',
        icon: './icon.svg',
        badge: './icon.svg'
      });
    }
  });
}

// ── Request notification permission and subscribe ──
window.enablePushNotifications = async function() {
  if (!('Notification' in window)) {
    alert('Push notifications are not supported in this browser.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Please enable notifications in your browser settings to receive updates.');
    return;
  }

  // Get the current Firebase user and subscribe
  const user = auth.currentUser;
  if (!user) {
    alert('Please sign in to enable push notifications.');
    return;
  }

  await subscribeUserToPush(user);
  alert('Push notifications enabled! You will now receive campus updates.');
};

// ── Admin broadcast push (writes to Firestore push_queue) ──
// NOTE: Since we're on the free Spark plan (no Cloud Functions),
// admins send broadcasts directly from Firebase Console:
// Firebase Console → Engage → Messaging → New Campaign
//
// The button below is kept for UI completeness but shows instructions.
window.sendAdminPush = async function() {
  const title = document.getElementById('pushTitle')?.value?.trim();
  const body  = document.getElementById('pushBody')?.value?.trim();
  const btn   = document.getElementById('sendPushBtn');

  if (!title || !body) {
    alert('Please enter a title and message.');
    return;
  }

  btn.classList.add('loading');
  try {
    const response = await fetch('http://localhost:3000/api/sendPush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    });
    
    if (response.ok) {
      alert('Broadcast notification sent successfully!');
      document.getElementById('pushTitle').value = '';
      document.getElementById('pushBody').value = '';
    } else {
      const errorData = await response.json();
      alert(`Error sending notification: ${errorData.error}`);
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
    alert('Failed to connect to the push server. Make sure it is running.');
  } finally {
    btn.classList.remove('loading');
  }
};

// ── Initialize on load ──
document.addEventListener('DOMContentLoaded', async () => {
  await registerServiceWorker();
  setupForegroundMessages();

  // Auto-subscribe if user is already signed in and notifications are granted
  onAuthStateChanged(auth, async (user) => {
    if (user && Notification.permission === 'granted') {
      await subscribeUserToPush(user);
    }
  });
});
