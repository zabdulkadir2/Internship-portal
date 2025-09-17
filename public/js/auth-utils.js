import { app, db } from './firebase.js';
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = getAuth(app);

// Authentication guard - redirects to login if not authenticated
export const requireAuth = () => {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            if (user) {
                resolve(user);
            } else {
                // Redirect to login page
                window.location.href = '/public/login.html';
                reject(new Error('User not authenticated'));
            }
        });
    });
};

// Get current user data including role
export const getCurrentUser = async () => {
    const user = auth.currentUser;
    if (!user) {
        throw new Error('No user logged in');
    }

    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
        throw new Error('User profile not found');
    }

    return {
        uid: user.uid,
        email: user.email,
        ...userDoc.data()
    };
};

// Logout function
export const logout = async () => {
    try {
        await signOut(auth);
        window.location.href = '/public/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        throw error;
    }
};

// Initialize logout functionality for any page
export const initLogout = () => {
    // Remove the DOMContentLoaded wrapper since this is called after DOM is loaded
    const logoutLinks = document.querySelectorAll('a');
    console.log('Setting up logout on', logoutLinks.length, 'links');

    logoutLinks.forEach(link => {
        const linkText = link.textContent.toLowerCase().trim();
        if (linkText === 'logout') {
            console.log('Found logout link, setting up event listener');
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log('Logout clicked');
                try {
                    await logout();
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Error logging out. Please try again.');
                }
            });
        }
    });

    // Add fallback global click listener for logout links
    document.addEventListener('click', async (e) => {
        if (e.target.tagName === 'A' && e.target.textContent.toLowerCase().trim() === 'logout') {
            e.preventDefault();
            console.log('Fallback logout clicked');
            try {
                await logout();
            } catch (error) {
                console.error('Logout error:', error);
                alert('Error logging out. Please try again.');
            }
        }
    });
};

// Load user data and update page elements
export const loadUserData = async () => {
    try {
        const userData = await getCurrentUser();

        // Update user name elements
        const nameElements = document.querySelectorAll('#student-name, #mentor-name, #company-name');
        nameElements.forEach(element => {
            if (element) {
                let displayName = '';
                switch (userData.role) {
                    case 'student':
                        displayName = userData.fullName || userData.email;
                        break;
                    case 'mentor':
                        displayName = userData.fullName || userData.email;
                        break;
                    case 'employer':
                        displayName = userData.companyName || userData.email;
                        break;
                    default:
                        displayName = userData.email;
                }
                element.textContent = displayName;
            }
        });

        return userData;
    } catch (error) {
        console.error('Error loading user data:', error);
        throw error;
    }
};