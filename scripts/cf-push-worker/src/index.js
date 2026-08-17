import jwt from '@tsndr/cloudflare-worker-jwt';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 1. Exchange JWT for Google OAuth2 Token
async function getGoogleAccessToken(clientEmail, privateKey) {
  const scope = 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore';
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: clientEmail,
    scope: scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  // Sign JWT using the private key
  const token = await jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  // Exchange JWT for Bearer token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${token}`
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// 2. Fetch tokens from Firestore REST API
async function getFirestoreTokens(projectId, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/fcm_tokens`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    // If collection doesn't exist or is empty, firestore returns 404 or empty
    if (response.status === 404) return [];
    throw new Error(`Failed to fetch firestore tokens: ${await response.text()}`);
  }

  const data = await response.json();
  if (!data.documents) return [];

  const tokens = [];
  for (const doc of data.documents) {
    if (doc.fields && doc.fields.token && doc.fields.token.stringValue) {
      tokens.push(doc.fields.token.stringValue);
    }
  }
  return tokens;
}

// 3. Send Push via FCM HTTP v1 API
async function sendFcmMessage(projectId, accessToken, token, title, body) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const payload = {
    message: {
      token: token,
      notification: {
        title: title,
        body: body
      },
      webpush: {
        notification: {
          icon: 'https://idahamjith.github.io/campus-portal/icon.svg'
        },
        fcm_options: {
          link: 'https://idahamjith.github.io/campus-portal/dashboard.html'
        }
      },
      data: {
        title: title,
        body: body,
        url: 'https://idahamjith.github.io/campus-portal/dashboard.html'
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return response.ok;
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST' || !request.url.endsWith('/api/sendPush')) {
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    try {
      const { title, body } = await request.json();

      if (!title || !body) {
        return new Response(JSON.stringify({ error: 'Title and body required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Read secrets from env
      const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;

      if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
        return new Response(JSON.stringify({ error: 'Missing Firebase secrets on worker' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Fix formatted private key string from secrets
      const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

      // 1. Get access token
      const accessToken = await getGoogleAccessToken(FIREBASE_CLIENT_EMAIL, privateKey);

      // 2. Fetch device tokens
      const deviceTokens = await getFirestoreTokens(FIREBASE_PROJECT_ID, accessToken);

      if (deviceTokens.length === 0) {
        return new Response(JSON.stringify({ error: 'No subscribed devices found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3. Send FCM Broadcast to all tokens concurrently
      const promises = deviceTokens.map(token => 
        sendFcmMessage(FIREBASE_PROJECT_ID, accessToken, token, title, body)
      );
      const results = await Promise.all(promises);

      const successCount = results.filter(r => r).length;
      const failureCount = results.length - successCount;

      return new Response(JSON.stringify({
        success: true,
        successCount,
        failureCount
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Error in worker:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
