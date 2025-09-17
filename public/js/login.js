import { app, db } from './firebase.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = getAuth(app);

// DOM elements
const loginForm = document.querySelector('.login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signInBtn = document.querySelector('.sign-in-btn');

// Show/hide loading state
const setLoadingState = (isLoading) => {
    signInBtn.disabled = isLoading;
    signInBtn.textContent = isLoading ? 'Signing in...' : 'Sign in';
};

// Show error message
const showError = (message) => {
    // Remove any existing error message
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    // Create and show new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        color: #dc2626;
        background: #fef2f2;
        border: 1px solid #fecaca;
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 16px;
        font-size: 14px;
    `;
    errorDiv.textContent = message;

    loginForm.insertBefore(errorDiv, loginForm.firstChild);
};

// Clear error messages
const clearError = () => {
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
};

// Handle login form submission
const handleLogin = async (e) => {
    e.preventDefault();
    clearError();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // Basic validation
    if (!email || !password) {
        showError('Please enter both email and password.');
        return;
    }

    setLoadingState(true);

    try {
        // Sign in user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Get user role from Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            const role = userData.role;

            // Redirect based on role
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
                default:
                    showError('Unknown user role. Please contact support.');
                    setLoadingState(false);
                    break;
            }
        } else {
            showError('User profile not found. Please contact support.');
            setLoadingState(false);
        }
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'An error occurred during login. Please try again.';

        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                errorMessage = 'Invalid email or password. Please check your credentials.';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many failed attempts. Please try again later.';
                break;
            case 'auth/network-request-failed':
                errorMessage = 'Network error. Please check your connection.';
                break;
        }

        showError(errorMessage);
        setLoadingState(false);
    }
};

// Check if user is already logged in
const checkAuthState = () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is already logged in, redirect to appropriate dashboard
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const role = userData.role;

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
                }
            } catch (error) {
                console.error('Error checking user role:', error);
            }
        }
    });
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    loginForm.addEventListener('submit', handleLogin);
    checkAuthState();
});