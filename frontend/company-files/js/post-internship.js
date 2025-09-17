import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const postForm = document.querySelector('.post-internship-form');
const submitBtn = document.querySelector('.btn-primary');
const cancelBtn = document.querySelector('.btn-tertiary');

// Initialize page
const initPage = async () => {
    try {
        // Ensure user is authenticated and is an employer
        await requireAuth();
        const userData = await getCurrentUser();

        if (userData.role !== 'employer') {
            alert('Access denied. This page is for employers only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Initialize logout functionality
        initLogout();

        // Setup form handlers
        setupFormHandlers();

    } catch (error) {
        console.error('Page initialization error:', error);
    }
};

// Setup form event handlers
const setupFormHandlers = () => {
    postForm.addEventListener('submit', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
};

// Handle form submission
const handleSubmit = async (e) => {
    e.preventDefault();

    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';

    try {
        // Get current user data
        const userData = await getCurrentUser();

        // Collect form data
        const formData = collectFormData();

        // Validate required fields
        if (!validateFormData(formData)) {
            return;
        }

        // Create internship document
        const internshipData = {
            ...formData,
            companyId: userData.uid,
            companyName: userData.companyName,
            companyEmail: userData.email,
            status: 'active',
            createdAt: serverTimestamp(),
            applicationsCount: 0
        };

        // Save to Firestore
        const docRef = await addDoc(collection(db, 'internships'), internshipData);
        console.log('Internship posted with ID:', docRef.id);

        // Show success message
        showSuccessMessage('Internship posted successfully!');

        // Redirect to manage page after 2 seconds
        setTimeout(() => {
            window.location.href = 'manage.html';
        }, 2000);

    } catch (error) {
        console.error('Error posting internship:', error);
        showErrorMessage('Failed to post internship. Please try again.');
    } finally {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post Internship';
    }
};

// Collect form data
const collectFormData = () => {
    const locationTypes = Array.from(document.querySelectorAll('input[name="location-type"]:checked'))
        .map(cb => cb.value);

    return {
        title: document.getElementById('internship-title').value.trim(),
        location: document.getElementById('location').value.trim(),
        locationType: locationTypes,
        type: document.getElementById('internship-type').value,
        duration: document.getElementById('duration').value.trim(),
        startDate: document.getElementById('start-date').value,
        deadline: document.getElementById('deadline').value,
        stipend: document.getElementById('stipend').value.trim(),
        openings: parseInt(document.getElementById('openings').value) || 1,
        description: document.getElementById('internship-description').value.trim(),
        requiredSkills: document.getElementById('required-skills').value
            .split(',').map(skill => skill.trim()).filter(skill => skill),
        preferredMajors: document.getElementById('preferred-majors').value
            .split(',').map(major => major.trim()).filter(major => major),
        benefits: document.getElementById('benefits').value.trim(),
        applicationContact: document.getElementById('application-contact').value.trim()
    };
};

// Validate form data
const validateFormData = (data) => {
    if (!data.title) {
        showErrorMessage('Internship title is required.');
        return false;
    }

    if (!data.description) {
        showErrorMessage('Internship description is required.');
        return false;
    }

    if (!data.applicationContact) {
        showErrorMessage('Application contact is required.');
        return false;
    }

    // Validate email or URL format for application contact
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const urlRegex = /^https?:\/\/.+/;

    if (!emailRegex.test(data.applicationContact) && !urlRegex.test(data.applicationContact)) {
        showErrorMessage('Application contact must be a valid email or URL.');
        return false;
    }

    return true;
};

// Show success message
const showSuccessMessage = (message) => {
    showMessage(message, 'success');
};

// Show error message
const showErrorMessage = (message) => {
    showMessage(message, 'error');
};

// Show message
const showMessage = (message, type) => {
    // Remove existing messages
    const existingMessage = document.querySelector('.form-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `form-message ${type}-message`;
    messageDiv.style.cssText = `
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 16px;
        font-weight: 500;
        ${type === 'success'
            ? 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;'
            : 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;'
        }
    `;
    messageDiv.textContent = message;

    // Insert message at top of form
    postForm.insertBefore(messageDiv, postForm.firstChild);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
};

// Handle cancel button
const handleCancel = () => {
    if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
        window.location.href = 'index.html';
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);