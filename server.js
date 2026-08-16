const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// VAPID keys should be generated only once.
// Here we hardcode a pair for demonstration purposes, matching the client-side key.
const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLj8eLlsnCpo';
const privateVapidKey = 'xK0dK-7pS_D1uT7jUQQ_z-A8P_lWn1Q1Yq6XN6A7JXY'; // In production, keep this secret!

webpush.setVapidDetails(
  'mailto:test@test.com',
  publicVapidKey,
  privateVapidKey
);

// Store subscriptions (in memory for demo; in production, use a DB)
let subscriptions = [];

// Route to subscribe a client
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  
  // Save subscription if it doesn't exist
  const exists = subscriptions.find(sub => sub.endpoint === subscription.endpoint);
  if (!exists) {
      subscriptions.push(subscription);
      console.log('New subscription added. Total:', subscriptions.length);
  }
  res.status(201).json({});
});

// Route to send push notifications (Admin uses this)
app.post('/api/sendPush', (req, res) => {
  const { title, body } = req.body;

  const payload = JSON.stringify({
    title: title || 'Admin Broadcast',
    body: body || 'You have a new message from the admin.',
    icon: 'icon.svg',
    url: './dashboard.html'
  });

  console.log(`Sending push to ${subscriptions.length} clients...`);

  // Send to all stored subscriptions
  const promises = subscriptions.map((subscription, index) => {
      return webpush.sendNotification(subscription, payload).catch(error => {
          console.error(`Error sending to subscription ${index}:`, error);
          // If subscription is invalid/gone, we could remove it here
          if (error.statusCode === 410 || error.statusCode === 404) {
              subscriptions.splice(index, 1);
          }
      });
  });

  Promise.all(promises).then(() => {
      res.status(200).json({ success: true, sent: subscriptions.length });
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
