import { app, db } from './firebase.js';
import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// DOM elements
const loginForm = document.querySelector('.login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signInBtn = document.querySelector('.sign-in-btn');
const googleLoginBtn = document.querySelector('.btn-google');

// Show/hide loading state
const setLoadingState = (isLoading) => {
    signInBtn.disabled = isLoading;
    signInBtn.textContent = isLoading ? 'Signing in...' : 'Sign in';
};

// Show/hide Google loading state
const setGoogleLoadingState = (isLoading) => {
    googleLoginBtn.disabled = isLoading;
    const originalHTML = googleLoginBtn.innerHTML;

    if (isLoading) {
        googleLoginBtn.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center;">
                <div style="width: 16px; height: 16px; border: 2px solid #f3f3f3; border-top: 2px solid #4285f4; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 8px;"></div>
                Signing in with Google...
            </div>
        `;
    } else {
        googleLoginBtn.innerHTML = originalHTML;
    }
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
            redirectBasedOnRole(userData.role);
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

// Handle Google login
const handleGoogleLogin = async () => {
    clearError();
    setGoogleLoadingState(true);

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Check if user exists in Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            // Existing user - redirect based on role
            const userData = userDoc.data();
            redirectBasedOnRole(userData.role);
        } else {
            // New user - show role selection modal
            showRoleSelectionModal(user);
        }
    } catch (error) {
        console.error('Google login error:', error);
        let errorMessage = 'An error occurred during Google login. Please try again.';

        switch (error.code) {
            case 'auth/popup-closed-by-user':
                errorMessage = 'Sign-in popup was closed. Please try again.';
                break;
            case 'auth/popup-blocked':
                errorMessage = 'Popup was blocked by your browser. Please allow popups and try again.';
                break;
            case 'auth/network-request-failed':
                errorMessage = 'Network error. Please check your connection.';
                break;
        }

        showError(errorMessage);
        setGoogleLoadingState(false);
    }
};

// Show role selection modal for new Google users
const showRoleSelectionModal = (user) => {
    setGoogleLoadingState(false);

    const modalHTML = `
        <div id="role-modal" class="role-modal-overlay">
            <div class="role-modal-content">
                <h2>Select Your Role</h2>
                <p>Welcome ${user.displayName}! Please select your role to complete your registration:</p>
                <div class="role-buttons">
                    <button class="role-btn" data-role="student">
                        🎓 Student
                        <span class="role-desc">Looking for mentorship opportunities</span>
                    </button>
                    <button class="role-btn" data-role="mentor">
                        👨‍🏫 Mentor
                        <span class="role-desc">Ready to guide and mentor students</span>
                    </button>
                    <button class="role-btn" data-role="employer">
                        🏢 Employer
                        <span class="role-desc">Looking to hire talented students</span>
                    </button>
                </div>
                <button class="cancel-btn" onclick="cancelRoleSelection()">Cancel</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add event listeners to role buttons
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => selectRole(user, btn.dataset.role));
    });
};

// Handle role selection
const selectRole = async (user, role) => {
    const modal = document.getElementById('role-modal');
    const roleButtons = document.querySelectorAll('.role-btn');

    // Show loading on selected button
    const selectedBtn = document.querySelector(`[data-role="${role}"]`);
    selectedBtn.innerHTML = '<div class="loading-spinner"></div>Setting up your account...';
    roleButtons.forEach(btn => btn.disabled = true);

    try {
        // Create user document in Firestore
        const userData = {
            fullName: user.displayName,
            email: user.email,
            role: role,
            isActive: true,
            createdAt: serverTimestamp(),
            authProvider: 'google',
            profilePicture: user.photoURL
        };

        await setDoc(doc(db, 'users', user.uid), userData);

        // Remove modal and redirect
        modal.remove();
        redirectBasedOnRole(role);

    } catch (error) {
        console.error('Error saving user role:', error);
        showError('Failed to complete registration. Please try again.');
        modal.remove();
        setGoogleLoadingState(false);
    }
};

// Cancel role selection (sign out user)
window.cancelRoleSelection = async () => {
    const modal = document.getElementById('role-modal');
    modal.remove();
    await auth.signOut();
    setGoogleLoadingState(false);
};

// Redirect based on user role
const redirectBasedOnRole = (role) => {
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
            setGoogleLoadingState(false);
            break;
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
                    redirectBasedOnRole(userData.role);
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
    googleLoginBtn?.addEventListener('click', handleGoogleLogin);
    checkAuthState();
});