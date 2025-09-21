import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const profilesGrid = document.querySelector('.student-profile-grid');
const searchInput = document.getElementById('search-students');
const universityFilter = document.getElementById('filter-university');
const majorFilter = document.getElementById('filter-major');
const yearFilter = document.getElementById('filter-year');
const sortSelect = document.getElementById('sort-by');
const searchButton = document.querySelector('.filter-panel .btn-primary');
const studentModal = document.getElementById('student-detail-modal');
const modalCloseBtn = document.querySelector('.close-modal');
const internshipSelector = document.getElementById('internship-selector');

// State
let allStudents = [];
let filteredStudents = [];
let shortlistedStudents = new Map(); // Map internshipId -> Set of studentIds
let currentUser = null;
let companyInternships = [];
let selectedInternshipId = 'general';

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
        await loadData();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load student profiles. Please refresh the page.');
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    // Search and filter handlers
    searchButton?.addEventListener('click', applyFilters);
    searchInput?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') applyFilters();
    });
    universityFilter?.addEventListener('change', applyFilters);
    majorFilter?.addEventListener('change', applyFilters);
    yearFilter?.addEventListener('change', applyFilters);
    sortSelect?.addEventListener('change', applySorting);
    internshipSelector?.addEventListener('change', handleInternshipChange);

    // Modal handlers
    modalCloseBtn?.addEventListener('click', closeModal);
    studentModal?.addEventListener('click', (e) => {
        if (e.target === studentModal) closeModal();
    });
};

// Load initial data
const loadData = async () => {
    try {
        showLoading();

        // Load all data in parallel
        await Promise.all([
            loadAllStudents(),
            loadCompanyInternships(),
            loadShortlistedStudents()
        ]);

        // Display students
        displayStudents();

        hideLoading();

    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load student profiles.');
        hideLoading();
    }
};

// Load all student profiles
const loadAllStudents = async () => {
    try {
        const studentsQuery = query(
            collection(db, 'users'),
            where('role', '==', 'student')
        );

        const studentsSnapshot = await getDocs(studentsQuery);
        allStudents = studentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        filteredStudents = [...allStudents];
        console.log('Loaded students:', allStudents.length);

    } catch (error) {
        console.error('Error loading students:', error);
        throw error;
    }
};

// Load company internships for selector
const loadCompanyInternships = async () => {
    try {
        const internshipsQuery = query(
            collection(db, 'internships'),
            where('companyId', '==', currentUser.uid)
        );

        const internshipsSnapshot = await getDocs(internshipsQuery);
        companyInternships = internshipsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Populate internship selector
        populateInternshipSelector();

        console.log('Loaded company internships:', companyInternships.length);

    } catch (error) {
        console.error('Error loading company internships:', error);
        // Continue without internship data
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

// Display students in grid
const displayStudents = () => {
    if (!profilesGrid) return;

    if (filteredStudents.length === 0) {
        showEmptyState();
        return;
    }

    hideEmptyState();

    profilesGrid.innerHTML = filteredStudents.map(student => {
        const currentShortlist = shortlistedStudents.get(selectedInternshipId) || new Set();
        const isShortlisted = currentShortlist.has(student.id);
        const skills = student.skills || [];
        const displaySkills = skills.slice(0, 4); // Show first 4 skills

        return `
            <div class="profile-card card" data-student-id="${student.id}">
                <div class="profile-header">
                    <img
                        src="https://placehold.co/80x80/E2E8F0/A0B2C4?text=${student.fullName?.charAt(0) || 'S'}"
                        alt="Profile Photo"
                        class="profile-photo"
                    >
                    <h3 class="profile-name">${student.fullName || 'Unknown Student'}</h3>
                    <p class="profile-university">${student.university || 'Unknown University'} - ${student.interest || 'Unknown Major'}</p>
                    <p class="profile-year">${getYearLabel(student.year) || 'Unknown Year'}</p>
                    <div class="profile-summary">"${student.bio || 'No bio available.'}"</div>
                </div>
                <div class="profile-body">
                    <div class="skill-tags">
                        ${displaySkills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
                        ${skills.length > 4 ? `<span class="skill-tag more">+${skills.length - 4} more</span>` : ''}
                    </div>
                    <div class="profile-availability">Available: ${student.availability || 'Not specified'}</div>
                </div>
                <div class="profile-actions">
                    <button class="btn btn-tertiary" onclick="viewStudentProfile('${student.id}')">View Full Profile</button>
                    <button class="btn ${isShortlisted ? 'btn-success' : 'btn-secondary'}" onclick="toggleShortlist('${student.id}')">
                        ${isShortlisted ? 'Shortlisted ✓' : 'Shortlist'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

// Apply filters
const applyFilters = () => {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const selectedUniversity = universityFilter?.value || 'all';
    const selectedMajor = majorFilter?.value || 'all';
    const selectedYear = yearFilter?.value || 'all';

    filteredStudents = allStudents.filter(student => {
        // Text search
        if (searchTerm) {
            const searchable = `${student.fullName} ${student.university} ${student.interest} ${(student.skills || []).join(' ')}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }

        // University filter
        if (selectedUniversity !== 'all') {
            const university = student.university?.toLowerCase() || '';
            if (!university.includes(selectedUniversity.toLowerCase())) {
                return false;
            }
        }

        // Major filter
        if (selectedMajor !== 'all') {
            const interest = student.interest?.toLowerCase() || '';
            if (!interest.includes(selectedMajor.toLowerCase())) {
                return false;
            }
        }

        // Year filter
        if (selectedYear !== 'all') {
            if (selectedYear === 'final' && !['4', 'final', 'senior'].includes(student.year?.toLowerCase())) {
                return false;
            } else if (selectedYear !== 'final' && student.year !== selectedYear) {
                return false;
            }
        }

        return true;
    });

    // Apply current sorting
    applySorting();

    // Display filtered results
    displayStudents();
};

// Apply sorting
const applySorting = () => {
    const sortBy = sortSelect?.value || 'name';

    filteredStudents.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return (a.fullName || 'Unknown').localeCompare(b.fullName || 'Unknown');
            case 'year':
                const yearA = getYearValue(a.year);
                const yearB = getYearValue(b.year);
                return yearB - yearA; // Newest first
            case 'skills':
                const skillsA = a.skills?.length || 0;
                const skillsB = b.skills?.length || 0;
                return skillsB - skillsA; // More skills first
            default:
                return 0;
        }
    });
};

// View student profile in modal
window.viewStudentProfile = async (studentId) => {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    try {
        // Populate modal with student data
        populateStudentModal(student);

        // Show modal
        if (studentModal) {
            studentModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

    } catch (error) {
        console.error('Error viewing student profile:', error);
        showError('Failed to load student profile.');
    }
};

// Populate student modal
const populateStudentModal = (student) => {
    const modal = studentModal;
    if (!modal) return;

    // Update modal content
    const modalPhoto = modal.querySelector('#modal-photo, .modal-profile-photo');
    const modalName = modal.querySelector('#modal-name');
    const modalInfo = modal.querySelector('#modal-info');
    const modalSkills = modal.querySelector('#modal-skills');

    if (modalPhoto) {
        modalPhoto.src = `https://placehold.co/80x80/E2E8F0/A0B2C4?text=${student.fullName?.charAt(0) || 'S'}`;
        modalPhoto.alt = `${student.fullName || 'Unknown Student'} Photo`;
    }

    if (modalName) {
        modalName.textContent = student.fullName || 'Unknown Student';
    }

    if (modalInfo) {
        modalInfo.textContent = `${student.university || 'Unknown University'} - ${student.interest || 'Unknown Major'}`;
    }

    if (modalSkills) {
        const skills = student.skills || [];
        modalSkills.innerHTML = skills.map(skill =>
            `<span class="skill-tag">${skill}</span>`
        ).join('');
    }

    // Update education section
    const educationSection = modal.querySelector('.detail-section:first-of-type p:first-of-type');
    if (educationSection) {
        educationSection.innerHTML = `<strong>${student.university || 'Unknown University'}</strong>`;
    }

    const degreeSection = modal.querySelector('.detail-section:first-of-type p:last-of-type');
    if (degreeSection) {
        degreeSection.textContent = `B.S. in ${student.interest || 'Unknown Major'} - ${getYearLabel(student.year) || 'Unknown Year'}`;
    }

    // Update experience section
    const experienceSection = modal.querySelector('.detail-section:nth-of-type(3)');
    if (experienceSection && student.experience) {
        const experienceList = experienceSection.querySelector('ul');
        if (experienceList) {
            experienceList.innerHTML = student.experience.map(exp =>
                `<li>${exp}</li>`
            ).join('');
        }
    }

    // Setup modal actions
    setupStudentModalActions(student);
};

// Setup student modal action buttons
const setupStudentModalActions = (student) => {
    const modal = studentModal;
    if (!modal) return;

    // Get action buttons
    const inviteBtn = modal.querySelector('.btn-primary');
    const downloadBtn = modal.querySelector('.btn-secondary');

    // Remove existing listeners
    const newInviteBtn = inviteBtn?.cloneNode(true);
    const newDownloadBtn = downloadBtn?.cloneNode(true);

    inviteBtn?.parentNode?.replaceChild(newInviteBtn, inviteBtn);
    downloadBtn?.parentNode?.replaceChild(newDownloadBtn, downloadBtn);

    // Add new listeners
    newInviteBtn?.addEventListener('click', () => inviteForInterview(student));
    newDownloadBtn?.addEventListener('click', () => downloadResume(student));
};

// Toggle shortlist status
window.toggleShortlist = async (studentId) => {
    try {
        const currentShortlist = shortlistedStudents.get(selectedInternshipId) || new Set();
        const isCurrentlyShortlisted = currentShortlist.has(studentId);

        if (isCurrentlyShortlisted) {
            // Remove from shortlist
            await removeFromShortlist(studentId, selectedInternshipId);
            currentShortlist.delete(studentId);

            const internshipName = getInternshipName(selectedInternshipId);
            showSuccess(`Student removed from ${internshipName} shortlist`);
        } else {
            // Add to shortlist
            await addToShortlist(studentId, selectedInternshipId);
            currentShortlist.add(studentId);

            // Ensure the set exists in the map
            shortlistedStudents.set(selectedInternshipId, currentShortlist);

            const internshipName = getInternshipName(selectedInternshipId);
            showSuccess(`Student added to ${internshipName} shortlist`);

            // Create notification for student
            await createStudentNotification(studentId, selectedInternshipId);
        }

        // Update display
        displayStudents();

    } catch (error) {
        console.error('Error toggling shortlist:', error);
        showError('Failed to update shortlist.');
    }
};

// Add student to shortlist
const addToShortlist = async (studentId, internshipId) => {
    const shortlistId = `${currentUser.uid}_${internshipId}_${studentId}`;
    const shortlistRef = doc(db, 'shortlists', shortlistId);

    await setDoc(shortlistRef, {
        companyId: currentUser.uid,
        studentId: studentId,
        internshipId: internshipId,
        createdAt: new Date(),
        companyName: currentUser.companyName || 'Unknown Company'
    });
};

// Remove student from shortlist
const removeFromShortlist = async (studentId, internshipId) => {
    const shortlistId = `${currentUser.uid}_${internshipId}_${studentId}`;
    const shortlistRef = doc(db, 'shortlists', shortlistId);

    await deleteDoc(shortlistRef);
};

// Invite student for interview
const inviteForInterview = (student) => {
    const subject = `Interview Invitation - ${currentUser.companyName || 'Our Company'}`;
    const body = `Dear ${student.fullName},

We were impressed by your profile and would like to invite you for an interview at ${currentUser.companyName || 'our company'}.

Please reply to this email to schedule a convenient time.

Best regards,
${currentUser.companyName || 'Hiring Team'}`;

    const emailUrl = `mailto:${student.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = emailUrl;

    closeModal();
};

// Download resume (placeholder)
const downloadResume = (student) => {
    // In a real implementation, you would have resume URLs stored in the student profile
    showError('Resume download functionality would be implemented with actual resume file storage.');
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

    if (emptyState && profilesGrid) {
        emptyState.style.display = 'block';
        profilesGrid.style.display = 'none';
    }
};

const hideEmptyState = () => {
    const emptyState = document.getElementById('empty-state');

    if (emptyState && profilesGrid) {
        emptyState.style.display = 'none';
        profilesGrid.style.display = 'grid';
    }
};

// Utility functions
const getYearLabel = (year) => {
    const yearMap = {
        '1': '1st Year',
        '2': '2nd Year',
        '3': '3rd Year',
        '4': 'Final Year',
        'final': 'Final Year',
        'senior': 'Final Year'
    };
    return yearMap[year?.toLowerCase()] || year;
};

const getYearValue = (year) => {
    const yearMap = {
        '1': 1,
        '2': 2,
        '3': 3,
        '4': 4,
        'final': 4,
        'senior': 4
    };
    return yearMap[year?.toLowerCase()] || 0;
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
    loadingDiv.textContent = 'Loading student profiles...';
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

// Populate internship selector dropdown
const populateInternshipSelector = () => {
    if (!internshipSelector) return;

    // Clear existing options except the general one
    internshipSelector.innerHTML = '<option value="general">General Company Shortlist</option>';

    // Add active internships
    companyInternships
        .filter(internship => internship.status === 'active')
        .forEach(internship => {
            const option = document.createElement('option');
            option.value = internship.id;
            option.textContent = internship.title;
            internshipSelector.appendChild(option);
        });
};

// Handle internship selection change
const handleInternshipChange = () => {
    selectedInternshipId = internshipSelector?.value || 'general';
    displayStudents(); // Refresh display with new shortlist context
};

// Get internship name for display
const getInternshipName = (internshipId) => {
    if (internshipId === 'general') return 'general company';
    const internship = companyInternships.find(i => i.id === internshipId);
    return internship ? internship.title : 'unknown internship';
};

// Create notification for student when shortlisted
const createStudentNotification = async (studentId, internshipId) => {
    try {
        const notificationId = `${Date.now()}_${studentId}_shortlist`;
        const notificationRef = doc(db, 'notifications', notificationId);

        const internshipName = getInternshipName(internshipId);
        const companyName = currentUser.companyName || 'A company';

        await setDoc(notificationRef, {
            recipientId: studentId,
            senderId: currentUser.uid,
            type: 'shortlist',
            title: 'You\'ve been shortlisted!',
            message: `${companyName} has shortlisted you for ${internshipName === 'general company' ? 'their opportunities' : internshipName}.`,
            internshipId: internshipId !== 'general' ? internshipId : null,
            companyId: currentUser.uid,
            companyName: companyName,
            read: false,
            createdAt: new Date()
        });

        console.log('Notification created for student:', studentId);
    } catch (error) {
        console.error('Error creating student notification:', error);
        // Don't throw - shortlisting should still work even if notification fails
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);