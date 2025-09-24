// Shared Navbar Component for CampusConnect Mentor Portal
import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

class MentorNavbar {
    constructor() {
        this.currentUser = null;
        this.notificationBadge = null;
        this.pageMap = {
            'index.html': 'home',
            'request.html': 'requests',
            'mentees.html': 'mentees',
            'myschedule.html': 'schedule',
            'mentor-profile.html': 'profile'
        };

        this.init();
    }

    async init() {
        try {
            // Ensure user is authenticated
            await requireAuth();
            this.currentUser = await getCurrentUser();

            if (this.currentUser.role !== 'mentor') {
                alert('Access denied. This page is for mentors only.');
                window.location.href = '/public/login.html';
                return;
            }

            // Create and inject navbar
            this.createNavbar();

            // Setup functionality
            this.setupLogout();
            this.setupNotificationBadge();

        } catch (error) {
            console.error('Mentor navbar initialization error:', error);
            // Fallback: still show navbar but without dynamic features
            this.createNavbar();
        }
    }

    createNavbar() {
        const navbarPlaceholder = document.getElementById('navbar-placeholder');
        if (!navbarPlaceholder) {
            // If no placeholder, look for existing navbar
            const existingNav = document.querySelector('.nav-container');
            if (existingNav) {
                this.enhanceExistingNavbar(existingNav);
                return;
            }
            console.error('Navbar placeholder not found');
            return;
        }

        // Get current page for active state
        const currentPage = this.getCurrentPage();

        // Create navbar HTML
        const navbarHTML = `
            <nav class="nav-container">
                <div class="logo">
                    <h1>CampusConnect</h1>
                </div>
                <ul class="nav-links">
                    <li><a href="index.html" class="${currentPage === 'home' ? 'active' : ''}">Home</a></li>
                    <li><a href="request.html" class="${currentPage === 'requests' ? 'active' : ''}">Student Requests</a></li>
                    <li><a href="mentees.html" class="${currentPage === 'mentees' ? 'active' : ''}">My Mentees</a></li>
                    <li><a href="myschedule.html" class="${currentPage === 'schedule' ? 'active' : ''}">My Schedule</a></li>
                    <li><a href="mentor-profile.html" class="${currentPage === 'profile' ? 'active' : ''}">Profile</a></li>
                    <li><a href="#" id="mentor-logout-btn">Logout</a></li>
                </ul>
            </nav>
        `;

        navbarPlaceholder.innerHTML = navbarHTML;
        this.setupLogout();
    }

    enhanceExistingNavbar(existingNav) {
        // Update active states for existing navbar
        const currentPage = this.getCurrentPage();
        const navLinks = existingNav.querySelectorAll('.nav-links a');

        navLinks.forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');

            if (href && this.pageMap[href] === currentPage) {
                link.classList.add('active');
            }
        });

        // Add logout handler
        this.setupLogout();
    }

    getCurrentPage() {
        const pathname = window.location.pathname;
        const filename = pathname.split('/').pop() || 'index.html';

        // Handle special cases for active states
        if (filename === 'index.html' || pathname.endsWith('/mentors-files/')) {
            return 'home';
        }

        return this.pageMap[filename] || '';
    }

    setupLogout() {
        // Use the initLogout function from auth-utils which handles all logout scenarios
        initLogout();

        // Also handle the specific mentor logout button if it exists
        const mentorLogoutBtn = document.getElementById('mentor-logout-btn');
        if (mentorLogoutBtn) {
            mentorLogoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    const { logout } = await import('../../../public/js/auth-utils.js');
                    await logout();
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Error logging out. Please try again.');
                }
            });
        }
    }

    setupNotificationBadge() {
        if (!this.currentUser) return;

        // For mentors, we might want to track session requests as notifications
        try {
            // Listen for pending session requests (notifications for mentors)
            const pendingRequestsQuery = query(
                collection(db, 'sessionRequests'),
                where('mentorId', '==', this.currentUser.uid),
                where('status', '==', 'pending')
            );

            onSnapshot(pendingRequestsQuery, (snapshot) => {
                const pendingCount = snapshot.docs.length;
                this.updateNotificationBadge(pendingCount);
            }, (error) => {
                console.error('Error listening to session requests:', error);
                // Hide badge on error to avoid confusion
                if (this.notificationBadge) {
                    this.notificationBadge.style.display = 'none';
                }
            });

        } catch (error) {
            console.error('Error setting up notification badge:', error);
        }
    }

    updateNotificationBadge(count) {
        // Check if badge already exists to prevent duplicates
        let existingBadge = document.getElementById('mentor-notification-badge');
        if (existingBadge && !this.notificationBadge) {
            this.notificationBadge = existingBadge;
        }

        // Create badge if it doesn't exist
        if (!this.notificationBadge) {
            const requestLink = document.querySelector('a[href="request.html"]');
            if (requestLink) {
                // Remove any existing badges first
                const existingBadges = requestLink.querySelectorAll('.notification-badge');
                existingBadges.forEach(badge => badge.remove());

                this.notificationBadge = document.createElement('span');
                this.notificationBadge.id = 'mentor-notification-badge';
                this.notificationBadge.className = 'notification-badge';
                this.addNotificationBadgeCSS();
                requestLink.appendChild(this.notificationBadge);
                console.log('Created new notification badge');
            }
        }

        if (this.notificationBadge) {
            if (count > 0) {
                this.notificationBadge.textContent = count > 99 ? '99+' : count.toString();
                this.notificationBadge.style.display = 'inline-flex';
                this.notificationBadge.classList.remove('no-unread');
            } else {
                this.notificationBadge.style.display = 'none';
                this.notificationBadge.classList.add('no-unread');
            }
        }
    }

    addNotificationBadgeCSS() {
        // Check if styles already exist
        if (document.querySelector('#mentor-navbar-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'mentor-navbar-styles';
        styles.textContent = `
            /* Mentor Navbar Notification Badge Styles */
            .notification-badge {
                background-color: #ef4444;
                color: white;
                border-radius: 50%;
                padding: 2px 6px;
                font-size: 0.75rem;
                font-weight: 600;
                margin-left: 4px;
                min-width: 18px;
                height: 18px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                animation: pulse-badge 2s infinite;
            }

            @keyframes pulse-badge {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }

            .notification-badge.no-unread {
                display: none !important;
            }

            /* Ensure navbar links align properly with badge */
            .nav-links a {
                display: flex;
                align-items: center;
            }
        `;
        document.head.appendChild(styles);
    }

    // Public method to refresh notification count (useful for other components)
    refreshNotificationBadge() {
        if (this.currentUser) {
            // Badge will refresh automatically due to onSnapshot listener
            console.log('Mentor notification badge is auto-refreshing via real-time listener');
        }
    }

    // Public method to get current user (useful for other components)
    getCurrentUser() {
        return this.currentUser;
    }
}

// Singleton pattern to prevent multiple initializations
let navbarInstance = null;

// Initialize navbar when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    if (navbarInstance) {
        console.log('Mentor navbar already initialized');
        return;
    }

    console.log('Initializing mentor navbar...');
    navbarInstance = new MentorNavbar();
    await navbarInstance.init();

    // Create global instance for potential external access
    window.mentorNavbar = navbarInstance;
});

// Also initialize if DOM is already loaded
if (document.readyState === 'loading') {
    // DOM still loading, wait for DOMContentLoaded
} else {
    // DOM already loaded
    if (!navbarInstance) {
        console.log('DOM already loaded, initializing navbar immediately...');
        navbarInstance = new MentorNavbar();
        navbarInstance.init();
        window.mentorNavbar = navbarInstance;
    }
}

// Export for module usage
export { MentorNavbar };