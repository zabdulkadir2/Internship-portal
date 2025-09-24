import { requireAuth, getCurrentUser, initLogout } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const searchInput = document.querySelector('.search-input');
const datePicker = document.querySelector('.date-picker');
const statusFilter = document.querySelector('.filter-select');
const applyFiltersBtn = document.querySelector('.apply-filters-btn');
const sessionsGrid = document.querySelector('.sessions-grid');
const loadMoreBtn = document.querySelector('.section-footer-link .btn');

// State
let allSessions = [];
let filteredSessions = [];
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

        // Load sessions
        await loadSessions();

        // Display sessions
        displaySessions();

        // Hide loading state
        hideLoading();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load sessions. Please refresh the page.');
        hideLoading();
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    applyFiltersBtn?.addEventListener('click', applyFilters);
    searchInput?.addEventListener('input', debounce(applyFilters, 300));
    datePicker?.addEventListener('change', applyFilters);
    statusFilter?.addEventListener('change', applyFilters);
    loadMoreBtn?.addEventListener('click', loadMoreSessions);
};

// Load sessions from Firebase
const loadSessions = async () => {
    try {
        // Load session requests where user is the student
        const sessionRequestsQuery = query(
            collection(db, 'sessionRequests'),
            where('studentId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );

        const requestsSnapshot = await getDocs(sessionRequestsQuery);
        allSessions = [];

        for (const docSnapshot of requestsSnapshot.docs) {
            const sessionData = docSnapshot.data();

            // Get mentor information
            let mentorInfo = {};
            try {
                const mentorDoc = await getDoc(doc(db, 'users', sessionData.mentorId));
                if (mentorDoc.exists()) {
                    mentorInfo = mentorDoc.data();
                }
            } catch (error) {
                console.error('Error loading mentor info:', error);
            }

            const session = {
                id: docSnapshot.id,
                ...sessionData,
                mentorInfo: mentorInfo,
                sessionDate: sessionData.sessionDate?.toDate() || null,
                createdAt: sessionData.createdAt?.toDate() || new Date(),
                status: sessionData.status || 'pending'
            };

            allSessions.push(session);
        }

        filteredSessions = [...allSessions];
        console.log('Loaded sessions:', allSessions.length);

        // If no real sessions, create demo sessions for development
        if (allSessions.length === 0) {
            createDemoSessions();
        }

    } catch (error) {
        console.error('Error loading sessions:', error);
        // Create demo sessions if Firebase fails
        createDemoSessions();
    }
};

// Create demo sessions for development
const createDemoSessions = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    allSessions = [
        {
            id: 'demo1',
            mentorId: 'demo-mentor-1',
            mentorName: 'Amina Suleiman',
            topic: 'UX Portfolio Review',
            sessionDate: tomorrow,
            duration: 60,
            platform: 'Google Meet',
            meetingLink: 'https://meet.google.com/abc-def-ghi',
            status: 'confirmed',
            createdAt: new Date(today.getTime() - 86400000),
            mentorInfo: {
                fullName: 'Amina Suleiman',
                expertise: 'UX Designer at Google',
                avatarUrl: '../assets/images/mentor-Amina.jpg'
            }
        },
        {
            id: 'demo2',
            mentorId: 'demo-mentor-2',
            mentorName: 'Kwame Boateng',
            topic: 'Software Architecture Discussion',
            sessionDate: new Date(today.getTime() - 604800000), // 1 week ago
            duration: 45,
            platform: 'Zoom',
            status: 'completed',
            feedback: 'Excellent session! Very helpful insights.',
            rating: 5,
            createdAt: new Date(today.getTime() - 1209600000),
            mentorInfo: {
                fullName: 'Kwame Boateng',
                expertise: 'Software Engineer at Andela',
                avatarUrl: '../assets/images/mentor-kwame.jpg'
            }
        },
        {
            id: 'demo3',
            mentorId: 'demo-mentor-3',
            mentorName: 'Dr. Emeka Okoro',
            topic: 'AI Career Path Guidance',
            sessionDate: nextWeek,
            duration: 60,
            platform: 'Google Meet',
            meetingLink: 'https://meet.google.com/xyz-abc-def',
            status: 'pending',
            createdAt: today,
            mentorInfo: {
                fullName: 'Dr. Emeka Okoro',
                expertise: 'AI Researcher at IBM',
                avatarUrl: '../assets/images/mentor-emeka.jpg'
            }
        },
        {
            id: 'demo4',
            mentorId: 'demo-mentor-4',
            mentorName: 'Sarah Mensah',
            topic: 'Product Management Career',
            sessionDate: new Date(today.getTime() - 259200000), // 3 days ago
            duration: 30,
            platform: 'Google Meet',
            status: 'cancelled',
            cancellationReason: 'Mentor had an emergency',
            createdAt: new Date(today.getTime() - 432000000),
            mentorInfo: {
                fullName: 'Sarah Mensah',
                expertise: 'Product Manager at Microsoft',
                avatarUrl: '../assets/images/mentor-sarah.jpg'
            }
        }
    ];

    filteredSessions = [...allSessions];
};

// Apply filters
const applyFilters = () => {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const selectedDate = datePicker?.value || '';
    const selectedStatus = statusFilter?.value || '';

    filteredSessions = allSessions.filter(session => {
        // Search filter
        if (searchTerm) {
            const searchable = `${session.mentorName} ${session.topic} ${session.mentorInfo?.expertise || ''}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }

        // Date filter
        if (selectedDate) {
            const filterDate = new Date(selectedDate);
            const sessionDate = session.sessionDate;
            if (!sessionDate || sessionDate.toDateString() !== filterDate.toDateString()) {
                return false;
            }
        }

        // Status filter
        if (selectedStatus && session.status !== selectedStatus) {
            return false;
        }

        return true;
    });

    displaySessions();
};

// Display sessions
const displaySessions = () => {
    if (!sessionsGrid) return;

    if (filteredSessions.length === 0) {
        sessionsGrid.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px;">
                <h3>No sessions found</h3>
                <p>You haven't booked any mentorship sessions yet.</p>
                <a href="mentors.html" class="btn btn-primary" style="margin-top: 16px;">Browse Mentors</a>
            </div>
        `;
        return;
    }

    sessionsGrid.innerHTML = filteredSessions.slice(0, 6).map(session => createSessionCard(session)).join('');

    // Show/hide load more button
    if (loadMoreBtn) {
        loadMoreBtn.style.display = filteredSessions.length > 6 ? 'inline-block' : 'none';
    }
};

// Create session card HTML
const createSessionCard = (session) => {
    const statusClass = `status-${session.status}`;
    const statusIcon = getStatusIcon(session.status);
    const isUpcoming = session.status === 'confirmed' && session.sessionDate && session.sessionDate > new Date();
    const canJoin = isUpcoming && session.sessionDate <= new Date(new Date().getTime() + 30 * 60000); // 30 minutes before

    return `
        <div class="session-card">
            <div class="session-header">
                <div class="mentor-info">
                    <img src="${session.mentorInfo?.avatarUrl || `https://placehold.co/40x40/E2E8F0/A0B2C4?text=${session.mentorName?.charAt(0) || 'M'}`}"
                         alt="${session.mentorName}" class="session-mentor-pic">
                    <div>
                        <h4>${escapeHtml(session.mentorName || 'Unknown Mentor')}</h4>
                        <p>${escapeHtml(session.mentorInfo?.expertise || 'Professional Mentor')}</p>
                    </div>
                </div>
                <span class="session-status ${statusClass}">${statusIcon} ${getStatusDisplayName(session.status)}</span>
            </div>

            <div class="session-details">
                <h3 class="session-topic">${escapeHtml(session.topic || 'Mentorship Session')}</h3>
                <div class="session-info">
                    <div class="session-datetime">
                        <i class="fas fa-calendar"></i>
                        ${session.sessionDate ? formatDateTime(session.sessionDate) : 'Date pending'}
                    </div>
                    <div class="session-platform">
                        <i class="fas fa-video"></i>
                        ${session.platform || 'Platform TBD'}
                    </div>
                    ${session.duration ? `<div class="session-duration">
                        <i class="fas fa-clock"></i>
                        ${session.duration} minutes
                    </div>` : ''}
                </div>
            </div>

            <div class="session-actions">
                ${getSessionActions(session, canJoin)}
            </div>
        </div>
    `;
};

// Get session actions based on status
const getSessionActions = (session, canJoin) => {
    switch (session.status) {
        case 'pending':
            return `
                <button class="action-button" onclick="cancelSessionRequest('${session.id}')">Cancel Request</button>
            `;

        case 'confirmed':
            if (canJoin) {
                return `
                    <a href="${session.meetingLink || '#'}" target="_blank" class="btn btn-primary">Join Now</a>
                    <button class="action-button" onclick="rescheduleSession('${session.id}')">Reschedule</button>
                    <button class="action-button cancel-btn" onclick="cancelSession('${session.id}')">Cancel</button>
                `;
            } else if (session.sessionDate && session.sessionDate > new Date()) {
                return `
                    <button class="action-button" onclick="rescheduleSession('${session.id}')">Reschedule</button>
                    <button class="action-button cancel-btn" onclick="cancelSession('${session.id}')">Cancel</button>
                `;
            } else {
                return `<button class="action-button" onclick="markAsCompleted('${session.id}')">Mark as Completed</button>`;
            }

        case 'completed':
            return `
                <button class="action-button" onclick="viewSessionSummary('${session.id}')">View Summary</button>
                ${!session.feedback ? `<button class="action-button" onclick="provideFeedback('${session.id}')">Provide Feedback</button>` : ''}
            `;

        case 'cancelled':
            return `
                <button class="action-button" onclick="viewCancellationReason('${session.id}')">View Reason</button>
                <button class="action-button" onclick="rebookSession('${session.id}')">Book Again</button>
            `;

        default:
            return '';
    }
};

// Session action functions
window.cancelSessionRequest = async (sessionId) => {
    if (!confirm('Are you sure you want to cancel this session request?')) return;

    try {
        await deleteDoc(doc(db, 'sessionRequests', sessionId));
        allSessions = allSessions.filter(s => s.id !== sessionId);
        applyFilters();
        showSuccess('Session request cancelled successfully.');
    } catch (error) {
        console.error('Error cancelling session request:', error);
        showError('Failed to cancel session request.');
    }
};

window.cancelSession = async (sessionId) => {
    if (!confirm('Are you sure you want to cancel this session?')) return;

    try {
        await updateDoc(doc(db, 'sessionRequests', sessionId), {
            status: 'cancelled',
            cancellationReason: 'Cancelled by student',
            cancelledAt: serverTimestamp()
        });

        // Update local state
        const sessionIndex = allSessions.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            allSessions[sessionIndex].status = 'cancelled';
            allSessions[sessionIndex].cancellationReason = 'Cancelled by student';
        }

        applyFilters();
        showSuccess('Session cancelled successfully.');
    } catch (error) {
        console.error('Error cancelling session:', error);
        showError('Failed to cancel session.');
    }
};

window.rescheduleSession = (sessionId) => {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    const newDate = prompt('Please enter a new date and time (YYYY-MM-DD HH:MM):',
        session.sessionDate ? session.sessionDate.toISOString().slice(0, 16) : '');

    if (newDate) {
        // In a real app, this would send a reschedule request to the mentor
        showSuccess('Reschedule request sent to mentor. You\'ll be notified when they respond.');
    }
};

window.markAsCompleted = async (sessionId) => {
    try {
        await updateDoc(doc(db, 'sessionRequests', sessionId), {
            status: 'completed',
            completedAt: serverTimestamp()
        });

        // Update local state
        const sessionIndex = allSessions.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            allSessions[sessionIndex].status = 'completed';
        }

        applyFilters();
        showSuccess('Session marked as completed!');
    } catch (error) {
        console.error('Error marking session as completed:', error);
        showError('Failed to update session status.');
    }
};

window.viewSessionSummary = (sessionId) => {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    const summary = session.summary || 'No summary available for this session.';
    alert(`Session Summary\n\nMentor: ${session.mentorName}\nTopic: ${session.topic}\nDate: ${session.sessionDate ? formatDateTime(session.sessionDate) : 'N/A'}\n\nSummary:\n${summary}`);
};

window.provideFeedback = (sessionId) => {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    const rating = prompt('Rate this session (1-5 stars):', '5');
    const feedback = prompt('Please provide feedback about this session:');

    if (rating && feedback) {
        // In a real app, this would save to Firebase
        session.rating = parseInt(rating);
        session.feedback = feedback;
        showSuccess('Thank you for your feedback!');
        applyFilters();
    }
};

window.viewCancellationReason = (sessionId) => {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    const reason = session.cancellationReason || 'No reason provided.';
    alert(`Cancellation Reason\n\n${reason}`);
};

window.rebookSession = (sessionId) => {
    const session = allSessions.find(s => s.id === sessionId);
    if (!session) return;

    if (confirm(`Would you like to book another session with ${session.mentorName}?`)) {
        window.location.href = `mentors.html?mentor=${session.mentorId}`;
    }
};

// Utility functions
const getStatusIcon = (status) => {
    const icons = {
        'pending': '⏳',
        'confirmed': '✅',
        'completed': '✅',
        'cancelled': '❌'
    };
    return icons[status] || '❓';
};

const getStatusDisplayName = (status) => {
    const names = {
        'pending': 'Pending',
        'confirmed': 'Confirmed',
        'completed': 'Completed',
        'cancelled': 'Cancelled'
    };
    return names[status] || 'Unknown';
};

const formatDateTime = (date) => {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

// Load more sessions
const loadMoreSessions = () => {
    const currentCount = sessionsGrid.children.length;
    const nextBatch = filteredSessions.slice(currentCount, currentCount + 6);

    nextBatch.forEach(session => {
        const sessionCard = document.createElement('div');
        sessionCard.innerHTML = createSessionCard(session);
        sessionsGrid.appendChild(sessionCard.firstElementChild);
    });

    // Hide load more if all sessions displayed
    if (currentCount + 6 >= filteredSessions.length) {
        loadMoreBtn.style.display = 'none';
    }
};

// Loading state
const showLoading = () => {
    if (sessionsGrid) {
        sessionsGrid.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <p style="color: #666; font-size: 16px;">Loading sessions...</p>
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