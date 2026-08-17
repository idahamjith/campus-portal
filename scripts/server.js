const express = require('express');
const cors = require('cors');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (e) {
  console.error('ERROR: serviceAccountKey.json not found in scripts/ directory.');
  process.exit(1);
}

// Initialize Firebase Admin
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const messaging = getMessaging();

const app = express();
app.use(cors());
app.use(express.json());

// Broadcast Push Notification Endpoint
app.post('/api/sendPush', async (req, res) => {
  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  try {
    // 1. Fetch all tokens from Firestore fcm_tokens collection
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    
    if (tokensSnapshot.empty) {
      return res.status(404).json({ error: 'No subscribed devices found' });
    }

    const tokens = [];
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.token) tokens.push(data.token);
    });

    if (tokens.length === 0) {
      return res.status(404).json({ error: 'No valid tokens found' });
    }

    // 2. Prepare the multicast message
    const message = {
      notification: {
        title: title,
        body: body,
      },
      tokens: tokens,
    };

    // 3. Send the message via FCM
    const response = await messaging.sendEachForMulticast(message);
    
    console.log(`[FCM] Broadcast complete. Success: ${response.successCount}, Failed: ${response.failureCount}`);

    // Optional: Clean up failed/invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      console.log('Failed tokens:', failedTokens);
      // You could delete these from Firestore here if desired
    }

    res.status(200).json({ 
      success: true, 
      successCount: response.successCount,
      failureCount: response.failureCount 
    });

  } catch (error) {
    console.error('Error sending broadcast:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Push Notification Server running on http://localhost:${PORT}`);
  console.log(`Ready to receive POST requests at http://localhost:${PORT}/api/sendPush`);
});
