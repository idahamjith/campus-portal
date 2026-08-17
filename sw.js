// Campus Portal — Service Worker v3
// Uses raw push event handler for reliable notification display.

// Firebase SDK is still needed so getToken() works on the client side.
importScripts('./js/firebase-app-compat.js');
importScripts('./js/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB9aFyb013SR9YC7EGsY5jhBAWcnhiyaGc",
  authDomain: "campus-portal-6d8f4.firebaseapp.com",
  projectId: "campus-portal-6d8f4",
  storageBucket: "campus-portal-6d8f4.firebasestorage.app",
  messagingSenderId: "936704518333",
  appId: "1:936704518333:web:add97c6dac0aaa16846fd4"
});

// Keep this so Firebase SDK doesn't complain
firebase.messaging();

// ── Service Worker lifecycle ──
self.addEventListener('install', () => {
  console.log('[SW v3] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW v3] Activated');
  event.waitUntil(self.clients.claim());
});

// ── Raw push event handler ──
// This intercepts the push BEFORE Firebase can show a generic fallback.
// The key: showNotification MUST be inside event.waitUntil().
self.addEventListener('push', (event) => {
  console.log('[SW v3] Push event received:', event);

  let data = {};
  try {
    const raw = event.data?.json();
    // FCM wraps data-only messages under raw.data
    data = raw?.data || raw?.notification || raw || {};
  } catch (e) {
    try {
      data = { body: event.data?.text() || '' };
    } catch (e2) {
      data = {};
    }
  }

  const title = data.title || 'Campus Portal';
  const options = {
    body: data.body || 'New update available.',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: 'campus-portal-' + Date.now(),
    data: {
      url: data.url || './dashboard.html'
    }
  };

  // CRITICAL: This must be inside event.waitUntil() or Chrome shows fallback
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Handle notification click ──
self.addEventListener('notificationclick', (event) => {
  console.log('[SW v3] Notification clicked');
  event.notification.close();

  const targetUrl = event.notification.data?.url || './dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('dashboard') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
