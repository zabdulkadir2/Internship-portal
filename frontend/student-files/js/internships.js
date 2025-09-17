import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, query, orderBy, where, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const internshipContainer = document.querySelector('.internship-cards-grid');
const searchInput = document.querySelector('.search-input');
const loadingIndicator = document.createElement('div');

// State
let allInternships = [];
let filteredInternships = [];

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

        // Setup loading indicator
        setupLoadingIndicator();

        // Load internships
        await loadInternships();

        // Setup search functionality
        setupSearch();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load internships. Please refresh the page.');
    }
};

// Setup loading indicator
const setupLoadingIndicator = () => {
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.style.cssText = `
        text-align: center;
        padding: 40px;
        color: #6b7280;
        font-size: 16px;
    `;
    loadingIndicator.textContent = 'Loading internships...';
};

// Load internships from Firestore
const loadInternships = async () => {
    try {
        showLoading();

        // Query active internships
        const q = query(
            collection(db, 'internships'),
            where('status', '==', 'active'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const querySnapshot = await getDocs(q);
        allInternships = [];

        querySnapshot.forEach((doc) => {
            allInternships.push({
                id: doc.id,
                ...doc.data()
            });
        });

        filteredInternships = [...allInternships];
        displayInternships(filteredInternships);

    } catch (error) {
        console.error('Error loading internships:', error);
        showError('Failed to load internships. Please try again.');
    } finally {
        hideLoading();
    }
};

// Display internships
const displayInternships = (internships) => {
    if (!internshipContainer) return;

    if (internships.length === 0) {
        internshipContainer.innerHTML = `
            <div class="no-internships" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #6b7280;">
                <h3>No internships found</h3>
                <p>Try adjusting your search criteria or check back later for new opportunities.</p>
            </div>
        `;
        return;
    }

    internshipContainer.innerHTML = internships.map(internship => `
        <div class="internship-card" data-id="${internship.id}">
            <div class="internship-header">
                <h3 class="internship-title">${escapeHtml(internship.title)}</h3>
                <div class="company-info">
                    ${escapeHtml(internship.companyName)} • ${escapeHtml(internship.location || 'Location not specified')} • ${escapeHtml(internship.duration || 'Duration not specified')}
                </div>
            </div>

            <div class="internship-details">
                <p class="description">${escapeHtml(truncateText(internship.description, 150))}</p>

                ${internship.requiredSkills && internship.requiredSkills.length > 0 ? `
                    <div class="skills-section">
                        <strong>Required Skills:</strong>
                        <div class="skills-tags">
                            ${internship.requiredSkills.slice(0, 4).map(skill =>
                                `<span class="skill-tag">${escapeHtml(skill)}</span>`
                            ).join('')}
                            ${internship.requiredSkills.length > 4 ? '<span class="skill-tag">+more</span>' : ''}
                        </div>
                    </div>
                ` : ''}

                <div class="internship-meta">
                    <div class="meta-item">
                        <strong>Type:</strong> ${escapeHtml(internship.type || 'Not specified')}
                    </div>
                    ${internship.stipend ? `
                        <div class="meta-item">
                            <strong>Compensation:</strong> ${escapeHtml(internship.stipend)}
                        </div>
                    ` : ''}
                    ${internship.deadline ? `
                        <div class="meta-item">
                            <strong>Deadline:</strong> ${formatDate(internship.deadline)}
                        </div>
                    ` : ''}
                </div>
            </div>

            <div class="internship-actions">
                <button class="btn btn-primary apply-btn" data-id="${internship.id}">
                    Apply Now
                </button>
                <button class="btn btn-secondary save-btn" data-id="${internship.id}">
                    Save
                </button>
            </div>
        </div>
    `).join('');

    // Add event listeners for apply and save buttons
    setupInternshipActions();
};

// Setup search functionality
const setupSearch = () => {
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();

        if (searchTerm === '') {
            filteredInternships = [...allInternships];
        } else {
            filteredInternships = allInternships.filter(internship =>
                internship.title.toLowerCase().includes(searchTerm) ||
                internship.description.toLowerCase().includes(searchTerm) ||
                internship.companyName.toLowerCase().includes(searchTerm) ||
                (internship.requiredSkills && internship.requiredSkills.some(skill =>
                    skill.toLowerCase().includes(searchTerm)
                )) ||
                (internship.location && internship.location.toLowerCase().includes(searchTerm))
            );
        }

        displayInternships(filteredInternships);
    });
};

// Setup internship actions (apply and save)
const setupInternshipActions = () => {
    const applyBtns = document.querySelectorAll('.apply-btn');
    const saveBtns = document.querySelectorAll('.save-btn');

    applyBtns.forEach(btn => {
        btn.addEventListener('click', handleApply);
    });

    saveBtns.forEach(btn => {
        btn.addEventListener('click', handleSave);
    });
};

// Handle apply button click
const handleApply = async (e) => {
    const internshipId = e.target.getAttribute('data-id');
    const internship = allInternships.find(i => i.id === internshipId);

    if (!internship) return;

    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Applying...';

    try {
        // Import and use the submitApplication function
        const { submitApplication } = await import('./applications.js');

        const result = await submitApplication(internshipId, internship);

        if (result.success) {
            btn.textContent = 'Applied ✓';
            btn.style.backgroundColor = '#10b981';
            btn.disabled = true;

            // Show success message
            showNotification('Application submitted successfully!', 'success');
        }

    } catch (error) {
        console.error('Application error:', error);

        if (error.message.includes('already applied')) {
            btn.textContent = 'Already Applied';
            btn.style.backgroundColor = '#6b7280';
            btn.disabled = true;
        } else {
            showNotification('Failed to submit application. Please try again.', 'error');
            btn.disabled = false;
            btn.textContent = 'Apply Now';
        }
    }
};

// Handle save button click
const handleSave = async (e) => {
    const internshipId = e.target.getAttribute('data-id');

    // Toggle save state (visual feedback)
    const btn = e.target;
    if (btn.textContent === 'Save') {
        btn.textContent = 'Saved';
        btn.style.backgroundColor = '#10b981';
    } else {
        btn.textContent = 'Save';
        btn.style.backgroundColor = '';
    }

    // TODO: Implement proper save to user's saved internships
    console.log('Internship saved:', internshipId);
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

const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const showLoading = () => {
    if (internshipContainer) {
        internshipContainer.innerHTML = '';
        internshipContainer.appendChild(loadingIndicator);
    }
};

const hideLoading = () => {
    if (loadingIndicator.parentNode) {
        loadingIndicator.remove();
    }
};

const showError = (message) => {
    if (internshipContainer) {
        internshipContainer.innerHTML = `
            <div class="error-message" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 16px;">Retry</button>
            </div>
        `;
    }
};

const showNotification = (message, type = 'info') => {
    // Remove existing notifications
    const existingNotification = document.querySelector('.toast-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'toast-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        ${type === 'success'
            ? 'background-color: #10b981;'
            : type === 'error'
            ? 'background-color: #ef4444;'
            : 'background-color: #3b82f6;'
        }
    `;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 4000);
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);