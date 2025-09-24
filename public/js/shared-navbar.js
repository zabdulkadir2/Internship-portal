// Shared Navbar Component for CampusConnect Student Portal
import { requireAuth, initLogout, getCurrentUser } from './auth-utils.js';
import { db } from './firebase.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

class SharedNavbar {
    constructor() {
        this.currentUser = null;
        this.notificationBadge = null;
        this.pageMap = {
            'index.html': 'home',
            'applications.html': 'applications',
            'schedule.html': 'schedule',
            'internship.html': 'internships',
            'mentors.html': 'mentors',
            'session.html': 'sessions',
            'student-profile.html': 'profile',
            'notifications.html': 'notifications'
        };

        this.init();
    }

    async init() {
        try {
            // Ensure user is authenticated
            await requireAuth();
            this.currentUser = await getCurrentUser();

            if (this.currentUser.role !== 'student') {
                alert('Access denied. This page is for students only.');
                window.location.href = '/public/login.html';
                return;
            }

            // Create and inject navbar
            this.createNavbar();

            // Setup functionality
            this.setupLogout();
            this.setupNotificationBadge();

        } catch (error) {
            console.error('Navbar initialization error:', error);
            // Fallback: still show navbar but without dynamic features
            this.createNavbar();
        }
    }

    createNavbar() {
        const navbarPlaceholder = document.getElementById('navbar-placeholder');
        if (!navbarPlaceholder) {
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
                    <li><a href="internship.html" class="${currentPage === 'internships' ? 'active' : ''}">Internships</a></li>
                    <li><a href="mentors.html" class="${currentPage === 'mentors' ? 'active' : ''}">Mentors</a></li>
                    <li><a href="applications.html" class="${currentPage === 'applications' ? 'active' : ''}">My Applications</a></li>
                    <li><a href="schedule.html" class="${currentPage === 'schedule' ? 'active' : ''}">My Schedule</a></li>
                    <li><a href="session.html" class="${currentPage === 'sessions' ? 'active' : ''}">My Sessions</a></li>
                    <li><a href="student-profile.html" class="${currentPage === 'profile' ? 'active' : ''}">Profile</a></li>
                    <li><a href="notifications.html" class="${currentPage === 'notifications' ? 'active' : ''}">
                        Notifications
                        <span id="notification-badge" class="notification-badge" style="display: none;">0</span>
                    </a></li>
                    <li><a href="#" id="logout-btn">Logout</a></li>
                </ul>
            </nav>
        `;

        navbarPlaceholder.innerHTML = navbarHTML;

        // Add notification badge CSS if not already present
        this.addNotificationBadgeCSS();
    }

    getCurrentPage() {
        const pathname = window.location.pathname;
        const filename = pathname.split('/').pop() || 'index.html';

        // Handle special cases for active states based on analysis
        if (filename === 'index.html' || pathname.endsWith('/student-files/')) {
            return 'home';
        }

        return this.pageMap[filename] || '';
    }

    addNotificationBadgeCSS() {
        // Check if styles already exist
        if (document.querySelector('#shared-navbar-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'shared-navbar-styles';
        styles.textContent = `
            /* Shared Navbar Notification Badge Styles */
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

    setupLogout() {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            // Use the initLogout function from auth-utils
            initLogout();
        }
    }

    setupNotificationBadge() {
        if (!this.currentUser) return;

        this.notificationBadge = document.getElementById('notification-badge');
        if (!this.notificationBadge) return;

        try {
            // Listen for unread notifications
            const notificationsQuery = query(
                collection(db, 'notifications'),
                where('recipientId', '==', this.currentUser.uid),
                where('read', '==', false)
            );

            onSnapshot(notificationsQuery, (snapshot) => {
                const unreadCount = snapshot.docs.length;
                this.updateNotificationBadge(unreadCount);
            }, (error) => {
                console.error('Error listening to notifications:', error);
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
        if (!this.notificationBadge) return;

        if (count > 0) {
            this.notificationBadge.textContent = count > 99 ? '99+' : count.toString();
            this.notificationBadge.style.display = 'inline-flex';
            this.notificationBadge.classList.remove('no-unread');
        } else {
            this.notificationBadge.style.display = 'none';
            this.notificationBadge.classList.add('no-unread');
        }
    }

    // Public method to refresh notification count (useful for other components)
    refreshNotificationBadge() {
        if (this.currentUser) {
            // Badge will refresh automatically due to onSnapshot listener
            console.log('Notification badge is auto-refreshing via real-time listener');
        }
    }

    // Public method to get current user (useful for other components)
    getCurrentUser() {
        return this.currentUser;
    }
}

// Initialize navbar when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create global instance for potential external access
    window.sharedNavbar = new SharedNavbar();
});

// Also initialize if DOM is already loaded
if (document.readyState === 'loading') {
    // DOM still loading, wait for DOMContentLoaded
} else {
    // DOM already loaded
    window.sharedNavbar = new SharedNavbar();
}

// Export for module usage
export { SharedNavbar };