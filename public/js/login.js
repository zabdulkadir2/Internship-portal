// login.js
import { auth, db, googleProvider } from "../js/firebase.js";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// FORM ELEMENTS
const form = document.querySelector(".login-form");
const googleBtn = document.querySelector(".btn-google");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Fetch user role from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const role = userData.role;

        if (role === "student") window.location.href = "../frontend/student-files/index.html";
        else if (role === "mentor") window.location.href = "../frontend/mentor-files/index.html";
        else if (role === "company") window.location.href = "../frontend/company-files/index.html";
        else alert("Unknown role. Contact support.");
      } else {
        alert("User data not found. Please register first.");
      }
    } catch (error) {
      console.error("Login error:", error.message);
      alert(error.message);
    }
  });
}

// GOOGLE SIGN-IN
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Fetch user role from Firestore
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const role = userDoc.data().role;
        if (role === "student") window.location.href = "../frontend/student-files/index.html";
        else if (role === "mentor") window.location.href = "../frontend/mentor-files/index.html";
        else if (role === "company") window.location.href = "../frontend/company-files/index.html";
        else alert("Unknown role. Contact support.");
      } else {
        alert("User data not found. Please register first.");
      }
    } catch (error) {
      console.error("Google Sign-in error:", error.message);
      alert(error.message);
    }
  });
}
