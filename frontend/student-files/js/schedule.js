import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, getDoc, doc, addDoc, updateDoc, query, where, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const eventsListGrid = document.querySelector('.events-list-grid');
const loadingState = document.createElement('div');
const eventTypeFilter = document.getElementById('event-type-filter');
const timeRangeFilter = document.getElementById('time-range-filter');
const refreshScheduleBtn = document.getElementById('refresh-schedule-btn');
const totalEventsElement = document.getElementById('total-events');
const upcomingInterviewsElement = document.getElementById('upcoming-interviews');
const urgentDeadlinesElement = document.getElementById('urgent-deadlines');

// State
let currentUser = null;
let allEvents = [];
let filteredEvents = [];

// Event types
const EVENT_TYPES = {
    INTERVIEW: 'interview',
    MENTOR: 'mentor',
    DEADLINE: 'deadline',
    WORKSHOP: 'workshop',
    FOLLOWUP: 'followup'
};

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

        // Setup event handlers
        setupEventHandlers();

        // Load schedule events
        await loadScheduleEvents();

        // Setup real-time listeners
        setupRealTimeListeners();

        // Note: Logout and notification badge now handled by shared navbar

        // Hide loading and show events
        hideLoading();
        applyFilters();
        updateScheduleStats();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load schedule. Please refresh the page.');
        hideLoading();
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    // Add event listeners for filtering, actions, etc.
    document.addEventListener('click', handleEventActions);

    // Filter event handlers
    eventTypeFilter?.addEventListener('change', applyFilters);
    timeRangeFilter?.addEventListener('change', applyFilters);
    refreshScheduleBtn?.addEventListener('click', refreshSchedule);
};

// Load all schedule events
const loadScheduleEvents = async () => {
    try {
        allEvents = [];

        // Load different types of events in parallel
        await Promise.all([
            loadInterviewEvents(),
            loadMentorEvents(),
            loadDeadlineEvents(),
            loadWorkshopEvents()
        ]);

        // Sort all events by date
        allEvents.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

        filteredEvents = [...allEvents];
        console.log('Loaded schedule events:', allEvents.length);

    } catch (error) {
        console.error('Error loading schedule events:', error);
        throw error;
    }
};

// Load interview events from applications
const loadInterviewEvents = async () => {
    try {
        // Get applications with interview-scheduled status or completed interviews
        const applicationsQuery = query(
            collection(db, 'applications'),
            where('studentId', '==', currentUser.uid),
            where('status', 'in', ['interview-scheduled', 'interview-completed'])
        );

        const applicationsSnapshot = await getDocs(applicationsQuery);

        for (const appDoc of applicationsSnapshot.docs) {
            const application = { id: appDoc.id, ...appDoc.data() };

            // Skip if no interview date is set
            if (!application.interviewDateTime) {
                console.warn('Interview scheduled but no date set:', application.id);
                continue;
            }

            // Get internship details
            let internshipData = { title: 'Unknown Position', companyName: 'Unknown Company', location: '' };
            try {
                const internshipDoc = await getDoc(doc(db, 'internships', application.internshipId));
                if (internshipDoc.exists()) {
                    internshipData = internshipDoc.data();
                }
            } catch (error) {
                console.error('Error loading internship data:', error);
            }

            // Determine interview status and actions
            const interviewDate = application.interviewDateTime.toDate ?
                application.interviewDateTime.toDate() :
                new Date(application.interviewDateTime);

            const now = new Date();
            const isPast = interviewDate < now;
            const isToday = interviewDate.toDateString() === now.toDateString();
            const isWithinHour = !isPast && (interviewDate - now) <= 60 * 60 * 1000; // 1 hour

            let eventStatus = application.interviewStatus || 'confirmed';
            let eventActions = ['view-details'];

            // Determine status based on timing and current status
            if (isPast && application.status !== 'interview-completed') {
                eventStatus = 'completed';
            } else if (isWithinHour && application.interviewMeetingLink) {
                eventStatus = 'ready-to-join';
                eventActions = ['view-details', 'join-now'];
            } else if (!isPast && application.interviewMeetingLink) {
                eventActions = ['view-details', 'join-meeting', 'reschedule'];
            } else if (!isPast) {
                eventActions = ['view-details', 'reschedule'];
            }

            // Format interview location/type
            let locationDetail = '';
            if (application.interviewType) {
                locationDetail = `📍 ${application.interviewType === 'video-call' ? 'Virtual Meeting' :
                                        application.interviewType === 'phone-call' ? 'Phone Interview' :
                                        application.interviewType === 'in-person' ? (application.interviewLocation || 'Company Office') :
                                        application.interviewType === 'panel' ? 'Panel Interview' :
                                        'Interview'}`;
            } else {
                locationDetail = application.interviewLocation || '📍 Virtual Interview Room';
            }

            // Add duration info if available
            if (application.interviewDuration) {
                locationDetail += ` • ${application.interviewDuration} minutes`;
            }

            // Create interview event
            const interviewEvent = {
                id: `interview_${application.id}`,
                type: EVENT_TYPES.INTERVIEW,
                title: `💼 Interview: ${internshipData.title}`,
                subtitle: `${internshipData.companyName}`,
                dateTime: interviewDate,
                details: locationDetail,
                status: eventStatus,
                meetingLink: application.interviewMeetingLink || null,
                notes: application.interviewNotes || null,
                applicationId: application.id,
                internshipId: application.internshipId,
                internshipTitle: internshipData.title,
                companyName: internshipData.companyName,
                companyLocation: internshipData.location || '',
                interviewType: application.interviewType || 'interview',
                interviewLocation: application.interviewLocation || '',
                interviewDuration: application.interviewDuration || 60,
                interviewerName: application.interviewerName || null,
                interviewerTitle: application.interviewerTitle || null,
                interviewerEmail: application.interviewerEmail || null,
                preparationNotes: application.preparationNotes || null,
                confirmationStatus: application.confirmationStatus || 'pending',
                actions: eventActions,
                // Additional metadata for better scheduling
                isToday: isToday,
                isPast: isPast,
                isWithinHour: isWithinHour,
                timeUntilInterview: isPast ? 0 : Math.max(0, interviewDate - now)
            };

            allEvents.push(interviewEvent);
        }

        console.log('Loaded interview events:', allEvents.filter(e => e.type === EVENT_TYPES.INTERVIEW).length);

    } catch (error) {
        console.error('Error loading interview events:', error);
    }
};

// Load mentor session events
const loadMentorEvents = async () => {
    try {
        // Try to get scheduled mentor sessions for this student
        const mentorQuery = query(
            collection(db, 'mentor-sessions'),
            where('studentId', '==', currentUser.uid)
        );

        const mentorSnapshot = await getDocs(mentorQuery);

        mentorSnapshot.docs.forEach(doc => {
            const session = { id: doc.id, ...doc.data() };

            const mentorEvent = {
                id: `mentor_${session.id}`,
                type: EVENT_TYPES.MENTOR,
                title: `👤 Mentor Session with ${session.mentorName || 'Mentor'}`,
                dateTime: session.scheduledDateTime.toDate ? session.scheduledDateTime.toDate() : new Date(session.scheduledDateTime),
                details: session.location || '📍 Google Meet',
                status: session.status || 'confirmed',
                meetingLink: session.meetingLink,
                notes: session.notes,
                mentorId: session.mentorId,
                actions: ['join-now', 'reschedule']
            };

            allEvents.push(mentorEvent);
        });

        // Note: No sample mentor sessions - only show real data

    } catch (error) {
        console.error('Error loading mentor events:', error);
        // Note: Only show real mentor sessions, no sample data
    }
};

// Sample data generation removed - only show real data

// Load application deadline events
const loadDeadlineEvents = async () => {
    try {
        // Get internships with upcoming deadlines that student hasn't applied to yet
        const internshipsQuery = query(collection(db, 'internships'));
        const internshipsSnapshot = await getDocs(internshipsQuery);

        // Get student's existing applications
        const applicationsQuery = query(
            collection(db, 'applications'),
            where('studentId', '==', currentUser.uid)
        );
        const applicationsSnapshot = await getDocs(applicationsQuery);
        const appliedInternshipIds = new Set(
            applicationsSnapshot.docs.map(doc => doc.data().internshipId)
        );

        const currentDate = new Date();

        internshipsSnapshot.docs.forEach(doc => {
            const internship = { id: doc.id, ...doc.data() };

            // Only include if student hasn't applied and deadline is in the future
            if (!appliedInternshipIds.has(internship.id) && internship.applicationDeadline) {
                const deadlineDate = internship.applicationDeadline.toDate ?
                    internship.applicationDeadline.toDate() :
                    new Date(internship.applicationDeadline);

                // Only include deadlines within the next 30 days
                const daysDiff = Math.ceil((deadlineDate - currentDate) / (1000 * 60 * 60 * 24));

                if (daysDiff > 0 && daysDiff <= 30) {
                    const deadlineEvent = {
                        id: `deadline_${internship.id}`,
                        type: EVENT_TYPES.DEADLINE,
                        title: `📅 Application Deadline: ${internship.companyName}`,
                        dateTime: deadlineDate,
                        details: `Action: Submit your application for ${internship.title}!`,
                        status: daysDiff <= 7 ? 'deadline-urgent' : 'deadline-soon',
                        internshipId: internship.id,
                        internshipTitle: internship.title,
                        companyName: internship.companyName,
                        daysRemaining: daysDiff,
                        actions: ['apply-now']
                    };

                    allEvents.push(deadlineEvent);
                }
            }
        });

    } catch (error) {
        console.error('Error loading deadline events:', error);
    }
};

// Load workshop/system events
const loadWorkshopEvents = async () => {
    try {
        // Try to get system-wide workshops and events
        const workshopsQuery = query(collection(db, 'workshops'));
        const workshopsSnapshot = await getDocs(workshopsQuery);

        workshopsSnapshot.docs.forEach(doc => {
            const workshop = { id: doc.id, ...doc.data() };

            const workshopEvent = {
                id: `workshop_${workshop.id}`,
                type: EVENT_TYPES.WORKSHOP,
                title: `📝 ${workshop.title}`,
                dateTime: workshop.scheduledDateTime.toDate ?
                    workshop.scheduledDateTime.toDate() :
                    new Date(workshop.scheduledDateTime),
                details: workshop.location || '📍 Campus Lecture Hall',
                status: 'confirmed',
                description: workshop.description,
                actions: ['view-details']
            };

            allEvents.push(workshopEvent);
        });

        // Note: No sample workshops - only show real data

    } catch (error) {
        console.error('Error loading workshop events:', error);
        // Note: Only show real workshop events, no sample data
    }
};

// Sample workshop generation removed - only show real data

// Display events in the grid
const displayEvents = () => {
    if (!eventsListGrid) return;

    if (filteredEvents.length === 0) {
        showEmptyState();
        return;
    }

    hideEmptyState();

    eventsListGrid.innerHTML = filteredEvents.map(event =>
        createEventCard(event)
    ).join('');
};

// Create event card HTML
const createEventCard = (event) => {
    const formattedDateTime = formatEventDateTime(event.dateTime);
    const statusClass = getStatusClass(event.status);
    const statusIcon = getStatusIcon(event.status);
    const actionButtons = createActionButtons(event);

    return `
        <div class="event-card" data-event-id="${event.id}" data-event-type="${event.type}">
            <p class="event-date-time">${formattedDateTime}</p>
            <h3 class="event-title">${escapeHtml(event.title)}</h3>
            <p class="event-details">${escapeHtml(event.details)}</p>
            <p class="event-status ${statusClass}">${statusIcon} ${getStatusDisplayName(event.status)}</p>
            ${event.daysRemaining ? `
                <p class="days-remaining">${event.daysRemaining} day${event.daysRemaining > 1 ? 's' : ''} remaining</p>
            ` : ''}
            <div class="event-actions">
                ${actionButtons}
            </div>
        </div>
    `;
};

// Create action buttons based on event type and status
const createActionButtons = (event) => {
    const buttons = [];

    event.actions?.forEach(action => {
        switch (action) {
            case 'join-now':
                if (event.meetingLink) {
                    buttons.push(`<a href="${event.meetingLink}" target="_blank" class="btn btn-primary join-now-btn">
                        <i class="fas fa-video"></i> Join Now
                    </a>`);
                } else {
                    buttons.push(`<button class="action-button btn-primary" data-action="view-details">
                        <i class="fas fa-info-circle"></i> Interview Ready
                    </button>`);
                }
                break;
            case 'join-meeting':
                if (event.meetingLink) {
                    buttons.push(`<a href="${event.meetingLink}" target="_blank" class="btn btn-primary join-now-btn">
                        <i class="fas fa-video"></i> Join Interview
                    </a>`);
                } else {
                    buttons.push(`<button class="action-button view-details-btn" data-action="view-details">
                        <i class="fas fa-info-circle"></i> View Details
                    </button>`);
                }
                break;
            // case 'reschedule':
            //     buttons.push(`<button class="action-button reschedule-btn" data-action="reschedule">
            //         <i class="fas fa-calendar-alt"></i> Request Reschedule
            //     </button>`);
            //     break;
            case 'confirm-attendance':
                buttons.push(`<button class="action-button btn-secondary" data-action="confirm-attendance">
                    <i class="fas fa-check-circle"></i> Confirm Attendance
                </button>`);
                break;
            case 'view-details':
                buttons.push(`<button class="action-button view-details-btn" data-action="view-details">
                    <i class="fas fa-info-circle"></i> View Details
                </button>`);
                break;
            case 'apply-now':
                buttons.push(`<a href="internship.html?id=${event.internshipId}" class="btn btn-secondary">
                    <i class="fas fa-external-link-alt"></i> Apply Now
                </a>`);
                break;
        }
    });

    // Add time-sensitive indicators for interviews
    if (event.type === EVENT_TYPES.INTERVIEW) {
        if (event.isWithinHour && !event.isPast) {
            buttons.unshift(`<div class="interview-alert">
                <i class="fas fa-clock text-orange-500"></i>
                <span style="color: #f59e0b; font-weight: 600;">Interview starting soon!</span>
            </div>`);
        } else if (event.isToday && !event.isPast) {
            buttons.unshift(`<div class="interview-alert">
                <i class="fas fa-calendar-day text-blue-500"></i>
                <span style="color: #3b82f6; font-weight: 600;">Interview today</span>
            </div>`);
        }
    }

    return buttons.join('');
};

// Handle event actions
const handleEventActions = (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const eventCard = e.target.closest('.event-card');
    const eventId = eventCard?.dataset.eventId;
    const eventType = eventCard?.dataset.eventType;

    if (!eventId) return;

    const event = allEvents.find(evt => evt.id === eventId);
    if (!event) return;

    switch (action) {
        case 'view-details':
            showEventDetailsModal(event);
            break;
        case 'reschedule':
            showRescheduleModal(event);
            break;
        case 'confirm-attendance':
            confirmInterviewAttendance(event.applicationId);
            break;
        default:
            console.log('Unhandled action:', action);
    }
};

// Show event details modal
const showEventDetailsModal = (event) => {
    const isInterview = event.type === EVENT_TYPES.INTERVIEW;
    const timeUntil = event.timeUntilInterview ? formatTimeUntil(event.timeUntilInterview) : '';

    const modalHTML = `
        <div class="modal-overlay" id="event-details-modal">
            <div class="modal-container">
                <div class="modal-header">
                    <h2>${isInterview ? 'Interview Details' : 'Event Details'}</h2>
                    <button class="modal-close" onclick="closeEventModal()">&times;</button>
                </div>
                <div class="modal-content">
                    ${isInterview ? `
                        <div class="interview-header" style="text-align: center; padding: 1rem; background: #f8fafc; border-radius: 8px; margin-bottom: 1.5rem;">
                            <h3 style="color: #1e3a8a; margin-bottom: 0.5rem;">${escapeHtml(event.internshipTitle)}</h3>
                            <p style="color: #6b7280; margin-bottom: 0.5rem;">at ${escapeHtml(event.companyName)}</p>
                            ${timeUntil && !event.isPast ? `
                                <div class="time-indicator" style="color: ${event.isWithinHour ? '#f59e0b' : '#3b82f6'}; font-weight: 600;">
                                    ${event.isWithinHour ? '🕐' : '📅'} ${timeUntil}
                                </div>
                            ` : ''}
                            ${event.isPast ? `<div class="past-indicator" style="color: #6b7280;">✅ Interview completed</div>` : ''}
                        </div>
                    ` : ''}

                    <div class="event-detail-section">
                        ${!isInterview ? `<h3>${escapeHtml(event.title)}</h3>` : ''}

                        <div class="detail-grid" style="display: grid; gap: 1rem; margin-bottom: 1.5rem;">
                            <div class="detail-item">
                                <strong>📅 Date & Time:</strong>
                                <p>${formatEventDateTime(event.dateTime)}</p>
                            </div>

                            ${event.interviewDuration ? `
                                <div class="detail-item">
                                    <strong>⏱️ Duration:</strong>
                                    <p>${event.interviewDuration} minutes</p>
                                </div>
                            ` : ''}

                            <div class="detail-item">
                                <strong>📍 Location:</strong>
                                <p>${escapeHtml(event.details)}</p>
                            </div>

                            <div class="detail-item">
                                <strong>📊 Status:</strong>
                                <p>${getStatusDisplayName(event.status)}</p>
                            </div>
                        </div>

                        ${isInterview && (event.interviewerName || event.interviewerTitle || event.interviewerEmail) ? `
                            <div class="interviewer-section" style="background: #f1f5f9; padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
                                <h4 style="color: #1e3a8a; margin-bottom: 0.5rem;">👤 Interviewer Information</h4>
                                ${event.interviewerName ? `<p><strong>Name:</strong> ${escapeHtml(event.interviewerName)}</p>` : ''}
                                ${event.interviewerTitle ? `<p><strong>Title:</strong> ${escapeHtml(event.interviewerTitle)}</p>` : ''}
                                ${event.interviewerEmail ? `<p><strong>Email:</strong> <a href="mailto:${event.interviewerEmail}">${escapeHtml(event.interviewerEmail)}</a></p>` : ''}
                            </div>
                        ` : ''}

                        ${event.notes ? `
                            <div class="notes-section" style="background: #f8fafc; padding: 1rem; border-radius: 6px; border-left: 4px solid #3b82f6; margin-bottom: 1.5rem;">
                                <h4 style="color: #1e3a8a; margin-bottom: 0.5rem;">📝 Interview Notes</h4>
                                <p>${escapeHtml(event.notes).replace(/\n/g, '<br>')}</p>
                            </div>
                        ` : ''}

                        ${event.preparationNotes ? `
                            <div class="preparation-section" style="background: #fef3c7; padding: 1rem; border-radius: 6px; border-left: 4px solid #f59e0b; margin-bottom: 1.5rem;">
                                <h4 style="color: #b45309; margin-bottom: 0.5rem;">💡 Preparation Tips</h4>
                                <p>${escapeHtml(event.preparationNotes).replace(/\n/g, '<br>')}</p>
                            </div>
                        ` : ''}

                        ${isInterview && event.companyLocation ? `
                            <div class="company-section" style="background: #ecfdf5; padding: 1rem; border-radius: 6px; border-left: 4px solid #10b981; margin-bottom: 1.5rem;">
                                <h4 style="color: #065f46; margin-bottom: 0.5rem;">🏢 Company Information</h4>
                                <p><strong>Company:</strong> ${escapeHtml(event.companyName)}</p>
                                <p><strong>Location:</strong> ${escapeHtml(event.companyLocation)}</p>
                                <div style="margin-top: 0.5rem;">
                                    <a href="internship.html?id=${event.internshipId}" class="btn btn-secondary" style="font-size: 0.875rem;">View Full Job Description</a>
                                </div>
                            </div>
                        ` : ''}

                        ${event.description ? `
                            <div class="description-section">
                                <h4 style="color: #1e3a8a; margin-bottom: 0.5rem;">📄 Description</h4>
                                <p>${escapeHtml(event.description)}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeEventModal()">Close</button>
                    ${event.meetingLink && !event.isPast ? `
                        <a href="${event.meetingLink}" target="_blank" class="btn btn-primary">
                            <i class="fas fa-video"></i> ${event.isWithinHour ? 'Join Now' : 'Join Interview'}
                        </a>
                    ` : ''}
                    ${isInterview && !event.isPast && event.confirmationStatus === 'pending' ? `
                        <button class="btn btn-primary" onclick="confirmInterviewAttendance('${event.applicationId}')">
                            <i class="fas fa-check-circle"></i> Confirm Attendance
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
};

// Close event modal
window.closeEventModal = () => {
    const modal = document.getElementById('event-details-modal');
    if (modal) {
        modal.remove();
    }
};

// Show empty state
const showEmptyState = () => {
    if (!eventsListGrid) return;

    eventsListGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">
                <i class="fas fa-calendar-alt" style="font-size: 3rem; color: #94a3b8;"></i>
            </div>
            <h3>No upcoming events</h3>
            <p>You don't have any scheduled interviews, mentor sessions, or deadlines at the moment. Apply to internships to get interview invitations!</p>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 16px;">
                <a href="internship.html" class="btn btn-primary">Browse Internships</a>
                <a href="applications.html" class="btn btn-secondary">Check Applications</a>
            </div>
        </div>
    `;
};

const hideEmptyState = () => {
    // Empty state is handled in displayEvents
};

// Utility functions
const formatEventDateTime = (dateTime) => {
    if (!dateTime) return 'Date TBD';

    const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    }) + ' — ' + date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    });
};

const getStatusClass = (status) => {
    const statusClasses = {
        'confirmed': 'status-confirmed',
        'pending': 'status-pending',
        'deadline-soon': 'status-deadline',
        'deadline-urgent': 'status-deadline',
        'cancelled': 'status-cancelled',
        'completed': 'status-completed'
    };
    return statusClasses[status] || 'status-pending';
};

const getStatusIcon = (status) => {
    const statusIcons = {
        'confirmed': '🟢',
        'pending': '⏳',
        'deadline-soon': '🔴',
        'deadline-urgent': '🔴',
        'cancelled': '❌',
        'completed': '✅'
    };
    return statusIcons[status] || '⏳';
};

const getStatusDisplayName = (status) => {
    const statusNames = {
        'confirmed': 'Confirmed',
        'pending': 'Pending Confirmation',
        'deadline-soon': 'Deadline Soon',
        'deadline-urgent': 'Deadline Urgent',
        'cancelled': 'Cancelled',
        'completed': 'Completed'
    };
    return statusNames[status] || 'Pending';
};

const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

// Format time until event
const formatTimeUntil = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} from now`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} from now`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} from now`;
    } else {
        return 'Starting now';
    }
};

// Confirm interview attendance
window.confirmInterviewAttendance = async (applicationId) => {
    try {
        const applicationRef = doc(db, 'applications', applicationId);
        await updateDoc(applicationRef, {
            confirmationStatus: 'confirmed',
            confirmedAt: new Date()
        });

        // Update local event data
        const event = allEvents.find(e => e.applicationId === applicationId);
        if (event) {
            event.confirmationStatus = 'confirmed';
        }

        // Close modal and refresh display
        closeEventModal();
        displayEvents();

        showScheduleNotification({
            title: 'Interview Confirmed',
            message: 'Your interview attendance has been confirmed!'
        });

    } catch (error) {
        console.error('Error confirming interview attendance:', error);
        alert('Failed to confirm attendance. Please try again.');
    }
};

// Show reschedule modal
const showRescheduleModal = (event) => {
    const rescheduleHTML = `
        <div class="modal-overlay" id="reschedule-modal">
            <div class="modal-container">
                <div class="modal-header">
                    <h2>Request Interview Reschedule</h2>
                    <button class="modal-close" onclick="closeRescheduleModal()">&times;</button>
                </div>
                <div class="modal-content">
                    <div class="reschedule-info" style="background: #f8fafc; padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
                        <h4 style="color: #1e3a8a; margin-bottom: 0.5rem;">Current Interview</h4>
                        <p><strong>Position:</strong> ${escapeHtml(event.internshipTitle)}</p>
                        <p><strong>Company:</strong> ${escapeHtml(event.companyName)}</p>
                        <p><strong>Current Date:</strong> ${formatEventDateTime(event.dateTime)}</p>
                    </div>

                    <form id="reschedule-form">
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label for="reschedule-reason" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
                                Reason for rescheduling *
                            </label>
                            <select id="reschedule-reason" required style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;">
                                <option value="">Select a reason...</option>
                                <option value="schedule-conflict">Schedule conflict</option>
                                <option value="illness">Illness</option>
                                <option value="emergency">Personal emergency</option>
                                <option value="technical-issues">Technical issues</option>
                                <option value="other">Other (please specify)</option>
                            </select>
                        </div>

                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label for="reschedule-details" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
                                Additional details
                            </label>
                            <textarea id="reschedule-details" rows="3" placeholder="Please provide any additional context..."
                                      style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; resize: vertical;"></textarea>
                        </div>

                        <div class="form-group" style="margin-bottom: 1.5rem;">
                            <label for="preferred-times" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">
                                Preferred alternative times (optional)
                            </label>
                            <textarea id="preferred-times" rows="2"
                                      placeholder="e.g., Monday mornings, Tuesday afternoon, any time next week..."
                                      style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; resize: vertical;"></textarea>
                        </div>

                        <div class="notice" style="background: #fef3c7; padding: 1rem; border-radius: 6px; border-left: 4px solid #f59e0b; margin-bottom: 1rem;">
                            <p style="color: #b45309; margin: 0; font-size: 0.875rem;">
                                <strong>Note:</strong> Your reschedule request will be sent to the company. They will contact you to arrange a new interview time.
                            </p>
                        </div>

                        <div class="form-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button type="button" onclick="closeRescheduleModal()" class="btn btn-secondary">Cancel</button>
                            <button type="submit" class="btn btn-primary">Submit Request</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', rescheduleHTML);

    // Handle form submission
    const form = document.getElementById('reschedule-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitRescheduleRequest(event);
    });
};

// Close reschedule modal
window.closeRescheduleModal = () => {
    const modal = document.getElementById('reschedule-modal');
    if (modal) {
        modal.remove();
    }
};

// Submit reschedule request
const submitRescheduleRequest = async (event) => {
    try {
        const reason = document.getElementById('reschedule-reason').value;
        const details = document.getElementById('reschedule-details').value;
        const preferredTimes = document.getElementById('preferred-times').value;

        if (!reason) {
            alert('Please select a reason for rescheduling.');
            return;
        }

        // Create reschedule request
        const rescheduleRequest = {
            applicationId: event.applicationId,
            studentId: currentUser.uid,
            companyId: event.companyId,
            internshipId: event.internshipId,
            currentInterviewDate: event.dateTime,
            reason: reason,
            details: details || '',
            preferredTimes: preferredTimes || '',
            requestedAt: new Date(),
            status: 'pending'
        };

        // Save reschedule request to Firestore
        await addDoc(collection(db, 'reschedule-requests'), rescheduleRequest);

        // Update application with reschedule request status
        const applicationRef = doc(db, 'applications', event.applicationId);
        await updateDoc(applicationRef, {
            rescheduleRequested: true,
            rescheduleRequestedAt: new Date()
        });

        // Update local event
        const localEvent = allEvents.find(e => e.id === event.id);
        if (localEvent) {
            localEvent.rescheduleRequested = true;
        }

        // Close modals and refresh
        closeRescheduleModal();
        displayEvents();

        showScheduleNotification({
            title: 'Reschedule Request Sent',
            message: 'Your reschedule request has been sent to the company. They will contact you soon.'
        });

    } catch (error) {
        console.error('Error submitting reschedule request:', error);
        alert('Failed to submit reschedule request. Please try again.');
    }
};

const generateUpcomingDateTime = () => {
    // Generate a placeholder datetime for interviews without specific time
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + Math.floor(Math.random() * 14) + 1); // 1-14 days from now
    futureDate.setHours(10 + Math.floor(Math.random() * 6), 0, 0, 0); // Between 10 AM and 4 PM
    return futureDate;
};

const getUpcomingDate = (daysFromNow, hour = 9) => {
    // Generate a specific future date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysFromNow);
    futureDate.setHours(hour, 0, 0, 0);
    return futureDate;
};

// Loading state management
const showLoading = () => {
    if (!eventsListGrid) return;

    loadingState.className = 'events-loading';
    loadingState.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>Loading your schedule...</p>
        </div>
    `;
    eventsListGrid.appendChild(loadingState);
};

const hideLoading = () => {
    if (loadingState.parentNode) {
        loadingState.remove();
    }
};

// Error handling
const showError = (message) => {
    if (!eventsListGrid) return;

    eventsListGrid.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">
                <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 3rem;"></i>
            </div>
            <h3>Error Loading Schedule</h3>
            <p>${message}</p>
            <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 16px;">Try Again</button>
        </div>
    `;
};

// Apply filters
const applyFilters = () => {
    const typeFilter = eventTypeFilter?.value || '';
    const timeFilter = timeRangeFilter?.value || 'all';

    filteredEvents = allEvents.filter(event => {
        // Type filter
        if (typeFilter && event.type !== typeFilter) return false;

        // Time filter
        if (!passesTimeFilter(event, timeFilter)) return false;

        return true;
    });

    displayEvents();
    updateScheduleStats();
};

// Check if event passes time filter
const passesTimeFilter = (event, timeFilter) => {
    if (timeFilter === 'all') return true;

    const eventDate = new Date(event.dateTime);
    const now = new Date();

    switch (timeFilter) {
        case 'today':
            return eventDate.toDateString() === now.toDateString();
        case 'week':
            const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            return eventDate >= now && eventDate <= weekFromNow;
        case 'month':
            const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            return eventDate >= now && eventDate <= monthFromNow;
        default:
            return true;
    }
};

// Update schedule statistics
const updateScheduleStats = () => {
    const totalCount = filteredEvents.length;
    const interviewCount = filteredEvents.filter(e => e.type === EVENT_TYPES.INTERVIEW).length;
    const urgentDeadlineCount = filteredEvents.filter(e =>
        e.type === EVENT_TYPES.DEADLINE && e.status === 'deadline-urgent'
    ).length;

    if (totalEventsElement) totalEventsElement.textContent = totalCount;
    if (upcomingInterviewsElement) upcomingInterviewsElement.textContent = interviewCount;
    if (urgentDeadlinesElement) urgentDeadlinesElement.textContent = urgentDeadlineCount;
};

// Setup real-time listeners for dynamic updates
const setupRealTimeListeners = () => {
    try {
        // Listen for changes in applications (for interview scheduling and status changes)
        const applicationsQuery = query(
            collection(db, 'applications'),
            where('studentId', '==', currentUser.uid)
        );

        onSnapshot(applicationsQuery, (snapshot) => {
            let hasInterviewChanges = false;
            let hasStatusChanges = false;

            snapshot.docChanges().forEach((change) => {
                const appData = change.doc.data();
                const changeType = change.type;

                if (changeType === 'modified') {
                    // Check for interview scheduling
                    if (appData.status === 'interview-scheduled') {
                        hasInterviewChanges = true;
                        console.log('Interview scheduled detected, refreshing schedule');

                        // Show detailed interview notification
                        if (appData.interviewDateTime) {
                            showInterviewScheduledNotification(appData);
                        }
                    }

                    // Check for interview updates (time changes, reschedule responses)
                    if (appData.interviewDateTime && change.doc.metadata.hasPendingWrites === false) {
                        const existingEvent = allEvents.find(e => e.applicationId === change.doc.id);
                        if (existingEvent && existingEvent.dateTime !== appData.interviewDateTime.toDate()) {
                            hasInterviewChanges = true;
                            showInterviewUpdatedNotification(appData);
                        }
                    }

                    // Check for status changes that affect schedule
                    if (['interview-completed', 'hired', 'rejected'].includes(appData.status)) {
                        hasStatusChanges = true;
                        showApplicationStatusNotification(appData);
                    }
                }
            });

            if (hasInterviewChanges || hasStatusChanges) {
                // Refresh schedule to show changes
                setTimeout(() => refreshScheduleQuietly(), 1000);
            }
        });

        // Listen for new notifications that might affect schedule (only show toasts for new ones)
        const notificationsQuery = query(
            collection(db, 'notifications'),
            where('recipientId', '==', currentUser.uid),
            where('read', '==', false)
        );

        let isInitialLoad = true;
        onSnapshot(notificationsQuery, (snapshot) => {
            // Skip initial load to prevent showing notifications on page refresh
            if (isInitialLoad) {
                isInitialLoad = false;
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const notification = change.doc.data();

                    // Show toast notification for schedule-related events (only for newly added)
                    if (notification.type === 'interview') {
                        showScheduleNotification({
                            title: notification.title || 'Interview Update',
                            message: 'Check your schedule for details!'
                        });
                    }
                }
            });
        });

        // Listen for reschedule request updates
        const rescheduleQuery = query(
            collection(db, 'reschedule-requests'),
            where('studentId', '==', currentUser.uid)
        );

        onSnapshot(rescheduleQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'modified') {
                    const rescheduleData = change.doc.data();

                    if (rescheduleData.status === 'approved') {
                        showScheduleNotification({
                            title: '✅ Reschedule Approved',
                            message: `Your reschedule request has been approved. Check your applications for the new interview time.`
                        }, 'success', 7000);

                        // Refresh to show updated interview time
                        setTimeout(() => refreshScheduleQuietly(), 1000);
                    } else if (rescheduleData.status === 'denied') {
                        showScheduleNotification({
                            title: '❌ Reschedule Denied',
                            message: `Your reschedule request was not approved. The original interview time remains unchanged.`
                        }, 'warning', 7000);
                    }
                }
            });
        });

        // Listen for interview reminders (check every minute for upcoming interviews)
        setInterval(() => {
            checkUpcomingInterviews();
        }, 60000); // Check every minute

        console.log('Real-time listeners setup successfully');

    } catch (error) {
        console.error('Error setting up real-time listeners:', error);
        // Continue without real-time updates if setup fails
    }
};

// Note: Notification badge functionality moved to shared navbar component

// Check for upcoming interviews and show reminders
const checkUpcomingInterviews = () => {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    allEvents.forEach(event => {
        if (event.type === EVENT_TYPES.INTERVIEW && !event.isPast) {
            const interviewTime = new Date(event.dateTime);
            const timeDiff = interviewTime - now;

            // 1-hour reminder
            if (timeDiff > 0 && timeDiff <= 60 * 60 * 1000 && !event.oneHourReminderShown) {
                showScheduleNotification({
                    title: '⏰ Interview in 1 Hour',
                    message: `Your interview for ${event.internshipTitle} at ${event.companyName} is starting in 1 hour.`
                }, 'warning', 10000);
                event.oneHourReminderShown = true;
            }

            // 24-hour reminder
            if (timeDiff > 0 && timeDiff <= 24 * 60 * 60 * 1000 && !event.oneDayReminderShown) {
                showScheduleNotification({
                    title: '📅 Interview Tomorrow',
                    message: `Don't forget: You have an interview for ${event.internshipTitle} at ${event.companyName} tomorrow.`
                }, 'info', 8000);
                event.oneDayReminderShown = true;
            }
        }
    });
};

// Show schedule-related notification toast
const showScheduleNotification = (notification, type = 'success', duration = 5000) => {
    const toast = document.createElement('div');
    toast.className = 'schedule-toast-notification';

    // Determine styles and icon based on type
    const notificationStyles = {
        success: {
            background: '#dcfce7',
            color: '#166534',
            border: '1px solid #bbf7d0',
            icon: '🎉'
        },
        info: {
            background: '#dbeafe',
            color: '#1e40af',
            border: '1px solid #bfdbfe',
            icon: '📅'
        },
        warning: {
            background: '#fef3c7',
            color: '#b45309',
            border: '1px solid #fcd34d',
            icon: '⚠️'
        },
        neutral: {
            background: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            icon: '📝'
        }
    };

    const style = notificationStyles[type] || notificationStyles.success;

    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-icon">${style.icon}</div>
            <div class="toast-text">
                <strong>${escapeHtml(notification.title)}</strong>
                <p>${escapeHtml(notification.message)}</p>
            </div>
            <button class="toast-close" onclick="this.parentNode.parentNode.remove()">×</button>
        </div>
    `;

    // Add toast styles
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: style.background,
        color: style.color,
        padding: '16px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: '10001',
        maxWidth: '380px',
        border: style.border,
        animation: 'slideIn 0.3s ease-out'
    });

    // Add animation styles
    if (!document.querySelector('#schedule-toast-styles')) {
        const styles = document.createElement('style');
        styles.id = 'schedule-toast-styles';
        styles.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }

            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }

            .toast-content {
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }

            .toast-icon {
                font-size: 1.5rem;
                flex-shrink: 0;
            }

            .toast-text {
                flex: 1;
            }

            .toast-text strong {
                display: block;
                margin-bottom: 4px;
                font-size: 0.95rem;
            }

            .toast-text p {
                margin: 0;
                font-size: 0.875rem;
                opacity: 0.9;
                line-height: 1.4;
            }

            .toast-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: inherit;
                padding: 0;
                margin-left: 8px;
                opacity: 0.7;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.2s;
            }

            .toast-close:hover {
                opacity: 1;
                background-color: rgba(0, 0, 0, 0.1);
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(toast);

    // Auto-remove after specified duration
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
};

// Enhanced interview notifications
const showInterviewScheduledNotification = (applicationData) => {
    const interviewDate = applicationData.interviewDateTime.toDate();
    const formattedDate = interviewDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = interviewDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    });

    const notification = {
        title: '🎉 Interview Scheduled!',
        message: `Your interview for ${applicationData.internshipTitle} at ${applicationData.companyName} is scheduled for ${formattedDate} at ${formattedTime}.`
    };

    showScheduleNotification(notification, 'success', 8000);
};

const showInterviewUpdatedNotification = (applicationData) => {
    const interviewDate = applicationData.interviewDateTime.toDate();
    const formattedDate = interviewDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = interviewDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
    });

    const notification = {
        title: '📅 Interview Rescheduled',
        message: `Your interview for ${applicationData.internshipTitle} has been rescheduled to ${formattedDate} at ${formattedTime}.`
    };

    showScheduleNotification(notification, 'info', 8000);
};

const showApplicationStatusNotification = (applicationData) => {
    let notification = {};

    switch (applicationData.status) {
        case 'hired':
            notification = {
                title: '🎉 Congratulations!',
                message: `You've been hired for ${applicationData.internshipTitle} at ${applicationData.companyName}!`
            };
            showScheduleNotification(notification, 'success', 10000);
            break;
        case 'interview-completed':
            notification = {
                title: '✅ Interview Complete',
                message: `Your interview for ${applicationData.internshipTitle} has been marked as completed. Good luck!`
            };
            showScheduleNotification(notification, 'info', 6000);
            break;
        case 'rejected':
            notification = {
                title: '📝 Application Update',
                message: `Thank you for interviewing with ${applicationData.companyName}. Keep applying - your perfect opportunity is out there!`
            };
            showScheduleNotification(notification, 'neutral', 6000);
            break;
    }
};

// Refresh schedule quietly (without loading state)
const refreshScheduleQuietly = async () => {
    try {
        await loadScheduleEvents();
        applyFilters();
        updateScheduleStats();
        console.log('Schedule refreshed automatically');
    } catch (error) {
        console.error('Error refreshing schedule quietly:', error);
    }
};

// Refresh schedule
const refreshSchedule = async () => {
    try {
        showLoading();
        await loadScheduleEvents();
        hideLoading();
        applyFilters();
        updateScheduleStats();
    } catch (error) {
        console.error('Error refreshing schedule:', error);
        showError('Failed to refresh schedule. Please try again.');
        hideLoading();
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);