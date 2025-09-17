import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { app, db } from './firebase.js';

// DOM elements for registration page
const registerForm = document.querySelector('.register-form');
const registerButton = document.querySelector('.register-btn');

// Firebase variables
let auth;

/**
 * Creates and displays a status message to the user.
 * This function creates a new message element to avoid relying on a specific ID
 * that may not exist on all pages.
 * @param {string} message The message to display.
 * @param {boolean} isError True if the message is an error.
 */
const showStatusMessage = (message, isError) => {
    // Check if a message div already exists and remove it
    let statusMessageDiv = document.querySelector('.status-message');
    if (statusMessageDiv) {
        statusMessageDiv.remove();
    }

    // Create and style the new message div
    statusMessageDiv = document.createElement('div');
    statusMessageDiv.className = `status-message p-4 mt-4 rounded-md text-sm text-center font-medium`;
    statusMessageDiv.textContent = message;

    if (isError) {
        statusMessageDiv.classList.add('bg-red-100', 'text-red-700');
    } else {
        statusMessageDiv.classList.add('bg-green-100', 'text-green-700');
    }

    // Insert the message before the first button in the form
    if (registerForm) {
        registerForm.insertBefore(statusMessageDiv, registerForm.querySelector('.btn'));
    }
};

/**
 * Initializes Firebase services.
 */
const initializeFirebase = async () => {
    try {
        // const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
        // const app = initializeApp(firebaseConfig);
        auth = getAuth(app);

        // // Sign in with the custom token provided by the environment
        // if (typeof __initial_auth_token !== 'undefined') {
        //     await signInWithCustomToken(auth, __initial_auth_token);
        // } else {
        //     await signInAnonymously(auth);
        // }
    } catch (e) {
        console.error("Error initializing Firebase:", e);
        showStatusMessage("Failed to initialize the application. Please try again.", true);
    }
};

/**
 * Determines the user's role and collects additional data from the form.
 * @returns {object|null} An object containing the role and user data, or null on failure.
 */
const getUserDataFromForm = () => {
    const pageTitle = document.querySelector('.welcome-title').textContent;
    let role = '';
    let userData = {};

    const email = document.getElementById('email')?.value || document.getElementById('company-email')?.value;
    const password = document.getElementById('password')?.value;
    const confirmPassword = document.getElementById('confirm-password')?.value;

    if (!email || !password || !confirmPassword) {
        showStatusMessage("Please fill in all required fields.", true);
        return null;
    }

    if (password !== confirmPassword) {
        showStatusMessage("Passwords do not match.", true);
        return null;
    }

    if (password.length < 6) {
        showStatusMessage("Password must be at least 6 characters long.", true);
        return null;
    }

    if (!document.getElementById('agree-terms').checked) {
        showStatusMessage("You must agree to the service agreement.", true);
        return null;
    }

    // Determine role and gather specific user data
    if (pageTitle.includes('Student')) {
        role = 'student';
        const fullName = document.getElementById('full-name').value;
        const university = document.getElementById('university').value;
        const interest = document.getElementById('interest').value;
        if (!fullName || !university || !interest) {
            showStatusMessage("Please fill in all student details.", true);
            return null;
        }
        userData = { fullName, university, interest };
    } else if (pageTitle.includes('Mentor')) {
        role = 'mentor';
        const fullName = document.getElementById('full-name').value;
        const expertise = document.getElementById('expertise').value;
        if (!fullName || !expertise) {
            showStatusMessage("Please fill in all mentor details.", true);
            return null;
        }
        userData = { fullName, expertise };
    } else if (pageTitle.includes('Company')) {
        role = 'employer'; // Using 'employer' as the role for consistency with login
        const companyName = document.getElementById('company-name').value;
        const industry = document.getElementById('industry').value;
        if (!companyName || !industry) {
            showStatusMessage("Please fill in all company details.", true);
            return null;
        }
        userData = { companyName, industry };
    } else {
        showStatusMessage("Could not determine user role. Please contact support.", true);
        return null;
    }

    return { email, password, role, userData };
};

/**
 * Handles the registration form submission.
 * @param {Event} e The form submit event.
 */
const handleRegistration = async (e) => {
    e.preventDefault();

    const registrationData = getUserDataFromForm();
    if (!registrationData) {
        return;
    }

    // Disable button and show loading text
    registerButton.disabled = true;
    registerButton.textContent = 'Registering...';

    const { email, password, role, userData } = registrationData;

    try {
        // Create user with email and password
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Save additional user data to Firestore with the determined role
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
            email: user.email,
            role: role,
            ...userData,
            createdAt: new Date()
        });

        showStatusMessage('Registration successful! Redirecting...', false);

        // Redirect to the appropriate dashboard based on role
        setTimeout(() => {
            switch (role) {
                case 'student':
                    window.location.href = '../frontend/student-files/index.html';
                    break;
                case 'mentor':
                    window.location.href = '../frontend/mentors-files/index.html';
                    break;
                case 'employer':
                    window.location.href = '../frontend/company-files/index.html';
                    break;
            }
        }, 1500);

    } catch (e) {
        let message = "An unknown error occurred. Please try again.";
        switch (e.code) {
            case 'auth/email-already-in-use':
                message = "This email is already registered. Please login or use a different email.";
                break;
            case 'auth/invalid-email':
                message = "The email address is not valid.";
                break;
            case 'auth/weak-password':
                message = "The password is too weak. Please use a stronger password.";
                break;
            default:
                console.error("Registration error:", e.code, e.message);
                break;
        }
        showStatusMessage(message, true);
    } finally {
        // Re-enable the button and reset text
        registerButton.disabled = false;
        registerButton.textContent = registerButton.dataset.originalText || registerButton.textContent;
    }
};

// Add event listener to the form on page load
document.addEventListener('DOMContentLoaded', () => {
    // Store original button text before adding the listener
    if (registerButton) {
        registerButton.dataset.originalText = registerButton.textContent;
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegistration);
    }
    initializeFirebase();
});
