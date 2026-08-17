// Campus Portal — Service Worker (Firebase Cloud Messaging)
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
  console.log('[SW] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(self.clients.claim());
});

// ── Handle FCM background messages ──
// This fires when a push arrives while the app is in the background or closed.
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
  // Do NOT call self.registration.showNotification() manually if the payload contains
  // a 'notification' object, because the Firebase Messaging SDK automatically 
  // displays a notification for it. Doing so will result in duplicate or blank notifications.
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
