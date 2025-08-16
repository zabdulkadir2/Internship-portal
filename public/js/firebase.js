// / Import Firebase modules from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-analytics.js";

// Your Firebase configuration
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDxWM7JSeAdRvZGNKLnSLwAQsuLg1X8SGY",
    authDomain: "internship-portal-a8cb1.firebaseapp.com",
    projectId: "internship-portal-a8cb1",
    storageBucket: "internship-portal-a8cb1.firebasestorage.app",
    messagingSenderId: "956653714699",
    appId: "1:956653714699:web:01e882b851ce752e8af60e",
    measurementId: "G-BY9LGGWW2V"
  };

  // Initialize Firebase app
const app = initializeApp(firebaseConfig);
// Initialize Firebase Analytics
const analytics = getAnalytics(app);
// Initialize Firebase Authentication
const auth = getAuth(app);
// Google Auth Provider
const provider = new GoogleAuthProvider();

// Optional: log page view
logEvent(analytics, 'page_view');
