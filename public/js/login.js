import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements for the login page
const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-button');
const statusMessageDiv = document.getElementById('status-message');
const loadingPage = document.getElementById('loading-page');
const loginPage = document.getElementById('main-content');

// Firebase variables
let auth, db;

// --- Helper Functions ---
/**
 * Hides the login page and shows the loading state.
 */
const showLoading = () => {
    loginPage.style.display = 'none';
    loadingPage.style.display = 'flex';
};

/**
 * Hides the loading state and shows the login page.
 */
const hideLoading = () => {
    loadingPage.style.display = 'none';
    loginPage.style.display = 'flex';
};

/**
 * Displays a status message to the user.
 * @param {string} message The message to display.
 * @param {boolean} isError True if the message is an error.
 */
const showStatusMessage = (message, isError) => {
    statusMessageDiv.textContent = message;
    statusMessageDiv.classList.remove('hidden', 'status-error');
    if (isError) {
        statusMessageDiv.classList.add('status-error');
    }
};

/**
 * Hides the status message.
 */
const hideStatusMessage = () => {
    statusMessageDiv.classList.add('hidden');
};

// --- Core Application Logic ---

/**
 * Initializes Firebase and sets up the authentication listener.
 */
const initializeFirebase = async () => {
    try {
        // Ensure the global variables are available for initialization
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

        // Initialize Firebase app and services
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        // Show loading state while checking auth status
        showLoading();

        // Sign in with the custom token or anonymously
        if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        // Listen for authentication state changes
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // If a user is logged in, fetch their role and redirect
                await fetchUserRole(user.uid);
            } else {
                // No user is logged in, show the login page
                hideLoading();
            }
        });
    } catch (e) {
        console.error("Error initializing Firebase:", e);
        showStatusMessage("Failed to initialize the application. Please try again.", true);
        hideLoading();
    }
};

/**
 * Fetches the user's role from Firestore and redirects them to the correct portal page.
 * @param {string} uid The user's unique ID.
 */
const fetchUserRole = async (uid) => {
    if (!db) {
        showStatusMessage("Database not initialized.", true);
        return;
    }

    try {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const role = userData.role;

            // Redirect to the appropriate portal page based on the role
            switch (role) {
                case 'student':
                    window.location.href = '../student-files/index.html';
                    break;
                case 'mentor':
                    window.location.href = '../mentor-files/index.html';
                    break;
                case 'employer':
                    window.location.href = '../company-files/index.html';
                    break;
                default:
                    showStatusMessage("Your account has an unknown role. Please contact support.", true);
                    hideLoading();
                    break;
            }
        } else {
            // User document doesn't exist, handle as unassigned
            showStatusMessage("Your account exists, but your role has not been assigned in the database. Please contact support.", true);
            hideLoading();
        }
    } catch (e) {
        console.error("Error fetching user role:", e);
        showStatusMessage("Failed to retrieve user profile. Please try again.", true);
        hideLoading();
    }
};

/**
 * Handles the login form submission.
 * @param {Event} e The form submit event.
 */
const handleLogin = async (e) => {
    e.preventDefault();

    // Get form data
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // Basic validation
    if (!email || !password) {
        showStatusMessage("Please enter both email and password.", true);
        return;
    }
    if (!auth) {
        showStatusMessage("Firebase not initialized.", true);
        return;
    }

    // Show loading state and disable button
    loginButton.disabled = true;
    loginButton.textContent = 'Logging In...';
    hideStatusMessage();

    try {
        // Sign in the user with email and password
        await signInWithEmailAndPassword(auth, email, password);
        // The onAuthStateChanged listener will handle the redirection.
    } catch (e) {
        let message = "An unexpected error occurred during login.";
        switch (e.code) {
            case 'auth/invalid-credential':
                message = "Invalid email or password. Please check your credentials.";
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                message = "Invalid email or password. Please check your credentials.";
                break;
            default:
                console.error("Login error:", e.code, e.message);
                break;
        }
        showStatusMessage(message, true);
    } finally {
        // Re-enable button
        loginButton.disabled = false;
        loginButton.textContent = 'Sign in';
    }
};

// Add event listener to the form on page load
document.addEventListener('DOMContentLoaded', () => {
    loginForm.addEventListener('submit', handleLogin);
    initializeFirebase();
});
