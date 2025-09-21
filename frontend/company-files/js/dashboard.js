import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, getDoc, doc, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeDataManager, getDataManager, formatters } from './data-integration.js';

// Initialize company dashboard
const initDashboard = async () => {
    try {
        // Ensure user is authenticated
        await requireAuth();

        // Load user data and update display
        const userData = await getCurrentUser();
        console.log('Company data loaded:', userData);

        // Verify user is an employer
        if (userData.role !== 'employer') {
            alert('Access denied. This page is for employers only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Initialize logout functionality
        initLogout();

        // Initialize data manager
        const dataManager = initializeDataManager(userData.uid);

        // Update company name in hero section
        updateCompanyName(userData);

        // Load dashboard data with real-time updates
        await loadDashboardData(dataManager);

    } catch (error) {
        console.error('Company dashboard initialization error:', error);
        showError('Failed to load dashboard data. Please refresh the page.');
    }
};

// Update company name in hero section
const updateCompanyName = (userData) => {
    const companyNameElement = document.getElementById('mentor-name');
    if (companyNameElement && userData.companyName) {
        companyNameElement.textContent = userData.companyName;
    }
};

// Load company dashboard-specific data with real-time updates
const loadDashboardData = async (dataManager) => {
    try {
        // Subscribe to real-time updates
        dataManager.subscribe('statistics', updateStatistics);
        dataManager.subscribe('applications', (applications) => {
            updateRecentApplicationsFromData(applications.slice(0, 5));
        });
        dataManager.subscribe('internships', (internships) => {
            updateLatestInternshipsFromData(internships.slice(0, 3));
        });

        // Load initial data with real-time enabled
        const [statistics, recentApplications, internships] = await Promise.all([
            dataManager.getStatistics(),
            dataManager.getRecentApplicationsWithStudents(5),
            dataManager.getInternships(true) // Enable real-time
        ]);

        // Initial display updates
        updateStatistics(statistics);
        updateRecentApplicationsFromData(recentApplications);
        updateLatestInternshipsFromData(internships.slice(0, 3));

        console.log('Company dashboard data loaded with real-time updates');
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showError('Some dashboard data could not be loaded.');
    }
};

// Update statistics in the UI
const updateStatistics = (stats) => {
    const statsCards = document.querySelectorAll('.stat-card h3');

    if (statsCards[0]) statsCards[0].textContent = stats.totalApplications || 0;
    if (statsCards[1]) statsCards[1].textContent = stats.activeInternships || 0;
    if (statsCards[2]) statsCards[2].textContent = stats.shortlistedApplications || 0;
};

// Update recent applications in UI using new data format
const updateRecentApplicationsFromData = (applications) => {
    const applicationsContainer = document.querySelector('.applications-list');
    if (!applicationsContainer) return;

    // Remove loading placeholder
    const loadingPlaceholder = applicationsContainer.querySelector('.loading-placeholder');
    if (loadingPlaceholder) {
        loadingPlaceholder.remove();
    }

    if (applications.length === 0) {
        showEmptyApplications();
        return;
    }

    applicationsContainer.innerHTML = applications.map(app => `
        <div class="application-card">
            <div class="app-info">
                <h3 class="student-name">
                    ${app.student.fullName}
                    <span class="student-program">(${app.student.university || 'Unknown University'})</span>
                </h3>
                <p class="internship-title">
                    Applied for: ${app.internshipTitle || 'Unknown Position'}
                </p>
                <p class="submission-date">
                    Submitted on: ${formatters.date(app.createdAt)}
                </p>
            </div>
            <div class="app-actions">
                <span class="status-tag status-${app.status || 'pending'}">${formatters.status(app.status)}</span>
                <a href="manage.html" class="btn action-button">Review Application</a>
            </div>
        </div>
    `).join('');
};

// Show empty applications state
const showEmptyApplications = () => {
    const applicationsContainer = document.querySelector('.applications-list');
    if (!applicationsContainer) return;

    applicationsContainer.innerHTML = `
        <div class="empty-state">
            <p>No applications received yet. Post your first internship to start receiving applications!</p>
            <a href="post.html" class="btn btn-primary">Post New Internship</a>
        </div>
    `;
};

// Update latest internships in UI using new data format
const updateLatestInternshipsFromData = async (internships) => {
    const internshipsContainer = document.querySelector('.internships-list');
    if (!internshipsContainer) return;

    // Remove loading placeholder
    const loadingPlaceholder = internshipsContainer.querySelector('.loading-placeholder');
    if (loadingPlaceholder) {
        loadingPlaceholder.remove();
    }

    if (internships.length === 0) {
        showEmptyInternships();
        return;
    }

    // Get application counts for each internship from data manager
    let internshipsWithCounts = [];

    try {
        const dataManager = getDataManager();
        const applications = await dataManager.getApplications();

        internshipsWithCounts = internships.map(internship => {
            const applicationCount = applications.filter(app => app.internshipId === internship.id).length;
            return { ...internship, applicationCount };
        });
    } catch (error) {
        console.error('Error getting application counts:', error);
        internshipsWithCounts = internships.map(internship => ({ ...internship, applicationCount: 0 }));
    }

    internshipsContainer.innerHTML = internshipsWithCounts.map(internship => `
        <div class="internship-card">
            <div class="internship-info">
                <h3 class="internship-title">${internship.title}</h3>
                <p class="post-date">Posted on: ${formatters.date(internship.createdAt)}</p>
                <p class="applications-count">Applications: ${internship.applicationCount || 0}</p>
            </div>
            <div class="internship-actions">
                <a href="edit-internship.html?id=${internship.id}" class="btn action-button">Edit or Manage</a>
            </div>
        </div>
    `).join('');
};

// Show empty internships state
const showEmptyInternships = () => {
    const internshipsContainer = document.querySelector('.internships-list');
    if (!internshipsContainer) return;

    internshipsContainer.innerHTML = `
        <div class="empty-state">
            <p>You haven't posted any internships yet. Start by posting your first internship!</p>
            <a href="post.html" class="btn btn-primary">Post New Internship</a>
        </div>
    `;
};

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    try {
        const dataManager = getDataManager();
        dataManager.cleanup();
    } catch (error) {
        // Data manager might not be initialized
    }
});

// Show error message
const showError = (message) => {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fef2f2;
        color: #dc2626;
        padding: 12px 16px;
        border: 1px solid #fecaca;
        border-radius: 6px;
        z-index: 1000;
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);