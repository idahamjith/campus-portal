// Push Notification and Service Worker Registration

// Replace with your VAPID Public Key from your backend
const PUBLIC_VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLj8eLlsnCpo';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function registerServiceWorker() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker registered with scope:', registration.scope);
            return registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
            return null;
        }
    } else {
        console.warn('Push messaging is not supported');
        return null;
    }
}

async function subscribeUserToPush() {
    const registration = await navigator.serviceWorker.ready;
    
    try {
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
            console.log('User is already subscribed:', existingSubscription);
            return existingSubscription;
        }

        const subscribeOptions = {
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
        };

        const subscription = await registration.pushManager.subscribe(subscribeOptions);
        console.log('User is subscribed:', subscription);
        
        // Send subscription to the Node.js backend
        await fetch('/api/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        return subscription;
    } catch (error) {
        console.error('Failed to subscribe the user: ', error);
        return null;
    }
}

async function requestNotificationPermission() {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        console.log('Notification permission granted.');
        await subscribeUserToPush();
        alert('Push notifications enabled successfully!');
    } else {
        console.warn('Notification permission denied.');
        alert('Please enable notifications in your browser settings to receive updates.');
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    const registration = await registerServiceWorker();
});

// Expose a global function to trigger permission request from a UI button
window.enablePushNotifications = requestNotificationPermission;

// Admin function to send a broadcast push
window.sendAdminPush = async function() {
    const title = document.getElementById('pushTitle').value;
    const body = document.getElementById('pushBody').value;
    const btn = document.getElementById('sendPushBtn');

    btn.classList.add('loading');
    try {
        const response = await fetch('/api/sendPush', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body })
        });
        const result = await response.json();
        if (result.success) {
            alert('Push broadcast sent successfully to ' + result.sent + ' devices!');
            document.getElementById('adminPushForm').reset();
        } else {
            alert('Failed to send broadcast.');
        }
    } catch (error) {
        console.error('Push error:', error);
        alert('Error communicating with backend.');
    } finally {
        btn.classList.remove('loading');
    }
};
