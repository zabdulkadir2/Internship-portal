// auth.js
import { auth } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";

// Google Sign-In
export function signInWithGoogle() {
  const googleProvider = new GoogleAuthProvider();
  signInWithPopup(auth, googleProvider)
    .then((result) => {
      console.log("Google Sign-In Successful:", result.user);
    })
    .catch((error) => console.error("Google Sign-In Error:", error));
}

// Email/Password Sign-Up
export function signUpWithEmail(email, password) {
  createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => console.log("Sign-Up Successful:", userCredential.user))
    .catch((error) => console.error("Sign-Up Error:", error));
}

// Email/Password Sign-In
export function signInWithEmail(email, password) {
  signInWithEmailAndPassword(auth, email, password)
    .then((userCredential) => console.log("Sign-In Successful:", userCredential.user))
    .catch((error) => console.error("Sign-In Error:", error));
}
