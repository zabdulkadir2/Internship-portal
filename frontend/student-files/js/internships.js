import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const internshipContainer = document.querySelector('.internship-cards-grid');
const popularInternshipsContainer = document.querySelector('#popular-internships .internship-cards-grid');
const applicationsTableBody = document.querySelector('#my-applications tbody');
const searchInput = document.querySelector('.search-input');
const searchButton = document.querySelector('.search-button');
const filterSelects = document.querySelectorAll('.filter-select');
const applyFiltersButton = document.querySelector('.apply-filters-button');
const loadingIndicator = document.createElement('div');

// State
let allInternships = [];
let filteredInternships = [];
let currentLimit = 50;
let totalInternshipsAvailable = 0;

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

        // Note: Logout now handled by shared navbar

        // Setup loading indicator
        setupLoadingIndicator();

        // Load internships
        await loadInternships();

        // Load popular internships
        await loadPopularInternships();

        // Load user applications
        await loadUserApplications();

        // Setup search and filter functionality
        setupSearchAndFilters();

        // Setup load more functionality
        setupLoadMoreButton();

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
            limit(currentLimit)
        );

        // Also get total count for load more functionality
        const countQuery = query(
            collection(db, 'internships'),
            where('status', '==', 'active')
        );
        const countSnapshot = await getDocs(countQuery);
        totalInternshipsAvailable = countSnapshot.size;

        const querySnapshot = await getDocs(q);
        allInternships = [];

        querySnapshot.forEach((doc) => {
            allInternships.push({
                id: doc.id,
                ...doc.data()
            });
        });

        filteredInternships = [...allInternships];
        await displayInternships(filteredInternships);
        updateLoadMoreButton();

    } catch (error) {
        console.error('Error loading internships:', error);
        showError('Failed to load internships. Please try again.');
    } finally {
        hideLoading();
    }
};

// Display internships
const displayInternships = async (internships) => {
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
            <div class="company-logo-name">
                <img src="https://placehold.co/50x50/CBD5E1/475569?text=${escapeHtml(internship.companyName.charAt(0))}"
                     alt="${escapeHtml(internship.companyName)} Logo"
                     class="company-logo" />
                <h3 class="job-title">${escapeHtml(internship.title)}</h3>
            </div>

            <p class="company-info">${escapeHtml(internship.companyName)}</p>
            <p class="details">📍 ${escapeHtml(internship.location || 'Location not specified')} | 🕒 ${escapeHtml(internship.duration || 'Duration not specified')}${internship.deadline ? ` | 📅 ${formatDate(internship.deadline)}` : ''}</p>

            <p class="description">${escapeHtml(truncateText(internship.description, 150))}</p>

            ${internship.requiredSkills && internship.requiredSkills.length > 0 ? `
                <div style="margin-bottom: 1rem;">
                    <strong>Required Skills:</strong> ${internship.requiredSkills.slice(0, 3).map(skill => escapeHtml(skill)).join(', ')}${internship.requiredSkills.length > 3 ? ', +more' : ''}
                </div>
            ` : ''}

            <div class="tags">
                ${internship.location && internship.location.toLowerCase().includes('remote') ? '<span class="tag tag-remote">Remote</span>' : '<span class="tag tag-onsite">Onsite</span>'}
                ${internship.stipend && !internship.stipend.toLowerCase().includes('unpaid') ? '<span class="tag tag-paid">Paid</span>' : '<span class="tag tag-unpaid">Unpaid</span>'}
                ${internship.type && internship.type.toLowerCase().includes('full') ? '<span class="tag tag-fulltime">Full-time</span>' : ''}
            </div>

            <a href="#" class="btn-accent-yellow apply-button" data-id="${internship.id}">Apply Now</a>
        </div>
    `).join('');

    // Add event listeners for apply and save buttons
    setupInternshipActions();

    // Update button states for existing applications
    await updateExistingApplicationButtons();
};

// Load popular internships (same as main list but limited to 3)
const loadPopularInternships = async () => {
    try {
        if (!popularInternshipsContainer) return;

        // Get a subset of popular internships (limit to 3)
        const popularInternships = allInternships.slice(0, 3);

        if (popularInternships.length === 0) {
            popularInternshipsContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #6b7280;">
                    <p>No popular internships available at the moment.</p>
                </div>
            `;
            return;
        }

        popularInternshipsContainer.innerHTML = popularInternships.map(internship => `
            <div class="internship-card" data-id="${internship.id}">
                <div class="company-logo-name">
                    <img src="https://placehold.co/50x50/CBD5E1/475569?text=${escapeHtml(internship.companyName.charAt(0))}"
                         alt="${escapeHtml(internship.companyName)} Logo"
                         class="company-logo" />
                    <h3 class="job-title">${escapeHtml(internship.title)}</h3>
                </div>

                <p class="company-info">${escapeHtml(internship.companyName)}</p>
                <p class="details">📍 ${escapeHtml(internship.location || 'Location not specified')} | 🕒 ${escapeHtml(internship.duration || 'Duration not specified')}${internship.deadline ? ` | 📅 ${formatDate(internship.deadline)}` : ''}</p>

                <p class="description">${escapeHtml(truncateText(internship.description, 150))}</p>

                <div class="tags">
                    ${internship.location && internship.location.toLowerCase().includes('remote') ? '<span class="tag tag-remote">Remote</span>' : '<span class="tag tag-onsite">Onsite</span>'}
                    ${internship.stipend && !internship.stipend.toLowerCase().includes('unpaid') ? '<span class="tag tag-paid">Paid</span>' : '<span class="tag tag-unpaid">Unpaid</span>'}
                    ${internship.type && internship.type.toLowerCase().includes('full') ? '<span class="tag tag-fulltime">Full-time</span>' : ''}
                </div>

                <a href="#" class="btn-accent-yellow apply-button" data-id="${internship.id}">Apply Now</a>
            </div>
        `).join('');

        // Setup event listeners for popular internships apply buttons
        const popularApplyBtns = popularInternshipsContainer.querySelectorAll('.apply-button');
        popularApplyBtns.forEach(btn => {
            btn.addEventListener('click', handleApply);
        });

    } catch (error) {
        console.error('Error loading popular internships:', error);
    }
};

// Load user applications
const loadUserApplications = async () => {
    try {
        if (!applicationsTableBody) return;

        const userData = await getCurrentUser();
        if (!userData) return;

        // Query user applications
        const q = query(
            collection(db, 'applications'),
            where('studentId', '==', userData.uid),
            limit(10)
        );

        const querySnapshot = await getDocs(q);
        const applications = [];

        querySnapshot.forEach((doc) => {
            applications.push({
                id: doc.id,
                ...doc.data()
            });
        });

        if (applications.length === 0) {
            applicationsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px; color: #6b7280;">
                        No applications submitted yet. <a href="#internship-listings" style="color: #1E3A8A;">Apply to internships</a> to see them here.
                    </td>
                </tr>
            `;
            return;
        }

        applicationsTableBody.innerHTML = applications.map(application => `
            <tr>
                <td>${escapeHtml(application.internshipTitle || 'N/A')}</td>
                <td>${escapeHtml(application.companyName || 'N/A')}</td>
                <td>${application.appliedAt ? formatDate(application.appliedAt.toDate()) : 'N/A'}</td>
                <td>
                    <span class="status-tag status-${application.status || 'pending'}">${application.status || 'Pending'}</span>
                </td>
                <td>
                    ${application.status !== 'rejected' && application.status !== 'withdrawn' ?
                        `<button class="action-button withdraw-btn" data-id="${application.id}">Withdraw</button>` : ''
                    }
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Error loading user applications:', error);
        if (applicationsTableBody) {
            applicationsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 20px; color: #dc2626;">
                        Error loading applications. Please refresh the page.
                    </td>
                </tr>
            `;
        }
    }
};

// Setup search and filter functionality
const setupSearchAndFilters = () => {
    if (!searchInput) return;

    // Search functionality
    const performSearch = async () => {
        await applyFiltersAndSearch();
    };

    // Search input event
    searchInput.addEventListener('input', performSearch);

    // Search button click
    if (searchButton) {
        searchButton.addEventListener('click', (e) => {
            e.preventDefault();
            performSearch();
        });
    }

    // Filter change events
    filterSelects.forEach(select => {
        select.addEventListener('change', async () => {
            await applyFiltersAndSearch();
        });
    });

    // Apply filters button
    if (applyFiltersButton) {
        applyFiltersButton.addEventListener('click', async (e) => {
            e.preventDefault();
            await applyFiltersAndSearch();
        });
    }
};

// Apply search and filters
const applyFiltersAndSearch = async () => {
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // Get filter values
    const filters = {};
    filterSelects.forEach(select => {
        const value = select.value;
        if (value) {
            // Determine filter type based on the select options
            if (select.querySelector('option[value="tech-innovations"]')) {
                filters.company = value;
            } else if (select.querySelector('option[value="remote"]')) {
                filters.location = value;
            } else if (select.querySelector('option[value="tech"]')) {
                filters.category = value;
            } else if (select.querySelector('option[value="1-3-months"]')) {
                filters.duration = value;
            }
        }
    });

    // Apply search and filters
    filteredInternships = allInternships.filter(internship => {
        // Search filter
        let matchesSearch = true;
        if (searchTerm) {
            matchesSearch =
                internship.title.toLowerCase().includes(searchTerm) ||
                internship.description.toLowerCase().includes(searchTerm) ||
                internship.companyName.toLowerCase().includes(searchTerm) ||
                (internship.requiredSkills && internship.requiredSkills.some(skill =>
                    skill.toLowerCase().includes(searchTerm)
                )) ||
                (internship.location && internship.location.toLowerCase().includes(searchTerm));
        }

        // Company filter
        let matchesCompany = true;
        if (filters.company) {
            const companyMap = {
                'tech-innovations': 'Tech Innovations Inc.',
                'growth-sparks': 'Growth Sparks Agency',
                'insightful-solutions': 'Insightful Solutions',
                'creative-minds': 'Creative Minds Studio',
                'global-solutions': 'Global Solutions Ltd.'
            };
            matchesCompany = internship.companyName === companyMap[filters.company];
        }

        // Location filter
        let matchesLocation = true;
        if (filters.location) {
            const location = internship.location ? internship.location.toLowerCase() : '';
            if (filters.location === 'remote') {
                matchesLocation = location.includes('remote');
            } else if (filters.location === 'accra') {
                matchesLocation = location.includes('accra');
            } else if (filters.location === 'kumasi') {
                matchesLocation = location.includes('kumasi');
            } else if (filters.location === 'hybrid') {
                matchesLocation = location.includes('hybrid');
            }
        }

        // Category filter (based on title/description keywords)
        let matchesCategory = true;
        if (filters.category) {
            const title = internship.title.toLowerCase();
            const description = internship.description.toLowerCase();
            const skills = internship.requiredSkills ? internship.requiredSkills.join(' ').toLowerCase() : '';

            switch (filters.category) {
                case 'tech':
                    matchesCategory = title.includes('developer') || title.includes('engineer') ||
                                    title.includes('software') || skills.includes('programming') ||
                                    skills.includes('javascript') || skills.includes('python');
                    break;
                case 'business':
                    matchesCategory = title.includes('marketing') || title.includes('business') ||
                                    title.includes('sales') || description.includes('marketing');
                    break;
                case 'design':
                    matchesCategory = title.includes('design') || title.includes('ui') ||
                                    title.includes('ux') || skills.includes('design');
                    break;
                case 'data':
                    matchesCategory = title.includes('data') || title.includes('analyst') ||
                                    skills.includes('sql') || skills.includes('python');
                    break;
                case 'finance':
                    matchesCategory = title.includes('finance') || title.includes('accounting') ||
                                    description.includes('finance');
                    break;
            }
        }

        // Duration filter
        let matchesDuration = true;
        if (filters.duration) {
            const duration = internship.duration ? internship.duration.toLowerCase() : '';
            const type = internship.type ? internship.type.toLowerCase() : '';

            switch (filters.duration) {
                case '1-3-months':
                    matchesDuration = duration.includes('month') &&
                                    (duration.includes('1') || duration.includes('2') || duration.includes('3'));
                    break;
                case '3-6-months':
                    matchesDuration = duration.includes('month') &&
                                    (duration.includes('3') || duration.includes('4') || duration.includes('5') || duration.includes('6'));
                    break;
                case 'full-time':
                    matchesDuration = type.includes('full') || duration.includes('full');
                    break;
                case 'deadline-soon':
                    // Check if deadline is within next 30 days
                    if (internship.deadline) {
                        const deadline = new Date(internship.deadline);
                        const thirtyDaysFromNow = new Date();
                        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                        matchesDuration = deadline <= thirtyDaysFromNow;
                    } else {
                        matchesDuration = false;
                    }
                    break;
            }
        }

        return matchesSearch && matchesCompany && matchesLocation && matchesCategory && matchesDuration;
    });

    // Update the display
    await displayInternships(filteredInternships);

    // Show results count
    showFilterResults();

    // Update load more button
    updateLoadMoreButton();
};

// Show filter results count
const showFilterResults = () => {
    const resultsInfo = document.querySelector('.filter-results-info');
    if (resultsInfo) {
        resultsInfo.remove();
    }

    const searchSection = document.querySelector('.search-filter-section');
    if (searchSection && filteredInternships.length !== allInternships.length) {
        const info = document.createElement('div');
        info.className = 'filter-results-info';
        info.style.cssText = `
            text-align: center;
            margin-top: 1rem;
            padding: 1rem;
            background-color: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 6px;
            color: #0369a1;
        `;
        info.innerHTML = `
            <p><strong>Showing ${filteredInternships.length} of ${allInternships.length} internships</strong></p>
            <button onclick="clearAllFilters()" style="
                background-color: #0ea5e9;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 0.5rem;
            ">Clear All Filters</button>
        `;
        searchSection.appendChild(info);
    }
};

// Clear all filters function (global scope for onclick)
window.clearAllFilters = async () => {
    // Clear search input
    if (searchInput) {
        searchInput.value = '';
    }

    // Reset all filter selects
    filterSelects.forEach(select => {
        select.value = '';
    });

    // Reset to show all internships
    filteredInternships = [...allInternships];
    await displayInternships(filteredInternships);

    // Remove results info
    const resultsInfo = document.querySelector('.filter-results-info');
    if (resultsInfo) {
        resultsInfo.remove();
    }
};

// Setup internship actions (apply and save)
const setupInternshipActions = () => {
    const applyBtns = document.querySelectorAll('.apply-button');

    applyBtns.forEach(btn => {
        btn.addEventListener('click', handleApply);
    });
};

// Handle apply button click
const handleApply = async (e) => {
    e.preventDefault();

    console.log('Apply button clicked!');

    const internshipId = e.target.getAttribute('data-id');
    const internship = allInternships.find(i => i.id === internshipId);

    console.log('Internship ID:', internshipId);
    console.log('Found internship:', internship);

    if (!internship) {
        console.error('Internship not found for ID:', internshipId);
        return;
    }

    try {
        // Check if user has already applied to this internship and determine if re-application is allowed
        const userData = await getCurrentUser();
        if (userData) {
            const applicationCheck = await checkIfAlreadyApplied(internshipId, userData.uid);

            if (applicationCheck.hasApplication && !applicationCheck.canReapply) {
                // Update button based on application status
                updateApplyButtonForExistingApplication(e.target, applicationCheck);
                showNotification(applicationCheck.message, 'info');
                return;
            } else if (applicationCheck.hasApplication && applicationCheck.canReapply) {
                // User can re-apply, show different message
                console.log('User can re-apply for this position');
                showNotification(`${applicationCheck.message}`, 'info');
            }
        }

        // Open application form modal
        console.log('Checking for openApplicationModal function:', typeof window.openApplicationModal);

        // Force wait for module to load if not available
        if (typeof window.openApplicationModal !== 'function') {
            console.log('Modal function not available, forcing module load...');
            try {
                await import('./application-form.js');
                // Give it more time to initialize
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error('Error loading application form module:', error);
            }
        }

        if (typeof window.openApplicationModal === 'function') {
            console.log('Opening application modal for:', internship.title);
            window.openApplicationModal(internship);
        } else {
            console.error('Application modal function still not available, using fallback');
            // Fallback to direct application
            await handleDirectApplication(internshipId, internship, e.target);
        }

    } catch (error) {
        console.error('Application error:', error);
        showNotification('Error opening application form. Please try again.', 'error');
    }
};

// Check if user has already applied and determine if re-application is allowed
const checkIfAlreadyApplied = async (internshipId, studentId) => {
    try {
        // Check Firebase directly for existing application
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

        const q = query(
            collection(db, 'applications'),
            where('internshipId', '==', internshipId),
            where('studentId', '==', studentId)
        );

        const querySnapshot = await getDocs(q);
        const existingApplications = [];

        querySnapshot.forEach((doc) => {
            existingApplications.push({
                id: doc.id,
                ...doc.data()
            });
        });

        if (existingApplications.length === 0) {
            return { hasApplication: false, canReapply: true, status: null, application: null };
        }

        // Get the most recent application (in case there are multiple)
        const mostRecentApp = existingApplications.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return dateB - dateA;
        })[0];

        const status = mostRecentApp.status || 'pending';
        const canReapply = canReapplyBasedOnStatus(status);

        console.log('Existing application found:', { status, canReapply });

        return {
            hasApplication: true,
            canReapply: canReapply,
            status: status,
            application: mostRecentApp,
            message: getApplicationStatusMessage(status, canReapply)
        };

    } catch (error) {
        console.error('Error checking existing applications:', error);
        return { hasApplication: false, canReapply: true, status: null, application: null };
    }
};

// Determine if re-application is allowed based on current status
const canReapplyBasedOnStatus = (status) => {
    const allowReapplicationStatuses = [
        'rejected',      // Student was not selected, can improve and try again
        'withdrawn'      // Student voluntarily withdrew, can re-apply
    ];

    const blockReapplicationStatuses = [
        'pending',              // Application is still being reviewed
        'applied',              // Same as pending, under initial review
        'under-review',         // Currently being evaluated
        'reviewing',            // Currently being evaluated (alternative name)
        'interview-scheduled',  // Interview process is active
        'interview',            // Interview process is active
        'shortlisted',          // Student is in final consideration
        'accepted',             // Student was accepted
        'hired'                 // Student got the position
    ];

    // Default to allowing if status is unknown
    if (!status) return true;

    // Explicit allow statuses
    if (allowReapplicationStatuses.includes(status.toLowerCase())) {
        return true;
    }

    // Explicit block statuses
    if (blockReapplicationStatuses.includes(status.toLowerCase())) {
        return false;
    }

    // Default to allowing for unknown statuses
    return true;
};

// Get user-friendly message about application status
const getApplicationStatusMessage = (status, canReapply) => {
    const statusMessages = {
        'pending': 'Your application is pending review',
        'applied': 'Your application is pending review',
        'under-review': 'Your application is currently under review',
        'reviewing': 'Your application is currently under review',
        'interview-scheduled': 'You have an interview scheduled for this position',
        'interview': 'You have an interview scheduled for this position',
        'shortlisted': 'Congratulations! You have been shortlisted for this position',
        'accepted': 'Congratulations! You have been accepted for this position',
        'hired': 'Congratulations! You have been hired for this position',
        'rejected': 'Your previous application was not selected. You can apply again with an improved profile.',
        'withdrawn': 'You previously withdrew your application. You can apply again if interested.'
    };

    return statusMessages[status] || (canReapply ? 'You can apply for this position' : 'You have already applied for this position');
};

// Update apply button appearance based on application status
const updateApplyButtonForExistingApplication = (btn, applicationCheck) => {
    const { status, canReapply } = applicationCheck;

    // Update button text and style based on status
    const buttonConfig = getButtonConfigForStatus(status, canReapply);

    btn.textContent = buttonConfig.text;
    btn.style.backgroundColor = buttonConfig.color;
    btn.style.pointerEvents = buttonConfig.disabled ? 'none' : 'auto';
    btn.style.cursor = buttonConfig.disabled ? 'not-allowed' : 'pointer';

    // Add status class for additional styling
    btn.classList.add(`btn-status-${status}`);
};

// Get button configuration based on application status
const getButtonConfigForStatus = (status, canReapply) => {
    const statusConfigs = {
        'pending': { text: 'Application Pending', color: '#fbbf24', disabled: true },
        'applied': { text: 'Application Pending', color: '#fbbf24', disabled: true },
        'under-review': { text: 'Under Review', color: '#3b82f6', disabled: true },
        'reviewing': { text: 'Under Review', color: '#3b82f6', disabled: true },
        'interview-scheduled': { text: 'Interview Scheduled', color: '#8b5cf6', disabled: true },
        'interview': { text: 'Interview Scheduled', color: '#8b5cf6', disabled: true },
        'shortlisted': { text: 'Shortlisted ⭐', color: '#10b981', disabled: true },
        'accepted': { text: 'Accepted ✓', color: '#10b981', disabled: true },
        'hired': { text: 'Hired ✓', color: '#10b981', disabled: true },
        'rejected': { text: 'Apply Again', color: '#1E3A8A', disabled: false },
        'withdrawn': { text: 'Apply Again', color: '#1E3A8A', disabled: false }
    };

    return statusConfigs[status] || {
        text: canReapply ? 'Apply Now' : 'Applied',
        color: canReapply ? '#1E3A8A' : '#6b7280',
        disabled: !canReapply
    };
};

// Update button states for existing applications when page loads
const updateExistingApplicationButtons = async () => {
    try {
        const userData = await getCurrentUser();
        if (!userData) return;

        const applyButtons = document.querySelectorAll('.apply-button');

        for (const btn of applyButtons) {
            const internshipId = btn.getAttribute('data-id');
            if (internshipId) {
                const applicationCheck = await checkIfAlreadyApplied(internshipId, userData.uid);

                if (applicationCheck.hasApplication) {
                    updateApplyButtonForExistingApplication(btn, applicationCheck);
                }
            }
        }

        console.log('Updated button states for existing applications');

    } catch (error) {
        console.error('Error updating existing application buttons:', error);
    }
};

// Fallback direct application (legacy method)
const handleDirectApplication = async (internshipId, internship, btn) => {
    btn.style.pointerEvents = 'none';
    btn.textContent = 'Applying...';

    try {
        // Wait for applications.js to load if not already loaded
        if (typeof window.submitApplication !== 'function') {
            await import('./applications.js');
            // Wait a bit more for the function to be available
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (typeof window.submitApplication !== 'function') {
            throw new Error('Application system not available. Please refresh the page.');
        }

        const result = await window.submitApplication(internshipId, internship);

        if (result.success) {
            btn.textContent = 'Applied ✓';
            btn.style.backgroundColor = '#10b981';
            btn.style.pointerEvents = 'none';

            // Show success message
            showNotification('Application submitted successfully!', 'success');
        }

    } catch (error) {
        console.error('Application error:', error);

        if (error.message.includes('already applied')) {
            btn.textContent = 'Already Applied';
            btn.style.backgroundColor = '#6b7280';
            btn.style.pointerEvents = 'none';
        } else {
            showNotification('Failed to submit application. Please try again.', 'error');
            btn.style.pointerEvents = 'auto';
            btn.textContent = 'Apply Now';
        }
    }
};

// Setup load more button functionality
const setupLoadMoreButton = () => {
    const loadMoreBtn = document.querySelector('.section-footer-link .btn-secondary');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', handleLoadMore);
    }
};

// Handle load more button click
const handleLoadMore = async (e) => {
    e.preventDefault();

    const btn = e.target;
    const originalText = btn.textContent;
    btn.textContent = 'Loading...';
    btn.disabled = true;

    try {
        // Increase the limit
        currentLimit += 50;

        // Reload internships with new limit
        await loadInternships();

        // Show success message
        showNotification(`Loaded ${allInternships.length} internships`, 'success');

    } catch (error) {
        console.error('Error loading more internships:', error);
        showNotification('Failed to load more internships. Please try again.', 'error');

        // Reset button
        btn.textContent = originalText;
        btn.disabled = false;

        // Reset limit
        currentLimit -= 50;
    }
};

// Update load more button visibility and text
const updateLoadMoreButton = () => {
    const loadMoreBtn = document.querySelector('.section-footer-link .btn-secondary');
    const loadMoreSection = document.querySelector('.section-footer-link');

    if (loadMoreBtn && loadMoreSection) {
        if (allInternships.length >= totalInternshipsAvailable) {
            // Hide button if all internships are loaded
            loadMoreSection.style.display = 'none';
        } else {
            // Show button with count information
            loadMoreSection.style.display = 'block';
            loadMoreBtn.textContent = `Load More Internships (${allInternships.length}/${totalInternshipsAvailable})`;
            loadMoreBtn.disabled = false;
        }
    }
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

// Get status display name for applications
const getStatusDisplayName = (status) => {
    const statusMap = {
        'pending': 'Pending Review',
        'applied': 'Applied',
        'under-review': 'Under Review',
        'interview-scheduled': 'Interview Scheduled',
        'shortlisted': 'Shortlisted',
        'accepted': 'Accepted',
        'hired': 'Hired',
        'rejected': 'Rejected',
        'withdrawn': 'Withdrawn'
    };
    return statusMap[status] || 'Applied';
};

// View application details function
const viewApplicationDetails = (applicationId) => {
    // Find the application in the userApplications array
    // Since userApplications might not be available in this context, let's use a different approach
    // We can find the application from the table or make a direct query

    console.log('Viewing application details for ID:', applicationId);

    // For now, implement a simple alert - can be enhanced to show a modal later
    const tableRow = document.querySelector(`button[data-id="${applicationId}"]`)?.closest('tr');
    if (tableRow) {
        const cells = tableRow.querySelectorAll('td');
        const internshipTitle = cells[0]?.textContent || 'N/A';
        const companyName = cells[1]?.textContent || 'N/A';
        const applicationDate = cells[2]?.textContent || 'N/A';
        const status = cells[3]?.textContent?.trim() || 'N/A';

        alert(`Application Details:\n\nPosition: ${internshipTitle}\nCompany: ${companyName}\nApplication Date: ${applicationDate}\nStatus: ${status}`);
    } else {
        alert('Application details not found.');
    }
};

// Set up event listeners for application action buttons
const setupApplicationActionListeners = () => {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-details-btn')) {
            e.preventDefault();
            const applicationId = e.target.dataset.id;
            viewApplicationDetails(applicationId);
        } else if (e.target.classList.contains('withdraw-btn')) {
            e.preventDefault();
            const applicationId = e.target.dataset.id;
            // TODO: Implement withdraw functionality
            console.log('Withdraw application:', applicationId);
            alert('Withdraw functionality will be implemented soon.');
        }
    });
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initPage();
    setupApplicationActionListeners();
});