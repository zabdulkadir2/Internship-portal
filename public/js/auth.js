// auth.js

import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { app } from "./firebase.js"; // your firebase config file

const auth = getAuth(app);
const db = getFirestore(app);

// Select form elements
const loginForm = document.querySelector(".login-form");
const googleBtn = document.querySelector(".btn-google");

// Login with email and password
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value.trim();

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Get the user's role from Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const role = userData.role; // role should be "student", "mentor", or "company"

      if (role === "student") {
        window.location.href = "../frontend/student-files/index.html";
      } else if (role === "mentor") {
        window.location.href = "../frontend/mentor-files/index.html";
      } else if (role === "company") {
        window.location.href = "../frontend/company-files/index.html";
      } else {
        alert("User role not recognized.");
      }
    } else {
      alert("No user data found.");
    }
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

// Login with Google
googleBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Get the user's role from Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const role = userData.role;

      if (role === "student") {
        window.location.href = "../frontend/student-files/index.html";
      } else if (role === "mentor") {
        window.location.href = "../frontend/mentor-files/index.html";
      } else if (role === "company") {
        window.location.href = "../frontend/company-files/index.html";
      } else {
        alert("User role not recognized.");
      }
    } else {
      alert("No user data found.");
    }
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});
