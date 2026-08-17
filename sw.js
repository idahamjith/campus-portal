// Campus Portal — Service Worker (Firebase Cloud Messaging) v2
// Handles background push notifications via FCM.

// Import Firebase Messaging compat SDK (required for SW context)
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

// Initialize Firebase inside the service worker
firebase.initializeApp({
  apiKey: "AIzaSyB9aFyb013SR9YC7EGsY5jhBAWcnhiyaGc",
  authDomain: "campus-portal-6d8f4.firebaseapp.com",
  projectId: "campus-portal-6d8f4",
  storageBucket: "campus-portal-6d8f4.firebasestorage.app",
  messagingSenderId: "936704518333",
  appId: "1:936704518333:web:add97c6dac0aaa16846fd4"
});

const messaging = firebase.messaging();

// ── Service Worker lifecycle ──
self.addEventListener('install', () => {
  console.log('[SW] Installed v2');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated v2');
  event.waitUntil(self.clients.claim());
});

// ── Handle FCM background messages ──
// This fires when a push arrives while the app is in the background or closed.
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received (data payload):', payload);
  
  const title = payload.data?.title || 'Campus Portal';
  const options = {
    body: payload.data?.body || 'New update available.',
    icon: './icon.svg',
    badge: './icon.svg',
    data: {
      url: payload.data?.url || './dashboard.html'
    }
  };

  self.registration.showNotification(title, options);
});

// ── Handle notification click ──
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
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
