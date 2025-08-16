// register.js
import { auth, db, googleProvider } from "../js/firebase.js"; // import your pre-configured instances
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

// Helper: determine user role based on page
const getUserRole = () => {
  if (window.location.pathname.includes("student")) return "student";
  if (window.location.pathname.includes("mentor")) return "mentor";
  if (window.location.pathname.includes("company")) return "company";
  return "unknown";
};

// FORM ELEMENTS
const form = document.querySelector(".register-form");
const googleBtn = document.querySelector(".btn-google");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const role = getUserRole();
    let userData = {};

    if (role === "student") {
      userData = {
        fullName: document.getElementById("full-name").value,
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
        university: document.getElementById("university").value,
        interest: document.getElementById("interest").value,
        role,
      };
    } else if (role === "mentor") {
      userData = {
        fullName: document.getElementById("full-name").value,
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
        expertise: document.getElementById("expertise").value,
        role,
      };
    } else if (role === "company") {
      userData = {
        companyName: document.getElementById("company-name").value,
        email: document.getElementById("company-email").value,
        password: document.getElementById("password").value,
        industry: document.getElementById("industry").value,
        role,
      };
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, userData.email, userData.password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), userData);

      if (role === "student") window.location.href = "../frontend/student-files/index.html";
      if (role === "mentor") window.location.href = "../frontend/mentor-files/index.html";
      if (role === "company") window.location.href = "../frontend/company-files/index.html";
    } catch (error) {
      console.error("Registration error:", error.message);
      alert(error.message);
    }
  });
}

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    const role = getUserRole();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      await setDoc(doc(db, "users", user.uid), { email: user.email, role }, { merge: true });

      if (role === "student") window.location.href = "../frontend/student-files/index.html";
      if (role === "mentor") window.location.href = "../frontend/mentor-files/index.html";
      if (role === "company") window.location.href = "../frontend/company-files/index.html";
    } catch (error) {
      console.error("Google Sign-in error:", error.message);
      alert(error.message);
    }
  });
}
