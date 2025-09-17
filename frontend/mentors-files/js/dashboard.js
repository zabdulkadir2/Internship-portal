import { requireAuth, initLogout, loadUserData } from '../../../public/js/auth-utils.js';

// Initialize mentor dashboard
const initDashboard = async () => {
    try {
        // Ensure user is authenticated
        await requireAuth();

        // Load user data and update display
        const userData = await loadUserData();
        console.log('Mentor data loaded:', userData);

        // Verify user is a mentor
        if (userData.role !== 'mentor') {
            alert('Access denied. This page is for mentors only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Initialize logout functionality
        initLogout();

        // Load dashboard data
        await loadDashboardData(userData);

    } catch (error) {
        console.error('Mentor dashboard initialization error:', error);
    }
};

// Load mentor dashboard-specific data
const loadDashboardData = async (userData) => {
    // This will be expanded later with actual data loading
    console.log('Mentor dashboard data loaded for:', userData.fullName);
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);