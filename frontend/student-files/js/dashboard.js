import { requireAuth, initLogout, loadUserData } from '../../../public/js/auth-utils.js';

// Initialize dashboard
const initDashboard = async () => {
    try {
        // Ensure user is authenticated
        await requireAuth();

        // Load user data and update display
        const userData = await loadUserData();
        console.log('User data loaded:', userData);

        // Initialize logout functionality
        initLogout();

        // Load dashboard data
        await loadDashboardData(userData);

    } catch (error) {
        console.error('Dashboard initialization error:', error);
    }
};

// Load dashboard-specific data
const loadDashboardData = async (userData) => {
    try {
        // Load recent internships for homepage preview
        await loadRecentInternships();

        console.log('Dashboard data loaded for:', userData.role);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
};

// Load recent internships for dashboard preview
const loadRecentInternships = async () => {
    try {
        const { collection, getDocs, query, orderBy, where, limit } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const { db } = await import('../../../public/js/firebase.js');

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
        // Fallback to existing hardcoded content if database fails
    }
};

// Display internships on dashboard
const displayDashboardInternships = (internships) => {
    const internshipGrid = document.querySelector('.internship-cards-grid');

    if (!internshipGrid || internships.length === 0) return;

    internshipGrid.innerHTML = internships.map(internship => `
        <div class="internship-card">
            <h3>${escapeHtml(internship.title)}</h3>
            <p class="company-info">${escapeHtml(internship.companyName)} • ${escapeHtml(internship.location || 'Remote')} • ${escapeHtml(internship.duration || '3 Months')}</p>
            <p class="description">${escapeHtml(truncateText(internship.description, 100))}</p>
            <a href="internship.html" class="btn-accent-yellow">Apply Now</a>
        </div>
    `).join('');
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