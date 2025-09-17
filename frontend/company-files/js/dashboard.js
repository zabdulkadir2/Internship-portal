import { requireAuth, initLogout, loadUserData } from '../../../public/js/auth-utils.js';

// Initialize company dashboard
const initDashboard = async () => {
    try {
        // Ensure user is authenticated
        await requireAuth();

        // Load user data and update display
        const userData = await loadUserData();
        console.log('Company data loaded:', userData);

        // Verify user is an employer
        if (userData.role !== 'employer') {
            alert('Access denied. This page is for employers only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Initialize logout functionality
        initLogout();

        // Load dashboard data
        await loadDashboardData(userData);

    } catch (error) {
        console.error('Company dashboard initialization error:', error);
    }
};

// Load company dashboard-specific data
const loadDashboardData = async (userData) => {
    // This will be expanded later with actual data loading
    console.log('Company dashboard data loaded for:', userData.companyName);
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);