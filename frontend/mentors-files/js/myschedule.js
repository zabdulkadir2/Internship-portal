import { requireAuth, getCurrentUser, initLogout } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, query, where, orderBy, updateDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const sessionCardsGrid = document.querySelector('.session-cards-grid');
const noSessionsState = document.querySelector('.no-sessions-state');

// State
let currentUser = null;
let allSessions = [];
let upcomingSessions = [];

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

        // Load schedule data
        await loadScheduleData();

        // Display sessions
        displaySessions();

        // Hide loading state
        hideLoading();

        // Set up periodic refresh for real-time updates
        setInterval(() => {
            loadScheduleData();
            displaySessions();
        }, 30000); // Refresh every 30 seconds

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load schedule. Please refresh the page.');
        hideLoading();
    }
};

// Load schedule data from Firebase
const loadScheduleData = async () => {
    try {
        // Get all session requests for this mentor (confirmed and pending)
        const sessionRequestsQuery = query(
            collection(db, 'sessionRequests'),
            where('mentorId', '==', currentUser.uid),
            where('status', 'in', ['confirmed', 'pending', 'cancelled']),
            orderBy('createdAt', 'desc')
        );

        const sessionsSnapshot = await getDocs(sessionRequestsQuery);
        allSessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter for upcoming sessions and sort by session date
        const now = new Date();
        upcomingSessions = allSessions
            .filter(session => {
                // Show pending sessions and confirmed future sessions
                if (session.status === 'pending') return true;
                if (session.status === 'cancelled') {
                    // Show cancelled sessions from the last 7 days
                    const cancelledDate = session.cancelledAt?.toDate() || session.createdAt?.toDate();
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return cancelledDate > weekAgo;
                }
                return session.sessionDate && session.sessionDate.toDate() > now;
            })
            .sort((a, b) => {
                // Sort by session date if available, otherwise by creation date
                const dateA = a.sessionDate?.toDate() || a.createdAt?.toDate() || new Date(0);
                const dateB = b.sessionDate?.toDate() || b.createdAt?.toDate() || new Date(0);
                return dateA - dateB;
            });

        console.log('Loaded schedule data:', upcomingSessions.length, 'upcoming sessions');

        // Create demo data if no sessions available
        if (allSessions.length === 0) {
            createDemoSessions();
        }

    } catch (error) {
        console.error('Error loading schedule data:', error);
        createDemoSessions();
    }
};

// Create demo sessions for development
const createDemoSessions = () => {
    const now = new Date();
    upcomingSessions = [
        {
            id: 'demo1',
            studentName: 'Aisha Mohammed',
            topic: 'Technical Interview Prep',
            sessionDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
            status: 'confirmed',
            platform: 'Google Meet',
            meetingLink: 'https://meet.google.com/abc-defg-hij'
        },
        {
            id: 'demo2',
            studentName: 'Kwame Nkrumah',
            topic: 'Project Brainstorm',
            sessionDate: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000), // Next week
            status: 'pending',
            platform: 'Zoom',
            createdAt: { toDate: () => new Date() }
        },
        {
            id: 'demo3',
            studentName: 'Tech Solutions Ltd.',
            topic: 'Senior Developer Role',
            sessionDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // In 2 weeks
            status: 'confirmed',
            platform: 'Company Office (Accra)',
            isInterview: true
        },
        {
            id: 'demo4',
            studentName: 'Fatima Ali',
            topic: 'Career Guidance',
            status: 'cancelled',
            platform: 'Google Meet',
            cancelledAt: { toDate: () => new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) }, // 2 days ago
            cancelReason: 'Student had to reschedule due to exam conflicts'
        }
    ];
};

// Display sessions
const displaySessions = () => {
    if (!sessionCardsGrid) return;

    if (upcomingSessions.length === 0) {
        sessionCardsGrid.style.display = 'none';
        noSessionsState.style.display = 'block';
        return;
    }

    sessionCardsGrid.style.display = 'grid';
    noSessionsState.style.display = 'none';

    sessionCardsGrid.innerHTML = upcomingSessions.map(session => createSessionCard(session)).join('');
};

// Create session card HTML
const createSessionCard = (session) => {
    const sessionDate = session.sessionDate?.toDate();
    const isUpcoming = sessionDate && sessionDate > new Date();
    const canJoin = isUpcoming && session.status === 'confirmed' && session.meetingLink;

    let dateDisplay;
    if (sessionDate) {
        dateDisplay = `📅 ${formatDateTime(sessionDate)}`;
    } else {
        const createdDate = session.createdAt?.toDate();
        dateDisplay = `📅 ${createdDate ? formatDateTime(createdDate) : 'Date TBD'}`;
    }

    let statusClass, statusText;
    switch (session.status) {
        case 'confirmed':
            statusClass = 'status-confirmed';
            statusText = '✅ Confirmed';
            break;
        case 'pending':
            statusClass = 'status-pending';
            statusText = '⏳ Pending';
            break;
        case 'cancelled':
            statusClass = 'status-cancelled';
            statusText = '❌ Cancelled';
            break;
        default:
            statusClass = 'status-pending';
            statusText = '⏳ Pending';
    }

    const studentTitle = session.isInterview ? '💬 Interview:' : '👤 Student:';

    return `
        <div class="session-card">
            <p class="session-date-time">${dateDisplay}</p>
            <h3 class="session-mentee">${studentTitle} ${escapeHtml(session.studentName || 'Unknown')}</h3>
            <p class="session-topic">Topic: ${escapeHtml(session.topic || 'General mentoring')}</p>
            <p class="session-platform">📍 ${escapeHtml(session.platform || 'Platform TBD')}</p>
            <p class="session-status ${statusClass}">${statusText}</p>
            <div class="session-actions">
                ${createActionButtons(session, canJoin)}
            </div>
        </div>
    `;
};

// Create action buttons based on session status
const createActionButtons = (session, canJoin) => {
    let buttons = [];

    if (canJoin) {
        buttons.push(`<a href="${session.meetingLink}" target="_blank" class="btn btn-primary join-now-btn">Join Now</a>`);
    } else if (session.status === 'confirmed' && !session.meetingLink) {
        buttons.push(`<button class="btn btn-primary" onclick="addMeetingLink('${session.id}')">Add Meeting Link</button>`);
    }

    if (session.status === 'pending') {
        buttons.push(`<button class="action-button" onclick="acceptSession('${session.id}')">Accept</button>`);
        buttons.push(`<button class="action-button cancel-btn" onclick="declineSession('${session.id}')">Decline</button>`);
    } else if (session.status === 'confirmed') {
        buttons.push(`<button class="action-button reschedule-btn" onclick="rescheduleSession('${session.id}')">Reschedule</button>`);
        buttons.push(`<button class="action-button cancel-btn" onclick="cancelSession('${session.id}')">Cancel</button>`);
    } else if (session.status === 'cancelled') {
        buttons.push(`<button class="action-button view-details-btn" onclick="viewCancelReason('${session.id}')">View Reason</button>`);
    }

    return buttons.join('');
};

// Action handlers (global functions)
window.acceptSession = async (sessionId) => {
    try {
        const sessionRef = doc(db, 'sessionRequests', sessionId);
        await updateDoc(sessionRef, {
            status: 'confirmed',
            confirmedAt: serverTimestamp(),
            confirmedBy: currentUser.uid
        });

        showSuccess('Session accepted! The student will be notified.');
        await loadScheduleData();
        displaySessions();

    } catch (error) {
        console.error('Error accepting session:', error);
        showError('Failed to accept session. Please try again.');
    }
};

window.declineSession = async (sessionId) => {
    try {
        const reason = prompt('Please provide a reason for declining (optional):');

        const sessionRef = doc(db, 'sessionRequests', sessionId);
        await updateDoc(sessionRef, {
            status: 'declined',
            declinedAt: serverTimestamp(),
            declinedBy: currentUser.uid,
            declineReason: reason || 'No reason provided'
        });

        showSuccess('Session declined. The student will be notified.');
        await loadScheduleData();
        displaySessions();

    } catch (error) {
        console.error('Error declining session:', error);
        showError('Failed to decline session. Please try again.');
    }
};

window.cancelSession = async (sessionId) => {
    try {
        const reason = prompt('Please provide a reason for cancelling:');
        if (!reason) return;

        const sessionRef = doc(db, 'sessionRequests', sessionId);
        await updateDoc(sessionRef, {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
            cancelledBy: currentUser.uid,
            cancelReason: reason
        });

        showSuccess('Session cancelled. The student will be notified.');
        await loadScheduleData();
        displaySessions();

    } catch (error) {
        console.error('Error cancelling session:', error);
        showError('Failed to cancel session. Please try again.');
    }
};

window.rescheduleSession = (sessionId) => {
    const session = upcomingSessions.find(s => s.id === sessionId);
    if (!session) return;

    alert(`Rescheduling session with ${session.studentName}...\n\n(This would normally open a calendar interface to select a new date and time)`);
};

window.addMeetingLink = async (sessionId) => {
    try {
        const meetingLink = prompt('Enter the meeting link for this session:');
        if (!meetingLink) return;

        // Basic URL validation
        if (!meetingLink.startsWith('http')) {
            showError('Please enter a valid meeting link starting with http or https');
            return;
        }

        const sessionRef = doc(db, 'sessionRequests', sessionId);
        await updateDoc(sessionRef, {
            meetingLink: meetingLink,
            updatedAt: serverTimestamp()
        });

        showSuccess('Meeting link added successfully!');
        await loadScheduleData();
        displaySessions();

    } catch (error) {
        console.error('Error adding meeting link:', error);
        showError('Failed to add meeting link. Please try again.');
    }
};

window.viewCancelReason = (sessionId) => {
    const session = upcomingSessions.find(s => s.id === sessionId);
    if (!session) return;

    const cancelDate = session.cancelledAt?.toDate();
    const reason = session.cancelReason || 'No reason provided';

    alert(`Session Cancellation Details\n\nStudent: ${session.studentName}\nTopic: ${session.topic}\nCancelled: ${cancelDate ? formatDateTime(cancelDate) : 'Unknown'}\nReason: ${reason}`);
};

// Utility functions
const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const formatDateTime = (date) => {
    if (!date) return 'Unknown date';
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });
};

// Loading state
const showLoading = () => {
    if (sessionCardsGrid) {
        sessionCardsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <p style="color: #666; font-size: 16px;">Loading schedule...</p>
            </div>
        `;
    }
};

const hideLoading = () => {
    // Loading state is replaced by actual content in displaySessions()
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