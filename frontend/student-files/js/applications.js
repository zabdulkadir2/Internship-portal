import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, addDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const applicationsContainer = document.querySelector('.applications-list');
const summaryCards = document.querySelectorAll('.summary-card h3');

// State
let userApplications = [];

// Initialize page
const initPage = async () => {
    try {
        // Ensure user is authenticated and is a student
        await requireAuth();
        const userData = await getCurrentUser();

        if (userData.role !== 'student') {
            alert('Access denied. This page is for students only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Initialize logout functionality
        initLogout();

        // Load applications
        await loadApplications(userData.uid);

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load applications. Please refresh the page.');
    }
};

// Load user applications
const loadApplications = async (userId) => {
    try {
        showLoading();

        // Query user's applications
        const q = query(
            collection(db, 'applications'),
            where('studentId', '==', userId),
            orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(q);
        userApplications = [];

        querySnapshot.forEach((doc) => {
            userApplications.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Update summary stats
        updateSummaryStats();

        // Display applications
        displayApplications();

    } catch (error) {
        console.error('Error loading applications:', error);
        showError('Failed to load applications. Please try again.');
    } finally {
        hideLoading();
    }
};

// Update summary statistics
const updateSummaryStats = () => {
    const totalApps = userApplications.length;
    const reviewedApps = userApplications.filter(app => app.status !== 'pending').length;
    const activeApps = userApplications.filter(app => app.status === 'pending' || app.status === 'reviewing').length;
    const acceptedApps = userApplications.filter(app => app.status === 'accepted').length;

    if (summaryCards.length >= 4) {
        summaryCards[0].textContent = totalApps;
        summaryCards[1].textContent = reviewedApps;
        summaryCards[2].textContent = activeApps;
        summaryCards[3].textContent = acceptedApps;
    }
};

// Display applications
const displayApplications = () => {
    if (!applicationsContainer) return;

    if (userApplications.length === 0) {
        applicationsContainer.innerHTML = `
            <div class="no-applications" style="text-align: center; padding: 60px 20px; color: #6b7280;">
                <h3>No Applications Yet</h3>
                <p>You haven't submitted any internship applications yet.</p>
                <a href="internship.html" class="btn btn-primary" style="margin-top: 16px;">Browse Internships</a>
            </div>
        `;
        return;
    }

    // Group applications by status
    const groupedApps = groupApplicationsByStatus();

    applicationsContainer.innerHTML = Object.entries(groupedApps).map(([status, apps]) => {
        if (apps.length === 0) return '';

        return `
            <div class="application-status-group">
                <h3 class="status-header ${status}">${getStatusDisplayName(status)} (${apps.length})</h3>
                <div class="applications-grid">
                    ${apps.map(app => createApplicationCard(app)).join('')}
                </div>
            </div>
        `;
    }).join('');
};

// Group applications by status
const groupApplicationsByStatus = () => {
    return userApplications.reduce((groups, app) => {
        const status = app.status || 'pending';
        if (!groups[status]) {
            groups[status] = [];
        }
        groups[status].push(app);
        return groups;
    }, {});
};

// Create application card HTML
const createApplicationCard = (application) => {
    const statusClass = getStatusClass(application.status);
    const statusDisplay = getStatusDisplayName(application.status);

    return `
        <div class="application-card ${statusClass}">
            <div class="application-header">
                <h4 class="application-title">${escapeHtml(application.internshipTitle)}</h4>
                <div class="company-name">${escapeHtml(application.companyName)}</div>
            </div>

            <div class="application-meta">
                <div class="meta-item">
                    <strong>Applied:</strong> ${formatDate(application.createdAt)}
                </div>
                ${application.deadline ? `
                    <div class="meta-item">
                        <strong>Deadline:</strong> ${formatDate(application.deadline)}
                    </div>
                ` : ''}
                <div class="meta-item">
                    <strong>Status:</strong>
                    <span class="status-badge ${statusClass}">${statusDisplay}</span>
                </div>
            </div>

            ${application.notes ? `
                <div class="application-notes">
                    <strong>Notes:</strong> ${escapeHtml(application.notes)}
                </div>
            ` : ''}

            <div class="application-actions">
                <button class="btn btn-secondary view-details-btn" data-id="${application.id}">
                    View Details
                </button>
                ${application.status === 'pending' ? `
                    <button class="btn btn-tertiary withdraw-btn" data-id="${application.id}">
                        Withdraw
                    </button>
                ` : ''}
            </div>
        </div>
    `;
};

// Submit application function (to be called from internship page)
window.submitApplication = async (internshipId, internshipData) => {
    try {
        const userData = await getCurrentUser();

        // Check if already applied
        const existingApp = userApplications.find(app => app.internshipId === internshipId);
        if (existingApp) {
            throw new Error('You have already applied to this internship.');
        }

        // Create application document
        const applicationData = {
            studentId: userData.uid,
            studentName: userData.fullName,
            studentEmail: userData.email,
            internshipId: internshipId,
            internshipTitle: internshipData.title,
            companyId: internshipData.companyId,
            companyName: internshipData.companyName,
            deadline: internshipData.deadline,
            status: 'pending',
            createdAt: serverTimestamp(),
            notes: ''
        };

        // Save to Firestore
        const docRef = await addDoc(collection(db, 'applications'), applicationData);
        console.log('Application submitted with ID:', docRef.id);

        // Add to local state
        userApplications.unshift({
            id: docRef.id,
            ...applicationData,
            createdAt: new Date() // Use current date for immediate display
        });

        // Update UI
        updateSummaryStats();
        displayApplications();

        return { success: true, applicationId: docRef.id };

    } catch (error) {
        console.error('Error submitting application:', error);
        throw error;
    }
};

// Get status display name
const getStatusDisplayName = (status) => {
    const statusMap = {
        'pending': 'Pending Review',
        'reviewing': 'Under Review',
        'accepted': 'Accepted',
        'rejected': 'Not Selected',
        'withdrawn': 'Withdrawn'
    };
    return statusMap[status] || 'Unknown';
};

// Get status CSS class
const getStatusClass = (status) => {
    const classMap = {
        'pending': 'status-pending',
        'reviewing': 'status-reviewing',
        'accepted': 'status-accepted',
        'rejected': 'status-rejected',
        'withdrawn': 'status-withdrawn'
    };
    return classMap[status] || 'status-unknown';
};

// Utility functions
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';

    let date;
    if (timestamp.toDate) {
        // Firestore timestamp
        date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else {
        date = new Date(timestamp);
    }

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const showLoading = () => {
    if (applicationsContainer) {
        applicationsContainer.innerHTML = `
            <div class="loading-indicator" style="text-align: center; padding: 40px; color: #6b7280;">
                Loading applications...
            </div>
        `;
    }
};

const hideLoading = () => {
    // Loading indicator will be replaced by displayApplications()
};

const showError = (message) => {
    if (applicationsContainer) {
        applicationsContainer.innerHTML = `
            <div class="error-message" style="text-align: center; padding: 40px; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 16px;">Retry</button>
            </div>
        `;
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);