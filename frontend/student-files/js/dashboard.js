import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const dashboardLoading = document.getElementById('dashboard-loading');
const dashboardContent = document.getElementById('dashboard-content');
const notificationBar = document.getElementById('notification-bar');
const studentNameElement = document.getElementById('student-name');

// State
let currentUser = null;

// Initialize dashboard
const initDashboard = async () => {
    try {
        // Show loading state
        showLoading();

        // Ensure user is authenticated and is a student
        await requireAuth();
        currentUser = await getCurrentUser();

        if (currentUser.role !== 'student') {
            alert('Access denied. This page is for students only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Initialize logout functionality
        initLogout();

        // Update student name
        updateStudentInfo();

        // Setup notification handlers
        setupNotificationHandlers();

        // Load dashboard data
        await loadDashboardData();

        // Setup real-time listeners
        setupRealTimeListeners();

        // Hide loading and show content
        hideLoading();

    } catch (error) {
        console.error('Dashboard initialization error:', error);
        showError('Failed to load dashboard. Please refresh the page.');
        hideLoading();
    }
};

// Update student info in UI
const updateStudentInfo = () => {
    if (studentNameElement && currentUser.fullName) {
        studentNameElement.textContent = currentUser.fullName;
    }
};

// Load dashboard-specific data
const loadDashboardData = async () => {
    try {
        // Load all dashboard data in parallel
        await Promise.all([
            loadStudentStatistics(),
            loadRecentInternships(),
            loadNotifications()
        ]);

        console.log('Dashboard data loaded successfully');
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showError('Some dashboard data failed to load.');
    }
};

// Load student statistics
const loadStudentStatistics = async () => {
    try {
        const userId = currentUser.uid;

        // Load applications
        const applicationsQuery = query(
            collection(db, 'applications'),
            where('studentId', '==', userId)
        );
        const applicationsSnapshot = await getDocs(applicationsQuery);
        const applications = applicationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Load shortlisted status
        const shortlistQuery = query(
            collection(db, 'shortlists'),
            where('studentId', '==', userId)
        );
        const shortlistSnapshot = await getDocs(shortlistQuery);
        const shortlisted = shortlistSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Calculate statistics
        const stats = {
            totalApplications: applications.length,
            shortlistedCount: shortlisted.length,
            interviewCount: applications.filter(app =>
                app.status === 'interview-scheduled' || app.status === 'interview'
            ).length,
            activeApplications: applications.filter(app =>
                !['rejected', 'hired'].includes(app.status || 'applied')
            ).length
        };

        // Update UI
        updateStatisticsDisplay(stats);

        console.log('Student statistics loaded:', stats);

    } catch (error) {
        console.error('Error loading student statistics:', error);
    }
};

// Load notifications for student
const loadNotifications = async () => {
    try {
        const notificationsQuery = query(
            collection(db, 'notifications'),
            where('recipientId', '==', currentUser.uid),
            where('read', '==', false),
            orderBy('createdAt', 'desc'),
            limit(1)
        );

        const notificationsSnapshot = await getDocs(notificationsQuery);

        if (!notificationsSnapshot.empty) {
            const latestNotification = notificationsSnapshot.docs[0].data();
            showNotificationBar(latestNotification);
        }

    } catch (error) {
        console.error('Error loading notifications:', error);
        // Don't show error for notifications - it's not critical
    }
};

// Load recent internships for dashboard preview
const loadRecentInternships = async () => {
    try {
        const q = query(
            collection(db, 'internships'),
            where('status', '==', 'active'),
            orderBy('createdAt', 'desc'),
            limit(4)
        );

        const querySnapshot = await getDocs(q);
        const internships = [];

        querySnapshot.forEach((doc) => {
            internships.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Update internship cards on dashboard
        displayDashboardInternships(internships);

    } catch (error) {
        console.error('Error loading recent internships:', error);
        showEmptyInternships();
    }
};

// Display internships on dashboard
const displayDashboardInternships = (internships) => {
    const internshipGrid = document.querySelector('.internship-cards-grid');

    if (!internshipGrid) return;

    if (internships.length === 0) {
        showEmptyInternships();
        return;
    }

    internshipGrid.innerHTML = internships.map(internship => `
        <div class="internship-card">
            <h3>${escapeHtml(internship.title)}</h3>
            <p class="company-info">${escapeHtml(internship.companyName)} • ${escapeHtml(internship.location || 'Remote')} • ${escapeHtml(internship.duration || '3 Months')}</p>
            <p class="description">${escapeHtml(truncateText(internship.description, 100))}</p>
            <a href="internship.html?id=${internship.id}" class="btn-accent-yellow">Apply Now</a>
        </div>
    `).join('');
};

// Show empty state for internships
const showEmptyInternships = () => {
    const internshipGrid = document.querySelector('.internship-cards-grid');
    if (internshipGrid) {
        internshipGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <h3>No internships available</h3>
                <p>Check back later for new opportunities!</p>
            </div>
        `;
    }
};

// Update statistics display
const updateStatisticsDisplay = (stats) => {
    const elements = {
        'applications-count': stats.totalApplications,
        'shortlisted-count': stats.shortlistedCount,
        'interviews-count': stats.interviewCount,
        'active-applications-count': stats.activeApplications
    };

    Object.entries(elements).forEach(([elementId, value]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    });
};

// Show notification bar
const showNotificationBar = (notification) => {
    if (!notificationBar) return;

    const notificationText = document.getElementById('notification-text');
    if (notificationText) {
        notificationText.textContent = notification.message || 'You have new notifications!';
    }

    notificationBar.style.display = 'block';
};

// Setup notification handlers
const setupNotificationHandlers = () => {
    const viewNotificationsBtn = document.getElementById('view-notifications-btn');
    const dismissNotification = document.getElementById('dismiss-notification');

    viewNotificationsBtn?.addEventListener('click', () => {
        window.location.href = 'notifications.html';
    });

    dismissNotification?.addEventListener('click', () => {
        if (notificationBar) {
            notificationBar.style.display = 'none';
        }
    });
};

// Loading state management
const showLoading = () => {
    if (dashboardLoading) dashboardLoading.style.display = 'flex';
    if (dashboardContent) dashboardContent.style.display = 'none';
};

const hideLoading = () => {
    if (dashboardLoading) dashboardLoading.style.display = 'none';
    if (dashboardContent) dashboardContent.style.display = 'block';
};

// Error handling
const showError = (message) => {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fee2e2;
        color: #dc2626;
        padding: 12px 20px;
        border-radius: 8px;
        border: 1px solid #fecaca;
        z-index: 10000;
        max-width: 300px;
    `;
    errorDiv.textContent = message;

    document.body.appendChild(errorDiv);

    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
};

// Setup real-time listeners for dashboard updates
const setupRealTimeListeners = () => {
    if (!currentUser) return;

    // Listen for application changes to update statistics
    const applicationsQuery = query(
        collection(db, 'applications'),
        where('studentId', '==', currentUser.uid)
    );

    onSnapshot(applicationsQuery, (snapshot) => {
        const applications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Update applications data
        updateApplicationStatistics(applications);
    }, (error) => {
        console.error('Error in dashboard applications listener:', error);
    });

    // Listen for shortlist changes
    const shortlistQuery = query(
        collection(db, 'shortlists'),
        where('studentId', '==', currentUser.uid)
    );

    onSnapshot(shortlistQuery, (snapshot) => {
        const shortlisted = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Update shortlist count
        const shortlistedCountElement = document.getElementById('shortlisted-count');
        if (shortlistedCountElement) {
            shortlistedCountElement.textContent = shortlisted.length;
        }
    }, (error) => {
        console.error('Error in dashboard shortlist listener:', error);
    });
};

// Update application statistics in real-time
const updateApplicationStatistics = (applications) => {
    const stats = {
        totalApplications: applications.length,
        interviewCount: applications.filter(app =>
            app.status === 'interview-scheduled' || app.status === 'interview'
        ).length,
        activeApplications: applications.filter(app =>
            !['rejected', 'hired'].includes(app.status || 'applied')
        ).length
    };

    // Update UI
    const elements = {
        'applications-count': stats.totalApplications,
        'interviews-count': stats.interviewCount,
        'active-applications-count': stats.activeApplications
    };

    Object.entries(elements).forEach(([elementId, value]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    });
};

// Utility functions
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const truncateText = (text, maxLength) => {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);