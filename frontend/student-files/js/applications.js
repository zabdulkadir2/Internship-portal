import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, addDoc, query, where, orderBy, serverTimestamp, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const applicationsLoading = document.getElementById('applications-loading');
const applicationsContent = document.getElementById('applications-content');
const applicationsContainer = document.querySelector('.applications-list');
const statusFilter = document.getElementById('status-filter');
const companyFilter = document.getElementById('company-filter');
const sortFilter = document.getElementById('sort-filter');
const applyFiltersBtn = document.getElementById('apply-filters-btn');

// State
let userApplications = [];
let filteredApplications = [];
let currentUser = null;

// Initialize page
const initPage = async () => {
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

        // Setup event handlers
        setupEventHandlers();

        // Load applications
        await loadApplications();

        // Setup real-time listeners
        setupRealTimeListeners();

        // Hide loading and show content
        hideLoading();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load applications. Please refresh the page.');
        hideLoading();
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    applyFiltersBtn?.addEventListener('click', applyFilters);
    statusFilter?.addEventListener('change', applyFilters);
    companyFilter?.addEventListener('change', applyFilters);
    sortFilter?.addEventListener('change', applyFilters);

    // Setup action button handlers
    setupActionHandlers();

    // Setup modal handlers
    setupModalHandlers();
};

// Setup real-time listeners for applications and shortlists
const setupRealTimeListeners = () => {
    if (!currentUser) return;

    // Listen for application changes
    const applicationsQuery = query(
        collection(db, 'applications'),
        where('studentId', '==', currentUser.uid)
    );

    onSnapshot(applicationsQuery, (snapshot) => {
        let hasChanges = false;
        const newApplications = [];

        snapshot.forEach((doc) => {
            const appData = { id: doc.id, ...doc.data() };
            newApplications.push(appData);

            // Check if this is an existing application with status change
            const existingApp = userApplications.find(app => app.id === doc.id);
            if (existingApp && existingApp.status !== appData.status) {
                hasChanges = true;
                showStatusChangeNotification(appData, existingApp.status);
            }
        });

        // Sort applications by creation date (newest first)
        newApplications.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
            return dateB - dateA;
        });

        // Update applications if there are changes
        if (hasChanges || newApplications.length !== userApplications.length) {
            userApplications = newApplications;
            loadShortlistStatus().then(() => {
                updateSummaryStats();
                filteredApplications = [...userApplications];
                applyFilters(); // This will refresh the display
            });
        }
    }, (error) => {
        console.error('Error in applications listener:', error);
    });

    // Listen for shortlist changes
    const shortlistQuery = query(
        collection(db, 'shortlists'),
        where('studentId', '==', currentUser.uid)
    );

    onSnapshot(shortlistQuery, (snapshot) => {
        let hasNewShortlists = false;

        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                hasNewShortlists = true;
                const shortlistData = change.doc.data();
                showShortlistNotification(shortlistData);
            }
        });

        if (hasNewShortlists) {
            // Reload shortlist status and refresh display
            loadShortlistStatus().then(() => {
                updateSummaryStats();
                displayApplications();
            });
        }
    }, (error) => {
        console.error('Error in shortlist listener:', error);
    });
};

// Load user applications
const loadApplications = async () => {
    try {
        // Load applications and shortlist status in parallel
        await Promise.all([
            loadUserApplications(),
            loadShortlistStatus()
        ]);

        // Populate company filter
        populateCompanyFilter();

        // Update summary stats
        updateSummaryStats();

        // Display applications
        filteredApplications = [...userApplications];
        displayApplications();

    } catch (error) {
        console.error('Error loading applications:', error);
        showError('Failed to load applications. Please try again.');
    }
};

// Load user applications from Firestore
const loadUserApplications = async () => {
    const q = query(
        collection(db, 'applications'),
        where('studentId', '==', currentUser.uid)
    );

    const querySnapshot = await getDocs(q);
    userApplications = [];

    querySnapshot.forEach((doc) => {
        userApplications.push({
            id: doc.id,
            ...doc.data()
        });
    });

    // Sort applications by creation date (newest first)
    userApplications.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return dateB - dateA;
    });

    console.log('Loaded applications:', userApplications.length);

    // Debug: Log all application statuses
    console.log('Application statuses:', userApplications.map(app => ({
        title: app.internshipTitle,
        status: app.status,
        shortlisted: app.shortlisted
    })));
};

// Load shortlist status for this student
const loadShortlistStatus = async () => {
    try {
        const shortlistQuery = query(
            collection(db, 'shortlists'),
            where('studentId', '==', currentUser.uid)
        );

        const shortlistSnapshot = await getDocs(shortlistQuery);
        const shortlisted = new Set();

        shortlistSnapshot.docs.forEach(doc => {
            const data = doc.data();
            // Create a key combining company and internship (if specific)
            const key = data.internshipId && data.internshipId !== 'general'
                ? `${data.companyId}_${data.internshipId}`
                : data.companyId;
            shortlisted.add(key);
        });

        // Update application statuses if they're shortlisted
        userApplications.forEach(app => {
            const specificKey = `${app.companyId}_${app.internshipId}`;
            const generalKey = app.companyId;

            if (shortlisted.has(specificKey) || shortlisted.has(generalKey)) {
                // Only update if current status isn't more advanced
                if (!app.status || ['applied', 'pending'].includes(app.status)) {
                    app.shortlisted = true;
                }
            }
        });

        console.log('Processed shortlist status for applications');

    } catch (error) {
        console.error('Error loading shortlist status:', error);
        // Continue without shortlist data
    }
};

// Update summary statistics
const updateSummaryStats = () => {
    const totalApps = userApplications.length;
    const reviewedApps = userApplications.filter(app =>
        app.status && !['applied', 'pending'].includes(app.status)
    ).length;
    const activeApps = userApplications.filter(app =>
        !app.status || ['applied', 'pending', 'under-review', 'shortlisted'].includes(app.status)
    ).length;
    const acceptedApps = userApplications.filter(app =>
        app.status === 'accepted' || app.status === 'hired'
    ).length;

    // Update summary cards
    const elements = {
        'total-applications': totalApps,
        'reviewed-applications': reviewedApps,
        'active-applications': activeApps,
        'accepted-applications': acceptedApps
    };

    Object.entries(elements).forEach(([elementId, value]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    });
};

// Populate company filter dropdown
const populateCompanyFilter = () => {
    if (!companyFilter) return;

    const companies = [...new Set(userApplications.map(app => app.companyName))];

    // Clear existing options except the first one
    companyFilter.innerHTML = '<option value="">Filter by Company</option>';

    companies.forEach(company => {
        const option = document.createElement('option');
        option.value = company;
        option.textContent = company;
        companyFilter.appendChild(option);
    });
};

// Apply filters and sorting
const applyFilters = () => {
    const statusValue = statusFilter?.value || '';
    const companyValue = companyFilter?.value || '';
    const sortValue = sortFilter?.value || 'newest';

    // Filter applications
    filteredApplications = userApplications.filter(app => {
        // Status filter
        if (statusValue) {
            if (statusValue === 'shortlisted' && !app.shortlisted) return false;
            if (statusValue !== 'shortlisted' && app.status !== statusValue) return false;
        }

        // Company filter
        if (companyValue && app.companyName !== companyValue) return false;

        return true;
    });

    // Sort applications
    filteredApplications.sort((a, b) => {
        switch (sortValue) {
            case 'newest':
                return new Date(b.createdAt?.toDate?.() || b.createdAt) - new Date(a.createdAt?.toDate?.() || a.createdAt);
            case 'oldest':
                return new Date(a.createdAt?.toDate?.() || a.createdAt) - new Date(b.createdAt?.toDate?.() || b.createdAt);
            case 'status':
                return (a.status || 'applied').localeCompare(b.status || 'applied');
            case 'company':
                return (a.companyName || '').localeCompare(b.companyName || '');
            default:
                return 0;
        }
    });

    // Display filtered results
    displayApplications();
};

// Clear all filters
const clearAllFilters = () => {
    if (statusFilter) statusFilter.value = '';
    if (companyFilter) companyFilter.value = '';
    if (sortFilter) sortFilter.value = 'newest';

    filteredApplications = [...userApplications];
    applyFilters(); // This will sort and display
};

// Make clearAllFilters available globally for the button onclick
window.clearAllFilters = clearAllFilters;

// Display applications
const displayApplications = () => {
    if (!applicationsContainer) return;

    if (filteredApplications.length === 0) {
        if (userApplications.length === 0) {
            applicationsContainer.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 80px 20px; color: #6b7280; background: #f9fafb; border-radius: 12px; border: 2px dashed #d1d5db;">
                    <div style="font-size: 4rem; margin-bottom: 24px; opacity: 0.5;">📄</div>
                    <h3 style="margin-bottom: 12px; color: #374151;">No Applications Yet</h3>
                    <p style="margin-bottom: 32px; max-width: 400px; margin-left: auto; margin-right: auto;">
                        Ready to jumpstart your career? Browse our internship opportunities and submit your first application today!
                    </p>
                    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                        <a href="internship.html" class="btn btn-primary">Browse Internships</a>
                        <a href="student-profile.html" class="btn btn-secondary">Complete Profile</a>
                    </div>
                </div>
            `;
        } else {
            applicationsContainer.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 60px 20px; color: #6b7280; background: #f9fafb; border-radius: 12px;">
                    <div style="font-size: 3rem; margin-bottom: 24px; opacity: 0.5;">🔍</div>
                    <h3 style="margin-bottom: 12px; color: #374151;">No Applications Match Your Filters</h3>
                    <p style="margin-bottom: 32px;">
                        Try adjusting your search criteria or clear all filters to see your applications.
                    </p>
                    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="clearAllFilters()" class="btn btn-primary">Clear All Filters</button>
                        <a href="internship.html" class="btn btn-secondary">Find More Internships</a>
                    </div>
                </div>
            `;
        }
        return;
    }

    // Group applications by status
    const groupedApps = groupApplicationsByStatus(filteredApplications);

    // Debug: Log grouped applications
    console.log('Grouped applications:', groupedApps);
    console.log('Filtered applications:', filteredApplications.map(app => ({
        title: app.internshipTitle,
        status: app.status,
        shortlisted: app.shortlisted
    })));

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
const groupApplicationsByStatus = (applications) => {
    const statusOrder = ['pending', 'applied', 'under-review', 'reviewing', 'interview-scheduled', 'interview', 'shortlisted', 'accepted', 'hired', 'rejected', 'withdrawn'];

    const groups = applications.reduce((groups, app) => {
        let status = app.status || 'pending';

        // Normalize status values
        if (status === 'reviewing') status = 'under-review';
        if (status === 'interview') status = 'interview-scheduled';

        // Handle shortlisted status (shortlisted takes priority for display)
        if (app.shortlisted && (!app.status || ['applied', 'pending'].includes(app.status))) {
            status = 'shortlisted';
        }

        if (!groups[status]) {
            groups[status] = [];
        }
        groups[status].push(app);
        return groups;
    }, {});

    // Debug: Log all groups found
    console.log('All groups found:', Object.keys(groups));
    console.log('Groups with applications:', groups);

    // Return groups in order, but also include any groups not in the order
    const orderedGroups = {};

    // First add groups in the preferred order
    statusOrder.forEach(status => {
        if (groups[status] && groups[status].length > 0) {
            orderedGroups[status] = groups[status];
        }
    });

    // Then add any groups that weren't in the order (to catch unexpected status values)
    Object.keys(groups).forEach(status => {
        if (!statusOrder.includes(status) && groups[status].length > 0) {
            console.warn('Unexpected status found:', status);
            orderedGroups[status] = groups[status];
        }
    });

    return orderedGroups;
};

// Create application card HTML
const createApplicationCard = (application) => {
    // Determine display status (shortlisted takes priority)
    let displayStatus = application.status || 'pending';
    if (application.shortlisted && (!application.status || ['applied', 'pending'].includes(application.status))) {
        displayStatus = 'shortlisted';
    }

    const statusClass = getStatusClass(displayStatus);
    const statusDisplay = getStatusDisplayName(displayStatus);

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
                    ${application.shortlisted ? '<i class="fas fa-star" style="color: #fbbf24; margin-left: 8px;" title="Shortlisted"></i>' : ''}
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
                ${(['pending', 'applied'].includes(application.status || 'pending') && !application.shortlisted) ? `
                    <button class="btn btn-tertiary withdraw-btn" data-id="${application.id}">
                        Withdraw
                    </button>
                ` : ''}
            </div>
        </div>
    `;
};

// Enhanced submit application function for detailed applications
window.submitEnhancedApplication = async (applicationData) => {
    try {
        const userData = await getCurrentUser();

        // Check if already applied
        const existingApp = userApplications.find(app => app.internshipId === applicationData.internshipId);
        if (existingApp) {
            throw new Error('You have already applied to this internship.');
        }

        // Add server timestamp
        const enhancedData = {
            ...applicationData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        // Save to Firestore
        const docRef = await addDoc(collection(db, 'applications'), enhancedData);
        console.log('Enhanced application submitted with ID:', docRef.id);

        // Add to local state
        userApplications.unshift({
            id: docRef.id,
            ...enhancedData,
            createdAt: new Date(), // Use current date for immediate display
            updatedAt: new Date()
        });

        // Update UI
        updateSummaryStats();
        displayApplications();

        return { success: true, applicationId: docRef.id };

    } catch (error) {
        console.error('Error submitting enhanced application:', error);
        throw error;
    }
};

// Legacy submit application function (for compatibility)
window.submitApplication = async (internshipId, internshipData) => {
    try {
        const userData = await getCurrentUser();

        // Check if already applied
        const existingApp = userApplications.find(app => app.internshipId === internshipId);
        if (existingApp) {
            throw new Error('You have already applied to this internship.');
        }

        // Create basic application document
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
            updatedAt: serverTimestamp(),

            // Enhanced fields with default values
            coverLetter: '',
            phone: userData.phone || '',
            linkedin: '',
            portfolio: '',
            startDate: '',
            preferredDuration: '',
            relevantSkills: [],
            additionalInfo: '',
            resumeUrl: '',
            resumeFileName: '',
            resumeFileSize: 0,
            resumeFileType: ''
        };

        // Save to Firestore
        const docRef = await addDoc(collection(db, 'applications'), applicationData);
        console.log('Application submitted with ID:', docRef.id);

        // Add to local state
        userApplications.unshift({
            id: docRef.id,
            ...applicationData,
            createdAt: new Date(), // Use current date for immediate display
            updatedAt: new Date()
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
        'applied': 'Applied',
        'reviewing': 'Under Review',
        'under-review': 'Under Review',
        'shortlisted': 'Shortlisted',
        'interview-scheduled': 'Interview Scheduled',
        'interview': 'Interview',
        'accepted': 'Accepted',
        'hired': 'Hired',
        'rejected': 'Not Selected',
        'withdrawn': 'Withdrawn',
        // Handle any potential variations
        'not selected': 'Not Selected',
        'not_selected': 'Not Selected',
        'NOT SELECTED': 'Not Selected'
    };
    return statusMap[status] || statusMap[status?.toLowerCase()] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown');
};

// Make functions available globally
window.getStatusDisplayName = getStatusDisplayName;
window.userApplications = userApplications;

// Get status CSS class
const getStatusClass = (status) => {
    const classMap = {
        'pending': 'status-pending',
        'applied': 'status-pending',
        'reviewing': 'status-reviewing',
        'shortlisted': 'status-shortlisted',
        'interview-scheduled': 'status-interview',
        'interview': 'status-interview',
        'accepted': 'status-accepted',
        'hired': 'status-accepted',
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

// Clear all filters
window.clearFilters = () => {
    if (statusFilter) statusFilter.value = '';
    if (companyFilter) companyFilter.value = '';
    if (sortFilter) sortFilter.value = 'newest';
    applyFilters();
};

// Setup action button handlers
const setupActionHandlers = () => {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-details-btn')) {
            const applicationId = e.target.dataset.id;
            viewApplicationDetails(applicationId);
        } else if (e.target.classList.contains('withdraw-btn')) {
            const applicationId = e.target.dataset.id;
            withdrawApplication(applicationId);
        }
    });
};

// View application details
const viewApplicationDetails = (applicationId) => {
    const application = userApplications.find(app => app.id === applicationId);
    if (!application) return;

    // Populate modal content
    populateApplicationModal(application);

    // Show modal
    const modal = document.getElementById('application-details-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
};

// Populate application details modal
const populateApplicationModal = (application) => {
    const modalTitle = document.getElementById('modal-application-title');
    const modalContent = document.getElementById('modal-application-content');
    const viewInternshipBtn = document.getElementById('view-internship-btn');

    if (modalTitle) {
        modalTitle.textContent = `Application: ${application.internshipTitle}`;
    }

    if (modalContent) {
        const statusClass = getStatusClass(application.status || 'pending');
        const statusDisplay = getStatusDisplayName(application.status || 'pending');

        modalContent.innerHTML = `
            <div class="detail-section">
                <h4>Position Information</h4>
                <div class="detail-info">
                    <p><strong>Position:</strong> ${escapeHtml(application.internshipTitle || 'N/A')}</p>
                    <p><strong>Company:</strong> ${escapeHtml(application.companyName || 'N/A')}</p>
                    <p><strong>Location:</strong> ${escapeHtml(application.location || 'Not specified')}</p>
                    <p><strong>Duration:</strong> ${escapeHtml(application.duration || 'Not specified')}</p>
                </div>
            </div>

            <div class="detail-section">
                <h4>Application Status</h4>
                <div class="detail-info">
                    <p><strong>Current Status:</strong> <span class="status-display ${statusClass}">${statusDisplay}</span></p>
                    <p><strong>Applied Date:</strong> ${formatDate(application.createdAt)}</p>
                    ${application.updatedAt && application.updatedAt !== application.createdAt ?
                        `<p><strong>Last Updated:</strong> ${formatDate(application.updatedAt)}</p>` : ''
                    }
                    ${application.shortlisted ? '<p><strong>🌟 Shortlisted:</strong> Yes</p>' : ''}
                </div>
            </div>

            ${application.coverLetter ? `
                <div class="detail-section">
                    <h4>Cover Letter</h4>
                    <div class="detail-info">
                        <p>${escapeHtml(application.coverLetter).replace(/\n/g, '<br>')}</p>
                    </div>
                </div>
            ` : ''}

            ${application.relevantSkills && application.relevantSkills.length > 0 ? `
                <div class="detail-section">
                    <h4>Relevant Skills</h4>
                    <div class="skill-tags">
                        ${application.relevantSkills.map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join('')}
                    </div>
                </div>
            ` : ''}

            ${application.startDate ? `
                <div class="detail-section">
                    <h4>Availability</h4>
                    <div class="detail-info">
                        <p><strong>Earliest Start Date:</strong> ${formatDate(application.startDate)}</p>
                        ${application.preferredDuration ? `<p><strong>Preferred Duration:</strong> ${escapeHtml(application.preferredDuration)}</p>` : ''}
                    </div>
                </div>
            ` : ''}

            ${application.resumeUrl ? `
                <div class="detail-section">
                    <h4>Resume</h4>
                    <div class="detail-info">
                        <p><strong>Resume:</strong> <a href="${application.resumeUrl}" target="_blank" rel="noopener noreferrer">View Resume</a></p>
                    </div>
                </div>
            ` : ''}

            ${application.additionalInfo ? `
                <div class="detail-section">
                    <h4>Additional Information</h4>
                    <div class="detail-info">
                        <p>${escapeHtml(application.additionalInfo).replace(/\n/g, '<br>')}</p>
                    </div>
                </div>
            ` : ''}

            ${application.phone || application.linkedin || application.portfolio ? `
                <div class="detail-section">
                    <h4>Contact Information</h4>
                    <div class="detail-info">
                        ${application.phone ? `<p><strong>Phone:</strong> ${escapeHtml(application.phone)}</p>` : ''}
                        ${application.linkedin ? `<p><strong>LinkedIn:</strong> <a href="${application.linkedin}" target="_blank" rel="noopener noreferrer">${escapeHtml(application.linkedin)}</a></p>` : ''}
                        ${application.portfolio ? `<p><strong>Portfolio:</strong> <a href="${application.portfolio}" target="_blank" rel="noopener noreferrer">${escapeHtml(application.portfolio)}</a></p>` : ''}
                    </div>
                </div>
            ` : ''}
        `;
    }

    // Show/hide view internship button and set up click handler
    if (viewInternshipBtn) {
        if (application.internshipId) {
            viewInternshipBtn.style.display = 'inline-block';
            viewInternshipBtn.onclick = () => {
                window.location.href = `internship.html#internship-${application.internshipId}`;
            };
        } else {
            viewInternshipBtn.style.display = 'none';
        }
    }
};

// Setup modal event handlers
const setupModalHandlers = () => {
    const modal = document.getElementById('application-details-modal');
    const closeBtn = document.getElementById('close-details-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');

    const closeModal = () => {
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeModal();
        }
    });
};

// Withdraw application
const withdrawApplication = async (applicationId) => {
    if (!confirm('Are you sure you want to withdraw this application? This action cannot be undone.')) {
        return;
    }

    try {
        // TODO: Update application status in Firestore
        const application = userApplications.find(app => app.id === applicationId);
        if (application) {
            application.status = 'withdrawn';
            displayApplications();
            updateSummaryStats();
        }
    } catch (error) {
        console.error('Error withdrawing application:', error);
        alert('Failed to withdraw application. Please try again.');
    }
};

// Show real-time notifications
const showStatusChangeNotification = (application, oldStatus) => {
    const newStatus = application.status;
    const statusDisplay = getStatusDisplayName(newStatus);

    let message = `Your application for ${application.internshipTitle} at ${application.companyName} has been updated to: ${statusDisplay}`;
    let notificationType = 'info';

    if (newStatus === 'accepted' || newStatus === 'hired') {
        notificationType = 'success';
        message = `🎉 Congratulations! Your application for ${application.internshipTitle} at ${application.companyName} has been ${statusDisplay.toLowerCase()}!`;
    } else if (newStatus === 'rejected') {
        notificationType = 'error';
        message = `Your application for ${application.internshipTitle} at ${application.companyName} was not selected. Keep applying to other opportunities!`;
    } else if (newStatus === 'interview-scheduled' || newStatus === 'interview') {
        notificationType = 'success';
        message = `📅 Great news! You have been invited for an interview at ${application.companyName} for ${application.internshipTitle}!`;
    }

    showRealTimeNotification(message, notificationType);
};

const showShortlistNotification = (shortlistData) => {
    const message = `⭐ Exciting news! You have been shortlisted by ${shortlistData.companyName}! They are interested in your profile.`;
    showRealTimeNotification(message, 'success');
};

const showRealTimeNotification = (message, type = 'info') => {
    const notification = document.createElement('div');
    notification.className = `real-time-notification notification-${type}`;

    const colors = {
        success: { bg: '#d1fae5', border: '#a7f3d0', text: '#065f46' },
        error: { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' },
        info: { bg: '#dbeafe', border: '#bfdbfe', text: '#1e40af' }
    };

    const color = colors[type] || colors.info;

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${color.bg};
        color: ${color.text};
        padding: 16px 20px;
        border-radius: 8px;
        border: 1px solid ${color.border};
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        max-width: 400px;
        font-size: 14px;
        line-height: 1.4;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;

    notification.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1; margin-right: 12px;">${message}</div>
            <button onclick="this.parentElement.parentElement.remove()"
                    style="background: none; border: none; color: ${color.text}; font-size: 18px; cursor: pointer; padding: 0; line-height: 1;">
                ×
            </button>
        </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    // Auto-remove after 8 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 8000);
};

const showLoading = () => {
    if (applicationsLoading) applicationsLoading.style.display = 'block';
    if (applicationsContent) applicationsContent.style.display = 'none';
};

const hideLoading = () => {
    if (applicationsLoading) applicationsLoading.style.display = 'none';
    if (applicationsContent) applicationsContent.style.display = 'block';
};

const showError = (message, showRetry = true) => {
    if (applicationsContainer) {
        applicationsContainer.innerHTML = `
            <div class="error-state" style="text-align: center; padding: 60px 20px; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
                <div style="font-size: 3rem; margin-bottom: 24px; opacity: 0.5;">⚠️</div>
                <h3 style="margin-bottom: 12px; color: #991b1b;">Something went wrong</h3>
                <p style="margin-bottom: 32px; max-width: 400px; margin-left: auto; margin-right: auto;">
                    ${message}
                </p>
                ${showRetry ? `
                    <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="location.reload()" class="btn btn-primary">Retry</button>
                        <a href="internship.html" class="btn btn-secondary">Browse Internships</a>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Also hide loading if it's still showing
    hideLoading();
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);