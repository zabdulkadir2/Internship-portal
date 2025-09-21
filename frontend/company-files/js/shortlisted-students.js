import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, getDoc, doc, deleteDoc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const shortlistedGrid = document.getElementById('shortlisted-grid');
const searchInput = document.getElementById('search-shortlisted');
const internshipFilter = document.getElementById('internship-filter');
const sortSelect = document.getElementById('sort-by');
const searchButton = document.querySelector('.filter-panel .btn-primary');
const selectAllCheckbox = document.getElementById('select-all');
const studentModal = document.getElementById('student-detail-modal');
const modalCloseBtn = document.querySelector('.close-modal');

// Bulk action buttons
const bulkInviteBtn = document.getElementById('bulk-invite-btn');
const bulkRemoveBtn = document.getElementById('bulk-remove-btn');
const bulkEmailBtn = document.getElementById('bulk-email-btn');

// State
let allShortlistedStudents = [];
let filteredShortlistedStudents = [];
let companyInternships = {};
let studentProfiles = new Map();
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
        await loadShortlistedData();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load shortlisted students. Please refresh the page.');
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
    sortSelect?.addEventListener('change', applySorting);

    // Select all handler
    selectAllCheckbox?.addEventListener('change', handleSelectAll);

    // Modal handlers
    modalCloseBtn?.addEventListener('click', closeModal);
    studentModal?.addEventListener('click', (e) => {
        if (e.target === studentModal) closeModal();
    });

    // Bulk action handlers
    bulkInviteBtn?.addEventListener('click', handleBulkInvite);
    bulkRemoveBtn?.addEventListener('click', handleBulkRemove);
    bulkEmailBtn?.addEventListener('click', handleBulkEmail);

    // Modal action handlers
    document.getElementById('invite-interview-btn')?.addEventListener('click', handleSingleInvite);
    document.getElementById('move-to-applications-btn')?.addEventListener('click', handleMoveToApplications);
    document.getElementById('remove-shortlist-btn')?.addEventListener('click', handleSingleRemove);
};

// Load shortlisted data
const loadShortlistedData = async () => {
    try {
        showLoading();

        // Load data in parallel
        await Promise.all([
            loadCompanyInternships(),
            loadShortlistedStudents(),
            loadStudentProfiles()
        ]);

        // Populate internship filter
        populateInternshipFilter();

        // Display shortlisted students
        displayShortlistedStudents();

        hideLoading();

    } catch (error) {
        console.error('Error loading shortlisted data:', error);
        showError('Failed to load shortlisted students.');
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

// Load shortlisted students
const loadShortlistedStudents = async () => {
    try {
        const shortlistQuery = query(
            collection(db, 'shortlists'),
            where('companyId', '==', currentUser.uid)
        );

        const shortlistSnapshot = await getDocs(shortlistQuery);
        allShortlistedStudents = shortlistSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        filteredShortlistedStudents = [...allShortlistedStudents];
        console.log('Loaded shortlisted students:', allShortlistedStudents.length);

    } catch (error) {
        console.error('Error loading shortlisted students:', error);
        throw error;
    }
};

// Load student profiles
const loadStudentProfiles = async () => {
    try {
        const studentIds = [...new Set(allShortlistedStudents.map(s => s.studentId))];

        if (studentIds.length === 0) {
            return;
        }

        // Load student profiles in batches (Firestore 'in' limit is 10)
        for (let i = 0; i < studentIds.length; i += 10) {
            const batch = studentIds.slice(i, i + 10);
            const studentsQuery = query(
                collection(db, 'users'),
                where('__name__', 'in', batch)
            );

            const studentsSnapshot = await getDocs(studentsQuery);
            studentsSnapshot.docs.forEach(doc => {
                studentProfiles.set(doc.id, doc.data());
            });
        }

        console.log('Loaded student profiles:', studentProfiles.size);

    } catch (error) {
        console.error('Error loading student profiles:', error);
        // Continue without full profile data
    }
};

// Populate internship filter
const populateInternshipFilter = () => {
    if (!internshipFilter) return;

    // Clear existing options except the defaults
    internshipFilter.innerHTML = `
        <option value="all">All Internships</option>
        <option value="general">General Company Shortlist</option>
    `;

    // Add company internships
    Object.entries(companyInternships).forEach(([id, internship]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = internship.title;
        internshipFilter.appendChild(option);
    });
};

// Display shortlisted students
const displayShortlistedStudents = () => {
    if (!shortlistedGrid) return;

    if (filteredShortlistedStudents.length === 0) {
        showEmptyState();
        return;
    }

    hideEmptyState();

    shortlistedGrid.innerHTML = filteredShortlistedStudents.map(shortlist => {
        const student = studentProfiles.get(shortlist.studentId) || {};
        const internshipTitle = shortlist.internshipId === 'general'
            ? 'General Company Shortlist'
            : companyInternships[shortlist.internshipId]?.title || 'Unknown Internship';

        return `
            <div class="shortlisted-card" data-shortlist-id="${shortlist.id}" data-student-id="${shortlist.studentId}">
                <input type="checkbox" class="bulk-checkbox shortlisted-checkbox shortlisted-card-checkbox" value="${shortlist.id}" />

                <div class="shortlisted-card-header">
                    <img
                        src="https://placehold.co/50x50/E2E8F0/A0B2C4?text=${student.fullName?.charAt(0) || 'S'}"
                        alt="Profile Photo"
                        class="shortlisted-card-photo"
                    >
                    <div class="shortlisted-card-info">
                        <h3>${student.fullName || 'Unknown Student'}</h3>
                        <p>${student.university || 'Unknown University'} - ${student.interest || 'Unknown Major'}</p>
                    </div>
                </div>

                <div class="shortlisted-internship">
                    <i class="fas fa-star shortlisted-star"></i>
                    <strong>Shortlisted for:</strong> ${internshipTitle}
                </div>

                <div class="shortlisted-date">
                    <i class="far fa-calendar"></i> ${formatDate(shortlist.createdAt)}
                </div>

                <div class="shortlisted-actions">
                    <button class="btn btn-tertiary" onclick="viewStudentDetails('${shortlist.id}', '${shortlist.studentId}')">
                        View Profile
                    </button>
                    <button class="btn btn-primary" onclick="inviteForInterview('${shortlist.studentId}')">
                        Invite
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Update select all checkbox state
    updateSelectAllState();
};

// Apply filters
const applyFilters = () => {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const selectedInternship = internshipFilter?.value || 'all';

    filteredShortlistedStudents = allShortlistedStudents.filter(shortlist => {
        const student = studentProfiles.get(shortlist.studentId) || {};

        // Text search
        if (searchTerm) {
            const searchable = `${student.fullName} ${student.university} ${student.interest} ${(student.skills || []).join(' ')}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }

        // Internship filter
        if (selectedInternship !== 'all') {
            const internshipId = shortlist.internshipId || 'general';
            if (internshipId !== selectedInternship) return false;
        }

        return true;
    });

    // Apply current sorting
    applySorting();

    // Display filtered results
    displayShortlistedStudents();
};

// Apply sorting
const applySorting = () => {
    const sortBy = sortSelect?.value || 'recent';

    filteredShortlistedStudents.sort((a, b) => {
        const studentA = studentProfiles.get(a.studentId) || {};
        const studentB = studentProfiles.get(b.studentId) || {};

        switch (sortBy) {
            case 'recent':
                return new Date(b.createdAt?.toDate?.() || b.createdAt) - new Date(a.createdAt?.toDate?.() || a.createdAt);
            case 'oldest':
                return new Date(a.createdAt?.toDate?.() || a.createdAt) - new Date(b.createdAt?.toDate?.() || b.createdAt);
            case 'name':
                return (studentA.fullName || 'Unknown').localeCompare(studentB.fullName || 'Unknown');
            case 'internship':
                const titleA = a.internshipId === 'general' ? 'General' : companyInternships[a.internshipId]?.title || 'Unknown';
                const titleB = b.internshipId === 'general' ? 'General' : companyInternships[b.internshipId]?.title || 'Unknown';
                return titleA.localeCompare(titleB);
            default:
                return 0;
        }
    });
};

// View student details
window.viewStudentDetails = (shortlistId, studentId) => {
    const shortlist = allShortlistedStudents.find(s => s.id === shortlistId);
    const student = studentProfiles.get(studentId) || {};

    if (!shortlist || !student.fullName) {
        showError('Student profile not found.');
        return;
    }

    // Populate modal
    populateStudentModal(shortlist, student);

    // Show modal
    if (studentModal) {
        studentModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
};

// Populate student modal
const populateStudentModal = (shortlist, student) => {
    if (!studentModal) return;

    const internshipTitle = shortlist.internshipId === 'general'
        ? 'General Company Shortlist'
        : companyInternships[shortlist.internshipId]?.title || 'Unknown Internship';

    // Update modal content
    document.getElementById('modal-photo').src = `https://placehold.co/80x80/E2E8F0/A0B2C4?text=${student.fullName?.charAt(0) || 'S'}`;
    document.getElementById('modal-name').textContent = student.fullName || 'Unknown Student';
    document.getElementById('modal-info').textContent = `${student.university || 'Unknown University'} - ${student.interest || 'Unknown Major'}`;
    document.getElementById('modal-internship-title').textContent = internshipTitle;

    document.getElementById('modal-university').innerHTML = `<strong>${student.university || 'Unknown University'}</strong>`;
    document.getElementById('modal-degree').textContent = `${student.interest || 'Unknown Major'} - ${student.year || 'Unknown Year'}`;
    document.getElementById('modal-bio').textContent = student.bio || 'No bio available.';

    // Update skills
    const modalSkills = document.getElementById('modal-skills');
    if (modalSkills && student.skills) {
        modalSkills.innerHTML = student.skills.map(skill =>
            `<span class="skill-tag">${skill}</span>`
        ).join('');
    } else if (modalSkills) {
        modalSkills.innerHTML = '<span style="color: #9ca3af;">No skills listed</span>';
    }

    // Store current shortlist data for modal actions
    studentModal.dataset.shortlistId = shortlist.id;
    studentModal.dataset.studentId = shortlist.studentId;
    studentModal.dataset.internshipId = shortlist.internshipId || 'general';
};

// Handle select all
const handleSelectAll = () => {
    const checkboxes = document.querySelectorAll('.shortlisted-checkbox');
    const isChecked = selectAllCheckbox?.checked || false;

    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
    });
};

// Update select all state
const updateSelectAllState = () => {
    const checkboxes = document.querySelectorAll('.shortlisted-checkbox');
    const checkedBoxes = document.querySelectorAll('.shortlisted-checkbox:checked');

    if (selectAllCheckbox) {
        selectAllCheckbox.checked = checkboxes.length > 0 && checkedBoxes.length === checkboxes.length;
        selectAllCheckbox.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < checkboxes.length;
    }
};

// Get selected shortlist IDs
const getSelectedShortlistIds = () => {
    return Array.from(document.querySelectorAll('.shortlisted-checkbox:checked')).map(cb => cb.value);
};

// Bulk actions
const handleBulkInvite = async () => {
    const selectedIds = getSelectedShortlistIds();
    if (selectedIds.length === 0) {
        showError('Please select students to invite.');
        return;
    }

    // Get student emails for bulk invite
    const studentIds = selectedIds.map(id => {
        const shortlist = allShortlistedStudents.find(s => s.id === id);
        return shortlist?.studentId;
    }).filter(Boolean);

    const emails = studentIds.map(id => {
        const student = studentProfiles.get(id);
        return student?.email;
    }).filter(Boolean);

    if (emails.length === 0) {
        showError('No valid email addresses found for selected students.');
        return;
    }

    // Create mailto link
    const subject = `Interview Invitation - ${currentUser.companyName || 'Our Company'}`;
    const body = `Dear Students,

We were impressed by your profiles and would like to invite you for interviews at ${currentUser.companyName || 'our company'}.

Please reply to this email to schedule a convenient time.

Best regards,
${currentUser.companyName || 'Hiring Team'}`;

    const emailUrl = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = emailUrl;

    showSuccess(`Email client opened for ${selectedIds.length} students.`);
};

const handleBulkRemove = async () => {
    const selectedIds = getSelectedShortlistIds();
    if (selectedIds.length === 0) {
        showError('Please select students to remove.');
        return;
    }

    if (!confirm(`Are you sure you want to remove ${selectedIds.length} student(s) from shortlist?`)) {
        return;
    }

    try {
        showLoading();

        // Remove from Firestore
        await Promise.all(selectedIds.map(id =>
            deleteDoc(doc(db, 'shortlists', id))
        ));

        // Remove from local data
        allShortlistedStudents = allShortlistedStudents.filter(s => !selectedIds.includes(s.id));

        // Refresh display
        applyFilters();

        showSuccess(`${selectedIds.length} student(s) removed from shortlist.`);
        hideLoading();

    } catch (error) {
        console.error('Error removing students from shortlist:', error);
        showError('Failed to remove students from shortlist.');
        hideLoading();
    }
};

const handleBulkEmail = () => {
    const selectedIds = getSelectedShortlistIds();
    if (selectedIds.length === 0) {
        showError('Please select students to email.');
        return;
    }

    // Similar to bulk invite but with generic email
    const studentIds = selectedIds.map(id => {
        const shortlist = allShortlistedStudents.find(s => s.id === id);
        return shortlist?.studentId;
    }).filter(Boolean);

    const emails = studentIds.map(id => {
        const student = studentProfiles.get(id);
        return student?.email;
    }).filter(Boolean);

    if (emails.length === 0) {
        showError('No valid email addresses found for selected students.');
        return;
    }

    const emailUrl = `mailto:${emails.join(',')}`;
    window.location.href = emailUrl;

    showSuccess(`Email client opened for ${selectedIds.length} students.`);
};

// Single student actions
const handleSingleInvite = () => {
    const studentId = studentModal.dataset.studentId;
    if (studentId) {
        closeModal();
        inviteForInterview(studentId);
    }
};

const handleMoveToApplications = async () => {
    const shortlistId = studentModal.dataset.shortlistId;
    const studentId = studentModal.dataset.studentId;
    const internshipId = studentModal.dataset.internshipId;

    if (!shortlistId || !studentId || !internshipId || internshipId === 'general') {
        showError('Cannot move general shortlist to applications. Student must apply to specific internship.');
        return;
    }

    // This would create an application entry
    // Implementation depends on your application data structure
    showSuccess('Feature coming soon: Move to Applications');
    closeModal();
};

const handleSingleRemove = async () => {
    const shortlistId = studentModal.dataset.shortlistId;

    if (!confirm('Are you sure you want to remove this student from shortlist?')) {
        return;
    }

    try {
        showLoading();

        await deleteDoc(doc(db, 'shortlists', shortlistId));

        // Remove from local data
        allShortlistedStudents = allShortlistedStudents.filter(s => s.id !== shortlistId);

        // Refresh display
        applyFilters();

        closeModal();
        showSuccess('Student removed from shortlist.');
        hideLoading();

    } catch (error) {
        console.error('Error removing student from shortlist:', error);
        showError('Failed to remove student from shortlist.');
        hideLoading();
    }
};

// Invite for interview (global function)
window.inviteForInterview = (studentId) => {
    const student = studentProfiles.get(studentId);
    if (!student || !student.email) {
        showError('Student email not found.');
        return;
    }

    const subject = `Interview Invitation - ${currentUser.companyName || 'Our Company'}`;
    const body = `Dear ${student.fullName},

We were impressed by your profile and would like to invite you for an interview at ${currentUser.companyName || 'our company'}.

Please reply to this email to schedule a convenient time.

Best regards,
${currentUser.companyName || 'Hiring Team'}`;

    const emailUrl = `mailto:${student.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = emailUrl;

    showSuccess(`Email invitation sent to ${student.fullName}.`);
};

// Close modal
const closeModal = () => {
    if (studentModal) {
        studentModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

// Show/hide empty state
const showEmptyState = () => {
    const emptyState = document.getElementById('empty-state');
    if (emptyState && shortlistedGrid) {
        emptyState.style.display = 'block';
        shortlistedGrid.style.display = 'none';
    }
};

const hideEmptyState = () => {
    const emptyState = document.getElementById('empty-state');
    if (emptyState && shortlistedGrid) {
        emptyState.style.display = 'none';
        shortlistedGrid.style.display = 'grid';
    }
};

// Utility functions
const formatDate = (dateValue) => {
    if (!dateValue) return 'Unknown date';
    try {
        if (dateValue.toDate) {
            return dateValue.toDate().toLocaleDateString();
        }
        return new Date(dateValue).toLocaleDateString();
    } catch (error) {
        return 'Unknown date';
    }
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);