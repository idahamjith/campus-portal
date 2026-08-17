import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyB9aFyb013SR9YC7EGsY5jhBAWcnhiyaGc",
  authDomain: "campus-portal-6d8f4.firebaseapp.com",
  projectId: "campus-portal-6d8f4",
  storageBucket: "campus-portal-6d8f4.firebasestorage.app",
  messagingSenderId: "936704518333",
  appId: "1:936704518333:web:add97c6dac0aaa16846fd4",
  measurementId: "G-TK7BMEZX35"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Initialize Cloud Storage and get a reference to the service
export const storage = getStorage(app);
