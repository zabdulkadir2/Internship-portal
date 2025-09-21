import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, getDoc, doc, updateDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const applicationsTableBody = document.querySelector('.applications-table tbody');
const searchInput = document.getElementById('search-applicants');
const internshipFilter = document.getElementById('internship-position');
const statusFilter = document.getElementById('application-status');
const dateFilter = document.getElementById('date-applied');
const sortSelect = document.getElementById('sort-by');
const searchButton = document.querySelector('.filter-panel .btn-primary');
const selectAllCheckbox = document.getElementById('select-all');
const applicationModal = document.getElementById('application-detail-modal');
const modalCloseBtn = document.querySelector('.close-modal');

// State
let allApplications = [];
let filteredApplications = [];
let companyInternships = {};
let shortlistedStudents = new Map(); // Map internshipId -> Set of studentIds
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

        // Setup event handlers
        setupEventHandlers();

        // Load data
        await loadCompanyData();

        // Check if filtering for specific internship
        checkInternshipFilter();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load applications. Please refresh the page.');
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    // Search and filter handlers
    searchButton?.addEventListener('click', applyFilters);
    searchInput?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') applyFilters();
    });
    internshipFilter?.addEventListener('change', applyFilters);
    statusFilter?.addEventListener('change', applyFilters);
    dateFilter?.addEventListener('change', applyFilters);
    sortSelect?.addEventListener('change', applySorting);

    // Select all handler
    selectAllCheckbox?.addEventListener('change', handleSelectAll);

    // Modal handlers
    modalCloseBtn?.addEventListener('click', closeModal);
    applicationModal?.addEventListener('click', (e) => {
        if (e.target === applicationModal) closeModal();
    });

    // Bulk action handlers
    const bulkUpdateBtn = document.querySelector('.bulk-actions .btn-secondary:first-of-type');
    const bulkEmailBtn = document.querySelector('.bulk-actions .btn-secondary:last-of-type');

    bulkUpdateBtn?.addEventListener('click', handleBulkStatusUpdate);
    bulkEmailBtn?.addEventListener('click', handleBulkEmail);
};

// Load company data (internships and applications)
const loadCompanyData = async () => {
    try {
        showLoading();

        // Load company's internships first
        await loadCompanyInternships();

        // Load shortlisted students
        await loadShortlistedStudents();

        // Load applications for those internships
        await loadApplications();

        // Populate internship filter dropdown
        populateInternshipFilter();

        // Display applications
        displayApplications();

        hideLoading();

    } catch (error) {
        console.error('Error loading company data:', error);
        showError('Failed to load applications data.');
        hideLoading();
    }
};

// Load company's internships
const loadCompanyInternships = async () => {
    try {
        const internshipsQuery = query(
            collection(db, 'internships'),
            where('companyId', '==', currentUser.uid)
        );

        const internshipsSnapshot = await getDocs(internshipsQuery);
        companyInternships = {};

        internshipsSnapshot.docs.forEach(doc => {
            companyInternships[doc.id] = doc.data();
        });

        console.log('Loaded internships:', Object.keys(companyInternships).length);

    } catch (error) {
        console.error('Error loading internships:', error);
        throw error;
    }
};

// Load shortlisted students for this company
const loadShortlistedStudents = async () => {
    try {
        const shortlistQuery = query(
            collection(db, 'shortlists'),
            where('companyId', '==', currentUser.uid)
        );

        const shortlistSnapshot = await getDocs(shortlistQuery);

        // Group shortlisted students by internship
        shortlistedStudents = new Map();
        shortlistSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const internshipId = data.internshipId || 'general';

            if (!shortlistedStudents.has(internshipId)) {
                shortlistedStudents.set(internshipId, new Set());
            }
            shortlistedStudents.get(internshipId).add(data.studentId);
        });

        console.log('Loaded shortlisted students by internship:', shortlistedStudents);

    } catch (error) {
        console.error('Error loading shortlisted students:', error);
        // Continue without shortlisted data
    }
};

// Load applications for company's internships
const loadApplications = async () => {
    try {
        const internshipIds = Object.keys(companyInternships);

        if (internshipIds.length === 0) {
            allApplications = [];
            filteredApplications = [];
            return;
        }

        // Get applications for these internships (handle Firestore 'in' limit of 10)
        let allApps = [];

        for (let i = 0; i < internshipIds.length; i += 10) {
            const batch = internshipIds.slice(i, i + 10);
            const applicationsQuery = query(
                collection(db, 'applications'),
                where('internshipId', 'in', batch)
            );

            const applicationsSnapshot = await getDocs(applicationsQuery);
            const batchApps = applicationsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            allApps = allApps.concat(batchApps);
        }

        // Sort all applications by creation date (client-side)
        allApps.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return dateB - dateA; // Newest first
        });

        // Get student data for each application
        allApplications = [];
        for (const app of allApps) {
            try {
                const studentDoc = await getDoc(doc(db, 'users', app.studentId));
                let studentData = { fullName: 'Unknown Student', university: 'Unknown University' };

                if (studentDoc.exists()) {
                    studentData = studentDoc.data();
                }

                allApplications.push({
                    ...app,
                    student: studentData,
                    internshipTitle: companyInternships[app.internshipId]?.title || 'Unknown Position'
                });
            } catch (error) {
                console.error('Error loading student data:', error);
                // Add application without student data
                allApplications.push({
                    ...app,
                    student: { fullName: 'Unknown Student', university: 'Unknown University' },
                    internshipTitle: companyInternships[app.internshipId]?.title || 'Unknown Position'
                });
            }
        }

        filteredApplications = [...allApplications];
        console.log('Loaded applications:', allApplications.length);

    } catch (error) {
        console.error('Error loading applications:', error);
        throw error;
    }
};

// Populate internship filter dropdown
const populateInternshipFilter = () => {
    if (!internshipFilter) return;

    // Clear existing options (except "All Internships")
    internshipFilter.innerHTML = '<option value="all">All Internships</option>';

    // Add internship options
    Object.entries(companyInternships).forEach(([id, internship]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = internship.title;
        internshipFilter.appendChild(option);
    });
};

// Display applications in table
const displayApplications = () => {
    if (!applicationsTableBody) return;

    if (filteredApplications.length === 0) {
        showEmptyState();
        return;
    }

    hideEmptyState();

    applicationsTableBody.innerHTML = filteredApplications.map(app => `
        <tr data-application-id="${app.id}">
            <td><input type="checkbox" class="bulk-checkbox application-checkbox" value="${app.id}" /></td>
            <td class="applicant-info">
                <img
                    src="https://placehold.co/40x40/E2E8F0/A0B2C4?text=${app.student.fullName?.charAt(0) || 'U'}"
                    alt="Profile Photo"
                    class="profile-photo"
                />
                <span>${app.student.fullName || 'Unknown Student'}</span>
            </td>
            <td>${app.internshipTitle}</td>
            <td>${formatDate(app.createdAt)}</td>
            <td>
                ${getStatusDisplay(app)}
            </td>
            <td class="actions">
                <button class="btn btn-tertiary" onclick="viewApplicationDetails('${app.id}')">View Details</button>
            </td>
        </tr>
    `).join('');

    // Update select all checkbox state
    updateSelectAllState();
};

// Apply filters
const applyFilters = () => {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const selectedInternship = internshipFilter?.value || 'all';
    const selectedStatus = statusFilter?.value || 'all';
    const selectedDate = dateFilter?.value || '';

    filteredApplications = allApplications.filter(app => {
        // Text search
        if (searchTerm) {
            const searchable = `${app.student.fullName} ${app.student.email} ${app.internshipTitle}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }

        // Internship filter
        if (selectedInternship !== 'all' && app.internshipId !== selectedInternship) {
            return false;
        }

        // Status filter
        if (selectedStatus === 'shortlisted') {
            // Show shortlisted students (may or may not have applications)
            const internshipShortlist = shortlistedStudents.get(app.internshipId || 'general') || new Set();
            if (!internshipShortlist.has(app.studentId)) {
                return false;
            }
        } else if (selectedStatus !== 'all' && (app.status || 'applied') !== selectedStatus) {
            return false;
        }

        // Date filter
        if (selectedDate) {
            const appDate = formatDate(app.createdAt);
            const filterDate = new Date(selectedDate).toLocaleDateString();
            if (appDate !== filterDate) return false;
        }

        return true;
    });

    // Apply current sorting
    applySorting();

    // Display filtered results
    displayApplications();
};

// Apply sorting
const applySorting = () => {
    const sortBy = sortSelect?.value || 'recent';

    filteredApplications.sort((a, b) => {
        switch (sortBy) {
            case 'recent':
                return new Date(b.createdAt?.toDate?.() || b.createdAt) - new Date(a.createdAt?.toDate?.() || a.createdAt);
            case 'oldest':
                return new Date(a.createdAt?.toDate?.() || a.createdAt) - new Date(b.createdAt?.toDate?.() || b.createdAt);
            case 'status':
                return (a.status || 'applied').localeCompare(b.status || 'applied');
            case 'alpha':
                return (a.student.fullName || 'Unknown').localeCompare(b.student.fullName || 'Unknown');
            default:
                return 0;
        }
    });
};

// View application details in modal
window.viewApplicationDetails = async (applicationId) => {
    const application = allApplications.find(app => app.id === applicationId);
    if (!application) return;

    try {
        // Populate modal with application data
        populateApplicationModal(application);

        // Show modal
        if (applicationModal) {
            applicationModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

    } catch (error) {
        console.error('Error viewing application details:', error);
        showError('Failed to load application details.');
    }
};

// Populate application modal
const populateApplicationModal = (application) => {
    const modal = applicationModal;
    if (!modal) return;

    // Update modal content
    const modalPhoto = modal.querySelector('#modal-profile-photo, .modal-profile-photo');
    const modalName = modal.querySelector('#applicant-name');
    const modalPosition = modal.querySelector('#applicant-position');
    const modalContactInfo = modal.querySelector('.contact-info');

    if (modalPhoto) {
        modalPhoto.src = `https://placehold.co/80x80/E2E8F0/A0B2C4?text=${application.student.fullName?.charAt(0) || 'U'}`;
        modalPhoto.alt = `${application.student.fullName || 'Unknown Student'} Photo`;
    }

    if (modalName) {
        modalName.textContent = application.student.fullName || 'Unknown Student';
    }

    if (modalPosition) {
        modalPosition.textContent = application.internshipTitle;
    }

    if (modalContactInfo) {
        modalContactInfo.innerHTML = `
            <a href="mailto:${application.student.email || application.email || ''}">${application.student.email || application.email || 'No email provided'}</a> |
            <span>${application.student.phone || 'No phone provided'}</span>
        `;
    }

    // Update application details with enhanced information
    const modalBody = modal.querySelector('.modal-body');
    if (modalBody) {
        modalBody.innerHTML = `
            <h3>Application Details</h3>

            ${application.resumeUrl ? `
                <div class="detail-section">
                    <h4>Resume/CV</h4>
                    <div class="resume-info">
                        <p><strong>File:</strong> ${application.resumeFileName || 'Resume.pdf'}</p>
                        <a href="${application.resumeUrl}" target="_blank" class="btn btn-secondary">Download Resume</a>
                    </div>
                </div>
            ` : `
                <div class="detail-section">
                    <h4>Resume/CV</h4>
                    <p style="color: #6b7280;">No resume uploaded</p>
                </div>
            `}

            <div class="detail-section">
                <h4>Cover Letter</h4>
                <div class="cover-letter-content">
                    ${application.coverLetter ?
                        `<p style="background: #f8fafc; padding: 1rem; border-radius: 6px; border-left: 4px solid #1E3A8A; white-space: pre-wrap;">${escapeHtml(application.coverLetter)}</p>` :
                        '<p style="color: #6b7280;">No cover letter provided.</p>'
                    }
                </div>
            </div>

            <div class="detail-section">
                <h4>Contact Information</h4>
                <div class="contact-details">
                    <p><strong>Email:</strong> ${application.studentEmail || application.student.email || 'Not provided'}</p>
                    ${application.phone ? `<p><strong>Phone:</strong> ${escapeHtml(application.phone)}</p>` : ''}
                    ${application.linkedin ? `<p><strong>LinkedIn:</strong> <a href="${escapeHtml(application.linkedin)}" target="_blank">${escapeHtml(application.linkedin)}</a></p>` : ''}
                    ${application.portfolio ? `<p><strong>Portfolio:</strong> <a href="${escapeHtml(application.portfolio)}" target="_blank">${escapeHtml(application.portfolio)}</a></p>` : ''}
                </div>
            </div>

            <div class="detail-section">
                <h4>Availability & Preferences</h4>
                <div class="availability-info">
                    ${application.startDate ? `<p><strong>Start Date:</strong> ${formatDate(application.startDate)}</p>` : ''}
                    ${application.preferredDuration ? `<p><strong>Preferred Duration:</strong> ${escapeHtml(application.preferredDuration)}</p>` : ''}
                </div>
            </div>

            <div class="detail-section">
                <h4>Relevant Skills</h4>
                <div class="skills-section">
                    ${application.relevantSkills && application.relevantSkills.length > 0 ? `
                        <div class="skill-tags">
                            ${application.relevantSkills.map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join('')}
                        </div>
                    ` : `
                        <p style="color: #6b7280;">No specific skills listed for this application</p>
                    `}
                </div>
            </div>

            ${application.additionalInfo ? `
                <div class="detail-section">
                    <h4>Additional Information</h4>
                    <p style="background: #f8fafc; padding: 1rem; border-radius: 6px; white-space: pre-wrap;">${escapeHtml(application.additionalInfo)}</p>
                </div>
            ` : ''}

            <div class="detail-section">
                <h4>Application Metadata</h4>
                <div class="metadata-info">
                    <p><strong>Applied:</strong> ${formatDate(application.createdAt)}</p>
                    <p><strong>Status:</strong> ${getStatusDisplayName(application.status || 'pending')}</p>
                    ${application.updatedAt && application.updatedAt !== application.createdAt ?
                        `<p><strong>Last Updated:</strong> ${formatDate(application.updatedAt)}</p>` : ''
                    }
                </div>
            </div>
        `;
    }

    // Setup modal actions
    setupModalActions(application);
};

// Setup modal action buttons
const setupModalActions = (application) => {
    const modal = applicationModal;
    if (!modal) return;

    // Get action buttons
    const scheduleBtn = modal.querySelector('.btn-primary');
    const statusBtn = modal.querySelector('.btn-secondary');
    const rejectBtn = modal.querySelector('.btn-tertiary');

    // Remove existing listeners
    const newScheduleBtn = scheduleBtn?.cloneNode(true);
    const newStatusBtn = statusBtn?.cloneNode(true);
    const newRejectBtn = rejectBtn?.cloneNode(true);

    scheduleBtn?.parentNode?.replaceChild(newScheduleBtn, scheduleBtn);
    statusBtn?.parentNode?.replaceChild(newStatusBtn, statusBtn);
    rejectBtn?.parentNode?.replaceChild(newRejectBtn, rejectBtn);

    // Add new listeners
    newScheduleBtn?.addEventListener('click', () => updateApplicationStatus(application.id, 'interview-scheduled'));
    newStatusBtn?.addEventListener('click', () => showStatusChangeDialog(application.id));
    newRejectBtn?.addEventListener('click', () => updateApplicationStatus(application.id, 'rejected'));
};

// Update application status
const updateApplicationStatus = async (applicationId, newStatus) => {
    try {
        showLoading();

        const applicationRef = doc(db, 'applications', applicationId);
        await updateDoc(applicationRef, {
            status: newStatus,
            updatedAt: new Date()
        });

        // Update local data
        const appIndex = allApplications.findIndex(app => app.id === applicationId);
        if (appIndex !== -1) {
            allApplications[appIndex].status = newStatus;
        }

        // Refresh display
        applyFilters();

        // Close modal
        closeModal();

        showSuccess(`Application status updated to ${formatStatus(newStatus)}`);

    } catch (error) {
        console.error('Error updating application status:', error);
        showError('Failed to update application status.');
    } finally {
        hideLoading();
    }
};

// Show status change dialog
const showStatusChangeDialog = (applicationId) => {
    const statuses = [
        { value: 'applied', label: 'Applied' },
        { value: 'under-review', label: 'Under Review' },
        { value: 'interview-scheduled', label: 'Interview Scheduled' },
        { value: 'shortlisted', label: 'Shortlisted' },
        { value: 'shortlisted', label: 'Shortlisted' },
        { value: 'hired', label: 'Hired' },
        { value: 'rejected', label: 'Rejected' }
    ];

    const statusOptions = statuses.map(status =>
        `<option value="${status.value}">${status.label}</option>`
    ).join('');

    const dialogHTML = `
        <div class="status-dialog-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10001; display: flex; align-items: center; justify-content: center;">
            <div class="status-dialog" style="background: white; padding: 24px; border-radius: 8px; min-width: 300px;">
                <h3 style="margin: 0 0 16px 0;">Update Application Status</h3>
                <select id="status-select" style="width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px;">
                    ${statusOptions}
                </select>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="cancel-status" class="btn btn-secondary">Cancel</button>
                    <button id="update-status" class="btn btn-primary">Update</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    const overlay = document.querySelector('.status-dialog-overlay');
    const cancelBtn = document.getElementById('cancel-status');
    const updateBtn = document.getElementById('update-status');
    const statusSelect = document.getElementById('status-select');

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    updateBtn.addEventListener('click', () => {
        const newStatus = statusSelect.value;
        overlay.remove();
        updateApplicationStatus(applicationId, newStatus);
    });
};

// Handle select all checkbox
const handleSelectAll = () => {
    const checkboxes = document.querySelectorAll('.application-checkbox');
    const isChecked = selectAllCheckbox?.checked || false;

    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
    });
};

// Update select all checkbox state
const updateSelectAllState = () => {
    if (!selectAllCheckbox) return;

    const checkboxes = document.querySelectorAll('.application-checkbox');
    const checkedBoxes = document.querySelectorAll('.application-checkbox:checked');

    if (checkboxes.length === 0) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = false;
    } else if (checkedBoxes.length === checkboxes.length) {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = true;
    } else if (checkedBoxes.length > 0) {
        selectAllCheckbox.indeterminate = true;
        selectAllCheckbox.checked = false;
    } else {
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.checked = false;
    }
};

// Handle bulk status update
const handleBulkStatusUpdate = () => {
    const selectedIds = getSelectedApplicationIds();
    if (selectedIds.length === 0) {
        showError('Please select applications to update.');
        return;
    }

    showBulkStatusDialog(selectedIds);
};

// Handle bulk email
const handleBulkEmail = () => {
    const selectedIds = getSelectedApplicationIds();
    if (selectedIds.length === 0) {
        showError('Please select applications to email.');
        return;
    }

    const selectedApps = allApplications.filter(app => selectedIds.includes(app.id));
    const emails = selectedApps.map(app => app.student.email || app.email).filter(email => email);

    if (emails.length === 0) {
        showError('No email addresses found for selected applications.');
        return;
    }

    const emailList = emails.join(',');
    window.location.href = `mailto:${emailList}?subject=Regarding your internship application`;
};

// Get selected application IDs
const getSelectedApplicationIds = () => {
    const checkboxes = document.querySelectorAll('.application-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
};

// Show bulk status dialog
const showBulkStatusDialog = (applicationIds) => {
    const statuses = [
        { value: 'under-review', label: 'Under Review' },
        { value: 'interview-scheduled', label: 'Interview Scheduled' },
        { value: 'shortlisted', label: 'Shortlisted' },
        { value: 'hired', label: 'Hired' },
        { value: 'rejected', label: 'Rejected' }
    ];

    const statusOptions = statuses.map(status =>
        `<option value="${status.value}">${status.label}</option>`
    ).join('');

    const dialogHTML = `
        <div class="bulk-status-dialog-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10001; display: flex; align-items: center; justify-content: center;">
            <div class="bulk-status-dialog" style="background: white; padding: 24px; border-radius: 8px; min-width: 300px;">
                <h3 style="margin: 0 0 16px 0;">Update ${applicationIds.length} Application(s)</h3>
                <select id="bulk-status-select" style="width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px;">
                    <option value="">Select new status...</option>
                    ${statusOptions}
                </select>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="cancel-bulk-status" class="btn btn-secondary">Cancel</button>
                    <button id="update-bulk-status" class="btn btn-primary">Update All</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    const overlay = document.querySelector('.bulk-status-dialog-overlay');
    const cancelBtn = document.getElementById('cancel-bulk-status');
    const updateBtn = document.getElementById('update-bulk-status');
    const statusSelect = document.getElementById('bulk-status-select');

    cancelBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    updateBtn.addEventListener('click', async () => {
        const newStatus = statusSelect.value;
        if (!newStatus) {
            showError('Please select a status.');
            return;
        }

        overlay.remove();
        await updateBulkApplicationStatus(applicationIds, newStatus);
    });
};

// Update bulk application status
const updateBulkApplicationStatus = async (applicationIds, newStatus) => {
    try {
        showLoading();

        const promises = applicationIds.map(id => {
            const applicationRef = doc(db, 'applications', id);
            return updateDoc(applicationRef, {
                status: newStatus,
                updatedAt: new Date()
            });
        });

        await Promise.all(promises);

        // Update local data
        applicationIds.forEach(id => {
            const appIndex = allApplications.findIndex(app => app.id === id);
            if (appIndex !== -1) {
                allApplications[appIndex].status = newStatus;
            }
        });

        // Refresh display
        applyFilters();

        // Clear selections
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        document.querySelectorAll('.application-checkbox').forEach(cb => cb.checked = false);

        showSuccess(`${applicationIds.length} application(s) updated to ${formatStatus(newStatus)}`);

    } catch (error) {
        console.error('Error updating bulk application status:', error);
        showError('Failed to update application statuses.');
    } finally {
        hideLoading();
    }
};

// Close modal
const closeModal = () => {
    if (applicationModal) {
        applicationModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

// Show/hide empty state
const showEmptyState = () => {
    const emptyState = document.getElementById('empty-state');
    const tableWrapper = document.querySelector('.applications-table-wrapper');

    if (emptyState && tableWrapper) {
        emptyState.style.display = 'block';
        tableWrapper.style.display = 'none';
    }
};

const hideEmptyState = () => {
    const emptyState = document.getElementById('empty-state');
    const tableWrapper = document.querySelector('.applications-table-wrapper');

    if (emptyState && tableWrapper) {
        emptyState.style.display = 'none';
        tableWrapper.style.display = 'block';
    }
};

// Utility functions
const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';

    try {
        if (timestamp.toDate) {
            return timestamp.toDate().toLocaleDateString();
        }
        if (typeof timestamp === 'string') {
            return new Date(timestamp).toLocaleDateString();
        }
        return new Date(timestamp).toLocaleDateString();
    } catch (error) {
        return 'Unknown date';
    }
};

const formatStatus = (status) => {
    const statusMap = {
        'applied': 'Applied',
        'under-review': 'Under Review',
        'interview-scheduled': 'Interview Scheduled',
        'shortlisted': 'Shortlisted',
        'hired': 'Hired',
        'rejected': 'Rejected'
    };
    return statusMap[status] || 'Applied';
};

// Get status display name (matches student-side function)
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

// Get status display with shortlist information
const getStatusDisplay = (app) => {
    const applicationStatus = app.status || 'applied';
    const internshipShortlist = shortlistedStudents.get(app.internshipId || 'general') || new Set();
    const isShortlisted = internshipShortlist.has(app.studentId);

    let statusBadges = [];

    // Application status badge
    statusBadges.push(`<span class="status-badge status-${applicationStatus}">${formatStatus(applicationStatus)}</span>`);

    // Shortlisted badge if applicable
    if (isShortlisted && applicationStatus !== 'shortlisted') {
        statusBadges.push(`<span class="status-badge status-shortlisted" style="margin-left: 5px;">⭐ Shortlisted</span>`);
    }

    return statusBadges.join('');
};

// Loading state
const showLoading = () => {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-overlay';
    loadingDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        font-size: 16px;
        font-weight: 500;
    `;
    loadingDiv.textContent = 'Loading...';
    document.body.appendChild(loadingDiv);
};

const hideLoading = () => {
    const loadingDiv = document.getElementById('loading-overlay');
    if (loadingDiv) {
        loadingDiv.remove();
    }
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

// Check if filtering for specific internship
const checkInternshipFilter = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const internshipId = urlParams.get('internship');

    if (internshipId && internshipFilter) {
        // Set the filter to the specific internship
        internshipFilter.value = internshipId;

        // Apply filters to show only this internship's applications
        setTimeout(() => {
            applyFilters();
        }, 100);

        // Update page title to indicate filtering
        const internshipTitle = companyInternships[internshipId]?.title;
        if (internshipTitle) {
            document.title = `Applications: ${internshipTitle} | CampusConnect`;

            // Add a note to the page header
            const pageTitle = document.querySelector('.page-title');
            if (pageTitle) {
                pageTitle.innerHTML = `Manage Applications <small style="font-size: 0.6em; color: #6b7280; display: block; margin-top: 5px;">Showing applications for: ${internshipTitle}</small>`;
            }
        }
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);