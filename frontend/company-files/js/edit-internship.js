import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const loadingState = document.getElementById('loading-state');
const mainContent = document.getElementById('main-content');
const internshipDisplay = document.getElementById('internship-display');
const editForm = document.getElementById('edit-form');
const editBtn = document.getElementById('edit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const deleteBtn = document.getElementById('delete-btn');
const viewApplicationsBtn = document.getElementById('view-applications-btn');

// State
let currentInternship = null;
let internshipId = null;
let currentUser = null;

// Initialize page
const initPage = async () => {
    try {
        // Ensure user is authenticated and is an employer
        await requireAuth();
        currentUser = await getCurrentUser();

        if (currentUser.role !== 'employer') {
            alert('Access denied. This page is for employers only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Initialize logout functionality
        initLogout();

        // Get internship ID from URL parameters
        internshipId = getInternshipIdFromUrl();
        if (!internshipId) {
            showError('No internship ID provided.');
            return;
        }

        // Setup event handlers
        setupEventHandlers();

        // Load internship data
        await loadInternshipData();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load internship details. Please refresh the page.');
    }
};

// Get internship ID from URL parameters
const getInternshipIdFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
};

// Setup event handlers
const setupEventHandlers = () => {
    editBtn?.addEventListener('click', showEditForm);
    cancelEditBtn?.addEventListener('click', hideEditForm);
    editForm?.addEventListener('submit', handleSaveChanges);
    deleteBtn?.addEventListener('click', handleDeleteInternship);
};

// Load internship data
const loadInternshipData = async () => {
    try {
        showLoading();

        // Get internship details
        const internshipDoc = await getDoc(doc(db, 'internships', internshipId));

        if (!internshipDoc.exists()) {
            showError('Internship not found.');
            return;
        }

        currentInternship = { id: internshipDoc.id, ...internshipDoc.data() };

        // Verify this internship belongs to the current user
        if (currentInternship.companyId !== currentUser.uid) {
            showError('You do not have permission to edit this internship.');
            return;
        }

        // Load applications data
        const applications = await loadApplicationsData();

        // Display data
        displayInternshipData(currentInternship);
        displayApplicationsStats(applications);

        hideLoading();

    } catch (error) {
        console.error('Error loading internship data:', error);
        showError('Failed to load internship details.');
        hideLoading();
    }
};

// Load applications data for this internship
const loadApplicationsData = async () => {
    try {
        const applicationsQuery = query(
            collection(db, 'applications'),
            where('internshipId', '==', internshipId)
        );

        const applicationsSnapshot = await getDocs(applicationsQuery);
        return applicationsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error loading applications:', error);
        return [];
    }
};

// Display internship data
const displayInternshipData = (internship) => {
    // Basic info
    document.getElementById('display-title').textContent = internship.title || '-';
    document.getElementById('display-location').textContent = internship.location || '-';
    document.getElementById('display-type').textContent = internship.type || '-';
    document.getElementById('display-duration').textContent = internship.duration || '-';
    document.getElementById('display-start-date').textContent = formatDate(internship.startDate) || '-';
    document.getElementById('display-deadline').textContent = formatDate(internship.deadline) || '-';
    document.getElementById('display-stipend').textContent = internship.stipend || '-';
    document.getElementById('display-openings').textContent = internship.openings || '-';

    // Status with styling
    const statusElement = document.getElementById('display-status');
    const status = internship.status || 'active';
    statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    statusElement.className = `status-badge ${status}`;

    // Description
    document.getElementById('display-description').textContent = internship.description || '-';

    // Skills
    const skillsElement = document.getElementById('display-skills');
    if (internship.requiredSkills && internship.requiredSkills.length > 0) {
        skillsElement.innerHTML = internship.requiredSkills.map(skill =>
            `<span class="skill-tag">${skill}</span>`
        ).join('');
    } else {
        skillsElement.textContent = '-';
    }

    // Preferred majors
    const majorsElement = document.getElementById('display-majors');
    if (internship.preferredMajors && internship.preferredMajors.length > 0) {
        majorsElement.innerHTML = internship.preferredMajors.map(major =>
            `<span class="skill-tag">${major}</span>`
        ).join('');
    } else {
        majorsElement.textContent = '-';
    }

    // Update page title
    document.title = `Edit: ${internship.title || 'Internship'} | CampusConnect`;
};

// Display applications statistics
const displayApplicationsStats = (applications) => {
    const totalCount = applications.length;
    const pendingCount = applications.filter(app => !app.status || app.status === 'applied').length;
    const shortlistedCount = applications.filter(app =>
        app.status === 'shortlisted' || app.status === 'interview-scheduled'
    ).length;

    document.getElementById('total-applications').textContent = totalCount;
    document.getElementById('pending-applications').textContent = pendingCount;
    document.getElementById('shortlisted-applications').textContent = shortlistedCount;

    // Update view applications button
    if (viewApplicationsBtn) {
        viewApplicationsBtn.href = `manage.html?internship=${internshipId}`;
    }
};

// Show edit form
const showEditForm = () => {
    // Populate form with current data
    populateEditForm(currentInternship);

    // Hide display and show form
    internshipDisplay.style.display = 'none';
    editForm.style.display = 'block';
    editBtn.style.display = 'none';
};

// Hide edit form
const hideEditForm = () => {
    internshipDisplay.style.display = 'block';
    editForm.style.display = 'none';
    editBtn.style.display = 'inline-block';
};

// Populate edit form
const populateEditForm = (internship) => {
    document.getElementById('edit-title').value = internship.title || '';
    document.getElementById('edit-location').value = internship.location || '';
    document.getElementById('edit-type').value = internship.type || 'full-time';
    document.getElementById('edit-duration').value = internship.duration || '';
    document.getElementById('edit-start-date').value = formatDateForInput(internship.startDate) || '';
    document.getElementById('edit-deadline').value = formatDateForInput(internship.deadline) || '';
    document.getElementById('edit-stipend').value = internship.stipend || '';
    document.getElementById('edit-openings').value = internship.openings || 1;
    document.getElementById('edit-status').value = internship.status || 'active';
    document.getElementById('edit-description').value = internship.description || '';
    document.getElementById('edit-skills').value = (internship.requiredSkills || []).join(', ');
    document.getElementById('edit-majors').value = (internship.preferredMajors || []).join(', ');
};

// Handle save changes
const handleSaveChanges = async (e) => {
    e.preventDefault();

    try {
        showLoading();

        // Collect form data
        const updatedData = {
            title: document.getElementById('edit-title').value.trim(),
            location: document.getElementById('edit-location').value.trim(),
            type: document.getElementById('edit-type').value,
            duration: document.getElementById('edit-duration').value.trim(),
            startDate: document.getElementById('edit-start-date').value || null,
            deadline: document.getElementById('edit-deadline').value || null,
            stipend: document.getElementById('edit-stipend').value.trim(),
            openings: parseInt(document.getElementById('edit-openings').value) || 1,
            status: document.getElementById('edit-status').value,
            description: document.getElementById('edit-description').value.trim(),
            requiredSkills: document.getElementById('edit-skills').value
                .split(',').map(skill => skill.trim()).filter(skill => skill),
            preferredMajors: document.getElementById('edit-majors').value
                .split(',').map(major => major.trim()).filter(major => major),
            updatedAt: new Date()
        };

        // Validate required fields
        if (!updatedData.title) {
            showError('Internship title is required.');
            hideLoading();
            return;
        }

        if (!updatedData.description) {
            showError('Internship description is required.');
            hideLoading();
            return;
        }

        // Update in Firestore
        const internshipRef = doc(db, 'internships', internshipId);
        await updateDoc(internshipRef, updatedData);

        // Update local data
        currentInternship = { ...currentInternship, ...updatedData };

        // Refresh display
        displayInternshipData(currentInternship);

        // Hide form
        hideEditForm();

        showSuccess('Internship updated successfully!');
        hideLoading();

    } catch (error) {
        console.error('Error updating internship:', error);
        showError('Failed to update internship. Please try again.');
        hideLoading();
    }
};

// Handle delete internship
const handleDeleteInternship = async () => {
    if (!confirm('Are you sure you want to delete this internship? This action cannot be undone.')) {
        return;
    }

    try {
        showLoading();

        // Delete the internship
        await deleteDoc(doc(db, 'internships', internshipId));

        showSuccess('Internship deleted successfully. Redirecting...');

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);

    } catch (error) {
        console.error('Error deleting internship:', error);
        showError('Failed to delete internship. Please try again.');
        hideLoading();
    }
};

// Utility functions
const formatDate = (dateValue) => {
    if (!dateValue) return '';
    try {
        if (dateValue.toDate) {
            return dateValue.toDate().toLocaleDateString();
        }
        return new Date(dateValue).toLocaleDateString();
    } catch (error) {
        return '';
    }
};

const formatDateForInput = (dateValue) => {
    if (!dateValue) return '';
    try {
        let date;
        if (dateValue.toDate) {
            date = dateValue.toDate();
        } else {
            date = new Date(dateValue);
        }
        return date.toISOString().split('T')[0];
    } catch (error) {
        return '';
    }
};

// Loading state management
const showLoading = () => {
    if (loadingState) loadingState.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'none';
};

const hideLoading = () => {
    if (loadingState) loadingState.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';
};

// Notification functions
const showSuccess = (message) => {
    showNotification(message, 'success');
};

const showError = (message) => {
    showNotification(message, 'error');
};

const showNotification = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 24px',
        borderRadius: '8px',
        color: 'white',
        fontSize: '14px',
        fontWeight: '500',
        zIndex: '10000',
        maxWidth: '300px',
        backgroundColor: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease'
    });

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 5000);
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);