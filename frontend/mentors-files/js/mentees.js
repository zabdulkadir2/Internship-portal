import { requireAuth, getCurrentUser, initLogout } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, query, where, orderBy, doc, getDoc, addDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const searchInput = document.querySelector('.search-input');
const searchButton = document.querySelector('.search-button');
const universityFilter = document.querySelector('.filter-select');
const focusFilter = document.querySelectorAll('.filter-select')[1];
const applyFiltersBtn = document.querySelector('.apply-filters-button');
const menteeCardsGrid = document.querySelector('.mentee-cards-grid');
const loadMoreBtn = document.querySelector('.load-more-btn');
const noMenteesState = document.querySelector('.no-mentees-state');

// State
let currentUser = null;
let allMentees = [];
let filteredMentees = [];
let displayedCount = 0;
const MENTEES_PER_PAGE = 8;

// Initialize page
const initPage = async () => {
    try {
        // Show loading state
        showLoading();

        // Ensure user is authenticated and is a mentor
        await requireAuth();
        currentUser = await getCurrentUser();

        if (currentUser.role !== 'mentor') {
            alert('Access denied. This page is for mentors only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Initialize logout functionality
        initLogout();

        // Setup event handlers
        setupEventHandlers();

        // Load mentees
        await loadMentees();

        // Display mentees
        displayMentees();

        // Hide loading state
        hideLoading();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load mentees. Please refresh the page.');
        hideLoading();
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    searchButton?.addEventListener('click', applyFilters);
    searchInput?.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') applyFilters();
    });

    applyFiltersBtn?.addEventListener('click', applyFilters);
    loadMoreBtn?.addEventListener('click', loadMoreMentees);

    // Real-time search
    searchInput?.addEventListener('input', debounce(applyFilters, 300));
};

// Load mentees from Firebase
const loadMentees = async () => {
    try {
        // Get all completed session requests for this mentor
        const completedSessionsQuery = query(
            collection(db, 'sessionRequests'),
            where('mentorId', '==', currentUser.uid),
            where('status', '==', 'completed'),
            orderBy('completedAt', 'desc')
        );

        const sessionsSnapshot = await getDocs(completedSessionsQuery);
        const sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Get unique student IDs and their latest session info
        const studentSessions = new Map();
        sessions.forEach(session => {
            if (!studentSessions.has(session.studentId) ||
                session.completedAt?.toDate() > studentSessions.get(session.studentId).completedAt?.toDate()) {
                studentSessions.set(session.studentId, session);
            }
        });

        // Load detailed student information
        const menteePromises = Array.from(studentSessions.values()).map(async (session) => {
            try {
                const studentDoc = await getDoc(doc(db, 'users', session.studentId));
                if (studentDoc.exists()) {
                    const studentData = studentDoc.data();
                    return {
                        id: session.studentId,
                        ...studentData,
                        lastSessionDate: session.completedAt?.toDate(),
                        totalSessions: sessions.filter(s => s.studentId === session.studentId).length,
                        lastSessionId: session.id,
                        rating: session.rating || null
                    };
                }
            } catch (error) {
                console.error('Error loading student data:', error);
            }
            return null;
        });

        const menteeResults = await Promise.all(menteePromises);
        allMentees = menteeResults.filter(mentee => mentee !== null);

        // Sort by last session date (most recent first)
        allMentees.sort((a, b) => {
            if (!a.lastSessionDate) return 1;
            if (!b.lastSessionDate) return -1;
            return b.lastSessionDate - a.lastSessionDate;
        });

        filteredMentees = [...allMentees];
        console.log('Loaded mentees:', allMentees.length);

        // Create demo mentees if no data available
        if (allMentees.length === 0) {
            createDemoMentees();
        }

    } catch (error) {
        console.error('Error loading mentees:', error);
        createDemoMentees();
    }
};

// Create demo mentees for development
const createDemoMentees = () => {
    allMentees = [
        {
            id: 'demo1',
            fullName: 'Jane Doe',
            email: 'jane.doe@knust.edu.gh',
            university: 'KNUST',
            program: 'Computer Science',
            focusArea: 'Frontend Development',
            lastSessionDate: new Date('2025-07-20'),
            totalSessions: 5,
            avatarUrl: '../assets/images/jane.jpg'
        },
        {
            id: 'demo2',
            fullName: 'John Smith',
            email: 'john.smith@ug.edu.gh',
            university: 'University of Ghana',
            program: 'Business Analytics',
            focusArea: 'Data Science',
            lastSessionDate: new Date('2025-07-15'),
            totalSessions: 3,
            avatarUrl: '../assets/images/john.jpg'
        },
        {
            id: 'demo3',
            fullName: 'Emily White',
            email: 'emily.white@ucc.edu.gh',
            university: 'UCC',
            program: 'Environmental Science',
            focusArea: 'Sustainable Practices',
            lastSessionDate: new Date('2025-06-30'),
            totalSessions: 7,
            avatarUrl: '../assets/images/emily.jpg'
        },
        {
            id: 'demo4',
            fullName: 'Michael Adams',
            email: 'michael.adams@knust.edu.gh',
            university: 'KNUST',
            program: 'Mechanical Engineering',
            focusArea: 'Robotics',
            lastSessionDate: new Date('2025-07-01'),
            totalSessions: 2,
            avatarUrl: '../assets/images/adams.jpg'
        }
    ];

    filteredMentees = [...allMentees];
};

// Apply filters
const applyFilters = () => {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const universityValue = universityFilter?.value || 'all';
    const focusValue = focusFilter?.value || 'all';

    filteredMentees = allMentees.filter(mentee => {
        // Search filter
        if (searchTerm) {
            const searchable = `${mentee.fullName} ${mentee.program} ${mentee.focusArea}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }

        // University filter
        if (universityValue !== 'all') {
            const universityMap = {
                'knust': 'KNUST',
                'ug': 'University of Ghana',
                'ucc': 'UCC'
            };
            if (mentee.university !== universityMap[universityValue]) return false;
        }

        // Focus area filter
        if (focusValue !== 'all') {
            const focusMap = {
                'career-guidance': 'Career Guidance',
                'academic-support': 'Academic Support',
                'skill-development': 'Skill Development',
                'research': 'Research Guidance'
            };
            if (mentee.focusArea !== focusMap[focusValue]) return false;
        }

        return true;
    });

    displayedCount = 0;
    displayMentees();
};

// Display mentees
const displayMentees = () => {
    if (!menteeCardsGrid) return;

    if (filteredMentees.length === 0) {
        menteeCardsGrid.style.display = 'none';
        noMenteesState.style.display = 'block';
        loadMoreBtn.style.display = 'none';
        return;
    }

    menteeCardsGrid.style.display = 'grid';
    noMenteesState.style.display = 'none';

    const menteesToShow = filteredMentees.slice(0, displayedCount + MENTEES_PER_PAGE);
    menteeCardsGrid.innerHTML = menteesToShow.map(mentee => createMenteeCard(mentee)).join('');

    displayedCount = menteesToShow.length;

    // Show/hide load more button
    loadMoreBtn.style.display = displayedCount < filteredMentees.length ? 'block' : 'none';
};

// Create mentee card HTML
const createMenteeCard = (mentee) => {
    const lastSessionText = mentee.lastSessionDate
        ? `Last session: ${formatDate(mentee.lastSessionDate)}`
        : 'No sessions yet';

    return `
        <div class="mentee-card">
            <div class="mentee-info-top">
                <img
                    src="${mentee.avatarUrl || `https://placehold.co/80x80/E2E8F0/A0B2C4?text=${mentee.fullName?.charAt(0) || 'M'}`}"
                    alt="${mentee.fullName} Profile"
                    class="mentee-profile-img"
                />
                <div class="mentee-details-text">
                    <h3 class="mentee-name">${escapeHtml(mentee.fullName || 'Unknown Student')}</h3>
                    <p class="mentee-university">${escapeHtml(mentee.university || 'Unknown')} – ${escapeHtml(mentee.program || 'Unknown Program')}</p>
                    <p class="mentee-focus">Interest: ${escapeHtml(mentee.focusArea || 'General')}</p>
                    <div class="mentee-stats">
                        <span class="session-count">${mentee.totalSessions || 0} sessions completed</span>
                        ${mentee.rating ? `<span class="mentee-rating">★ ${mentee.rating}/5</span>` : ''}
                    </div>
                </div>
            </div>
            <p class="mentee-last-session">${lastSessionText}</p>
            <div class="mentee-actions">
                <button class="btn btn-primary" onclick="viewMenteeProfile('${mentee.id}')">View Profile</button>
                <button class="btn btn-secondary" onclick="messageMentee('${mentee.id}')">Message</button>
                <button class="btn btn-secondary schedule-session-btn" onclick="scheduleSession('${mentee.id}')">
                    Schedule Session
                </button>
            </div>
        </div>
    `;
};

// Action handlers (global functions)
window.viewMenteeProfile = (menteeId) => {
    const mentee = allMentees.find(m => m.id === menteeId);
    if (!mentee) return;

    const profileInfo = `
Student Profile: ${mentee.fullName}

📧 Email: ${mentee.email || 'Not available'}
🎓 University: ${mentee.university || 'Unknown'}
📚 Program: ${mentee.program || 'Unknown'}
🎯 Focus Area: ${mentee.focusArea || 'General'}
📊 Total Sessions: ${mentee.totalSessions || 0}
📅 Last Session: ${mentee.lastSessionDate ? formatDate(mentee.lastSessionDate) : 'No sessions yet'}
${mentee.rating ? `⭐ Last Rating: ${mentee.rating}/5` : ''}
    `;

    alert(profileInfo);
};

window.messageMentee = (menteeId) => {
    const mentee = allMentees.find(m => m.id === menteeId);
    if (!mentee) return;

    // In a real app, this would open a messaging interface
    alert(`Opening message conversation with ${mentee.fullName}...\n\n(This would normally open your messaging platform or email client)`);
};

window.scheduleSession = async (menteeId) => {
    try {
        const mentee = allMentees.find(m => m.id === menteeId);
        if (!mentee) {
            showError('Mentee not found.');
            return;
        }

        // Create a new session request
        const sessionRequest = {
            mentorId: currentUser.uid,
            studentId: menteeId,
            mentorName: currentUser.fullName,
            studentName: mentee.fullName,
            studentEmail: mentee.email,
            status: 'confirmed', // Direct scheduling by mentor
            createdAt: serverTimestamp(),
            scheduledBy: 'mentor',
            topic: 'Follow-up mentorship session'
        };

        await addDoc(collection(db, 'sessionRequests'), sessionRequest);

        showSuccess(`Session scheduled with ${mentee.fullName}! They will be notified.`);

    } catch (error) {
        console.error('Error scheduling session:', error);
        showError('Failed to schedule session. Please try again.');
    }
};

// Load more mentees
const loadMoreMentees = () => {
    displayMentees();
};

// Utility functions
const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const formatDate = (date) => {
    if (!date) return 'Unknown date';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// Loading state
const showLoading = () => {
    if (menteeCardsGrid) {
        menteeCardsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <p style="color: #666; font-size: 16px;">Loading mentees...</p>
            </div>
        `;
    }
};

const hideLoading = () => {
    // Loading state is replaced by actual content in displayMentees()
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