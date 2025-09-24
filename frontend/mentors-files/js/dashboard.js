import { requireAuth, getCurrentUser, initLogout } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// State
let currentUser = null;

// Initialize mentor dashboard
const initDashboard = async () => {
    try {
        // Show loading state
        showLoading();

        // Ensure user is authenticated
        await requireAuth();

        // Load user data and update display
        currentUser = await getCurrentUser();
        console.log('Mentor data loaded:', currentUser);

        // Verify user is a mentor
        if (currentUser.role !== 'mentor') {
            alert('Access denied. This page is for mentors only.');
            window.location.href = '/public/login.html';
            return;
        }

        // Update mentor name in UI
        updateMentorName();

        // Initialize logout functionality
        initLogout();

        // Load dashboard data
        await loadDashboardData();

        // Hide loading state
        hideLoading();

    } catch (error) {
        console.error('Mentor dashboard initialization error:', error);
        showError('Failed to load dashboard data. Please refresh the page.');
        hideLoading();
    }
};

// Update mentor name in the UI
const updateMentorName = () => {
    const mentorNameElement = document.getElementById('mentor-name');
    if (mentorNameElement && currentUser.fullName) {
        mentorNameElement.textContent = currentUser.fullName;
    }
};

// Load mentor dashboard-specific data
const loadDashboardData = async () => {
    try {
        // Show individual section loading states
        showSectionLoading('dashboard');
        showSectionLoading('sessions');
        showSectionLoading('mentees');

        // Load all dashboard data in parallel
        const results = await Promise.all([
            loadMentorStatistics(),
            loadUpcomingSessions(),
            loadRecentMentees()
        ]);

        console.log('Mentor dashboard data loaded successfully');

        // Hide section loading states
        hideSectionLoading('dashboard');
        hideSectionLoading('sessions');
        hideSectionLoading('mentees');

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        // Hide loading states on error
        hideSectionLoading('dashboard');
        hideSectionLoading('sessions');
        hideSectionLoading('mentees');
    }
};

// Load mentor statistics
const loadMentorStatistics = async () => {
    try {
        // Load session requests
        const sessionRequestsQuery = query(
            collection(db, 'sessionRequests'),
            where('mentorId', '==', currentUser.uid)
        );
        const requestsSnapshot = await getDocs(sessionRequestsQuery);

        const allRequests = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter future confirmed sessions for upcoming count
        const now = new Date();
        const upcomingConfirmed = allRequests.filter(req =>
            req.status === 'confirmed' &&
            req.sessionDate &&
            req.sessionDate.toDate() > now
        ).length;

        // Calculate statistics
        const stats = {
            totalRequests: allRequests.length,
            pendingRequests: allRequests.filter(req => req.status === 'pending').length,
            completedSessions: allRequests.filter(req => req.status === 'completed').length,
            activeMentees: new Set(allRequests.filter(req => req.status === 'completed').map(req => req.studentId)).size,
            upcomingSessions: upcomingConfirmed,
            averageRating: calculateAverageRating(allRequests.filter(req => req.rating))
        };

        // Update statistics display
        updateStatisticsDisplay(stats);

    } catch (error) {
        console.error('Error loading mentor statistics:', error);
        // Set default stats on error
        updateStatisticsDisplay({
            totalRequests: 0,
            pendingRequests: 0,
            completedSessions: 0,
            activeMentees: 0,
            upcomingSessions: 0,
            averageRating: 0
        });
    }
};

// Load recent session requests
const loadRecentSessionRequests = async () => {
    try {
        const recentRequestsQuery = query(
            collection(db, 'sessionRequests'),
            where('mentorId', '==', currentUser.uid),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc'),
            limit(3)
        );

        const requestsSnapshot = await getDocs(recentRequestsQuery);
        const requests = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        displayRecentRequests(requests);

    } catch (error) {
        console.error('Error loading recent session requests:', error);
        displayRecentRequests([]);
    }
};

// Load upcoming sessions
const loadUpcomingSessions = async () => {
    try {
        const upcomingSessionsQuery = query(
            collection(db, 'sessionRequests'),
            where('mentorId', '==', currentUser.uid),
            where('status', '==', 'confirmed'),
            limit(3)
        );

        const sessionsSnapshot = await getDocs(upcomingSessionsQuery);
        const sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter for future sessions
        const futureSessions = sessions.filter(session => {
            return session.sessionDate && session.sessionDate.toDate() > new Date();
        });

        displayUpcomingSessions(futureSessions);

    } catch (error) {
        console.error('Error loading upcoming sessions:', error);
        displayUpcomingSessions([]);
    }
};

// Load recent mentees
const loadRecentMentees = async () => {
    try {
        const completedSessionsQuery = query(
            collection(db, 'sessionRequests'),
            where('mentorId', '==', currentUser.uid),
            where('status', '==', 'completed'),
            orderBy('completedAt', 'desc'),
            limit(5)
        );

        const sessionsSnapshot = await getDocs(completedSessionsQuery);
        const sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Get unique mentees
        const uniqueMentees = [];
        const seenStudents = new Set();

        for (const session of sessions) {
            if (!seenStudents.has(session.studentId)) {
                seenStudents.add(session.studentId);
                uniqueMentees.push(session);
            }
        }

        displayRecentMentees(uniqueMentees.slice(0, 3));

    } catch (error) {
        console.error('Error loading recent mentees:', error);
        displayRecentMentees([]);
    }
};

// Update statistics display
const updateStatisticsDisplay = (stats) => {
    const statElements = {
        'pending-requests': stats.pendingRequests,
        'active-mentees': stats.activeMentees,
        'upcoming-sessions-count': stats.upcomingSessions || 0,
        'completed-sessions': stats.completedSessions
    };

    Object.entries(statElements).forEach(([elementId, value]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    });
};

// Display recent requests
const displayRecentRequests = (requests) => {
    const container = document.getElementById('recent-requests');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p>No pending session requests.</p>';
        return;
    }

    container.innerHTML = requests.map(request => `
        <div class="request-item">
            <div class="request-info">
                <h4>${escapeHtml(request.studentName || 'Unknown Student')}</h4>
                <p>${escapeHtml(request.topic || 'General mentoring session')}</p>
                <span class="request-date">${formatDate(request.createdAt?.toDate())}</span>
            </div>
            <div class="request-actions">
                <button class="btn btn-sm btn-success" onclick="acceptRequest('${request.id}')">Accept</button>
                <button class="btn btn-sm btn-secondary" onclick="viewRequest('${request.id}')">View</button>
            </div>
        </div>
    `).join('');
};

// Display upcoming sessions
const displayUpcomingSessions = (sessions) => {
    const container = document.getElementById('upcoming-sessions');
    const noSessionsDiv = document.getElementById('no-sessions');

    if (!container) return;

    if (sessions.length === 0) {
        container.style.display = 'none';
        if (noSessionsDiv) noSessionsDiv.style.display = 'block';
        return;
    }

    container.style.display = 'grid';
    if (noSessionsDiv) noSessionsDiv.style.display = 'none';

    container.innerHTML = sessions.map(session => `
        <div class="session-card">
            <p class="session-date-time">${formatDateTime(session.sessionDate?.toDate())}</p>
            <p class="session-student">Student: ${escapeHtml(session.studentName || 'Unknown Student')}</p>
            <p class="session-platform">Platform: ${escapeHtml(session.platform || 'Not specified')}</p>
            <div class="session-actions">
                <button class="btn btn-primary" onclick="joinSession('${session.id}')">${session.meetingLink ? 'Join Now' : 'View Details'}</button>
                <button class="btn btn-secondary" onclick="rescheduleSession('${session.id}')">Reschedule</button>
            </div>
        </div>
    `).join('');
};

// Display recent mentees
const displayRecentMentees = async (mentees) => {
    const container = document.getElementById('recent-mentees');
    const noMenteesDiv = document.getElementById('no-mentees');

    if (!container) return;

    if (mentees.length === 0) {
        container.style.display = 'none';
        if (noMenteesDiv) noMenteesDiv.style.display = 'block';
        return;
    }

    container.style.display = 'grid';
    if (noMenteesDiv) noMenteesDiv.style.display = 'none';

    // Enrich mentees with student data
    const enrichedMentees = await Promise.all(
        mentees.map(async (mentee) => {
            try {
                if (mentee.studentId) {
                    const studentDoc = await getDoc(doc(db, 'users', mentee.studentId));
                    if (studentDoc.exists()) {
                        const studentData = studentDoc.data();
                        return {
                            ...mentee,
                            studentData: studentData
                        };
                    }
                }
                return mentee;
            } catch (error) {
                console.error('Error loading student data:', error);
                return mentee;
            }
        })
    );

    container.innerHTML = enrichedMentees.map(mentee => {
        const studentData = mentee.studentData || {};
        return `
            <div class="mentee-card">
                <img
                    src="${studentData.profilePicture || `https://placehold.co/60x60/E2E8F0/A0B2C4?text=${mentee.studentName?.charAt(0) || 'S'}`}"
                    alt="Mentee Profile"
                    class="mentee-profile-img"
                />
                <p class="mentee-name">${escapeHtml(mentee.studentName || 'Unknown Student')}</p>
                <p class="mentee-focus">Focus: ${escapeHtml(studentData.focusArea || 'General mentoring')}</p>
                <p class="mentee-last-session">Last session: ${formatDate(mentee.completedAt?.toDate())}</p>
                ${mentee.rating ? `<p class="mentee-rating">Rating: ★ ${mentee.rating}/5</p>` : ''}
                <button class="btn btn-secondary" onclick="viewMenteeProfile('${mentee.studentId}')">View Profile</button>
            </div>
        `;
    }).join('');
};

// Action handlers (global functions)
window.acceptRequest = (requestId) => {
    // In a real app, this would update the request status and schedule the session
    alert(`Request ${requestId} accepted! (This would normally schedule the session)`);
};

window.viewRequest = (requestId) => {
    // Navigate to detailed request view
    window.location.href = `request.html?id=${requestId}`;
};

window.joinSession = (sessionId) => {
    // Navigate to the schedule page for session management
    window.location.href = `myschedule.html?session=${sessionId}`;
};

window.rescheduleSession = (sessionId) => {
    // Navigate to the schedule page for session management
    window.location.href = `myschedule.html?reschedule=${sessionId}`;
};

window.viewMenteeProfile = (menteeId) => {
    // Navigate to mentees page with specific mentee
    window.location.href = `mentees.html?mentee=${menteeId}`;
};

// Utility functions
const calculateAverageRating = (ratedSessions) => {
    if (ratedSessions.length === 0) return 0;
    const sum = ratedSessions.reduce((acc, session) => acc + (session.rating || 0), 0);
    return sum / ratedSessions.length;
};

const formatDate = (date) => {
    if (!date) return 'Unknown date';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const formatDateTime = (date) => {
    if (!date) return 'Unknown date';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// Loading state
const showLoading = () => {
    const loadingIndicator = document.getElementById('dashboard-loading');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }
};

const hideLoading = () => {
    const loadingIndicator = document.getElementById('dashboard-loading');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
};

// Section-specific loading states
const showSectionLoading = (section) => {
    const loadingIds = {
        'dashboard': 'dashboard-loading',
        'sessions': 'sessions-loading',
        'mentees': 'mentees-loading'
    };

    const loadingId = loadingIds[section];
    if (loadingId) {
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) {
            loadingElement.style.display = 'block';
        }

        // Hide content containers while loading
        const contentIds = {
            'dashboard': 'stats-container',
            'sessions': 'upcoming-sessions',
            'mentees': 'recent-mentees'
        };

        const contentId = contentIds[section];
        if (contentId) {
            const contentElement = document.getElementById(contentId);
            if (contentElement) {
                contentElement.style.display = 'none';
            }
        }
    }
};

const hideSectionLoading = (section) => {
    const loadingIds = {
        'dashboard': 'dashboard-loading',
        'sessions': 'sessions-loading',
        'mentees': 'mentees-loading'
    };

    const loadingId = loadingIds[section];
    if (loadingId) {
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }

        // Show content containers after loading
        const contentIds = {
            'dashboard': 'stats-container',
            'sessions': 'upcoming-sessions',
            'mentees': 'recent-mentees'
        };

        const contentId = contentIds[section];
        if (contentId) {
            const contentElement = document.getElementById(contentId);
            if (contentElement) {
                contentElement.style.display = 'grid';
            }
        }
    }
};

// Error display
const showError = (message) => {
    console.error(message);
    // You could add a more user-friendly error display here
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);