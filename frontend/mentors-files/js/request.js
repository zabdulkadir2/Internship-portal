import { requireAuth, getCurrentUser, initLogout } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, query, where, orderBy, updateDoc, doc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const statusFilter = document.querySelector('.filter-select');
const universityFilter = document.querySelectorAll('.filter-select')[1];
const interestFilter = document.querySelectorAll('.filter-select')[2];
const applyFiltersBtn = document.querySelector('.apply-filters-button');
const requestCardsGrid = document.getElementById('requests-container');
const loadMoreBtn = document.querySelector('.load-more-btn');
const noRequestsState = document.querySelector('.no-requests-state');
const requestsLoadingElement = document.getElementById('requests-loading');

// State
let currentUser = null;
let allRequests = [];
let filteredRequests = [];
let displayedCount = 0;
const REQUESTS_PER_PAGE = 8;

// Helper function to convert topic codes to readable names
// const getTopicDisplayName = (topic) => {
//     const topicMap = {
//         'career-guidance': 'Career Guidance',
//         'skill-development': 'Skill Development',
//         'networking-tips': 'Networking Tips',
//         'industry-insights': 'Industry Insights',
//         'technical-questions': 'Technical Questions',
//         'portfolio-review': 'Portfolio Review',
//         'interview-prep': 'Interview Preparation',
//         'other': 'Other'
//     };
//     return topicMap[topic] || topic || 'General';
// };

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

        // Load session requests
        await loadSessionRequests();

        // Display requests
        displayRequests();

        // Hide loading state
        hideLoading();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load session requests. Please refresh the page.');
        hideLoading();
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    applyFiltersBtn?.addEventListener('click', applyFilters);
    statusFilter?.addEventListener('change', applyFilters);
    universityFilter?.addEventListener('change', applyFilters);
    interestFilter?.addEventListener('change', applyFilters);
    loadMoreBtn?.addEventListener('click', loadMoreRequests);
};

// Load session requests from Firebase
const loadSessionRequests = async () => {
    try {
        console.log('Loading session requests for mentor:', currentUser.uid);

        // Get all session requests for this mentor - try with orderBy first, fall back if needed
        let sessionRequestsQuery;
        let requestsSnapshot;

        try {
            console.log('Trying query with orderBy...');
            sessionRequestsQuery = query(
                collection(db, 'sessionRequests'),
                where('mentorId', '==', currentUser.uid),
                orderBy('createdAt', 'desc')
            );
            requestsSnapshot = await getDocs(sessionRequestsQuery);
            console.log('OrderBy query successful');
        } catch (indexError) {
            console.warn('OrderBy query failed, trying without orderBy:', indexError);
            sessionRequestsQuery = query(
                collection(db, 'sessionRequests'),
                where('mentorId', '==', currentUser.uid)
            );
            requestsSnapshot = await getDocs(sessionRequestsQuery);
            console.log('Simple query successful');
        }

        allRequests = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log('Raw requests found in database:', allRequests.length);

        // Sort manually by createdAt if we have the field
        allRequests.sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime; // Descending order (newest first)
        });

        // Enrich with student data
        console.log('Enriching requests with student data...');
        const enrichedRequests = await Promise.all(
            allRequests.map(async (request) => {
                try {
                    console.log('Processing request:', request.id, request);
                    if (request.studentId) {
                        const studentDoc = await getDoc(doc(db, 'users', request.studentId));
                        if (studentDoc.exists()) {
                            const studentData = studentDoc.data();
                            console.log('Enriched request with student data:', studentData.fullName);
                            return {
                                ...request,
                                studentData: studentData
                            };
                        } else {
                            console.warn('Student document not found for ID:', request.studentId);
                        }
                    } else {
                        console.warn('Request has no studentId:', request.id);
                    }
                    return request;
                } catch (error) {
                    console.error('Error loading student data:', error);
                    return request;
                }
            })
        );

        allRequests = enrichedRequests;
        filteredRequests = [...allRequests];
        console.log('Final processed session requests:', allRequests.length);

        if (allRequests.length > 0) {
            console.log('Request sample:', allRequests[0]);
        }

        // Temporarily enable demo data for testing if no real data
        if (allRequests.length === 0) {
            console.log('No session requests found for mentor:', currentUser.uid);
            console.log('Enabling demo requests for testing...');
            createDemoRequests();
        }

    } catch (error) {
        console.error('Critical error loading session requests:', error);
        console.log('Request loading failed completely, using demo data');
        createDemoRequests();
    }
};

// Create demo requests for development
const createDemoRequests = () => {
    const now = new Date();
    allRequests = [
        {
            id: 'demo1',
            studentName: 'Jane Doe',
            studentEmail: 'jane.doe@knust.edu.gh',
            status: 'pending',
            topic: 'Frontend Development Guidance',
            requestMessage: "Hi, I'm looking for guidance on building responsive web interfaces and understanding modern JavaScript frameworks. Your profile on React caught my eye...",
            createdAt: { toDate: () => new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
            studentData: {
                university: 'KNUST',
                program: 'Computer Science',
                focusArea: 'Frontend Development',
                avatarUrl: '../assets/images/jane.jpg'
            }
        },
        {
            id: 'demo2',
            studentName: 'John Smith',
            studentEmail: 'john.smith@ug.edu.gh',
            status: 'confirmed',
            topic: 'Data Science Career Path',
            requestMessage: "Hello, I'm a final-year student interested in machine learning applications in finance. I saw your work on predictive modeling and would love to learn more...",
            createdAt: { toDate: () => new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000) },
            confirmedAt: { toDate: () => new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) },
            studentData: {
                university: 'University of Ghana',
                program: 'Business Analytics',
                focusArea: 'Data Science',
                avatarUrl: '../assets/images/john.jpg'
            }
        },
        {
            id: 'demo3',
            studentName: 'Emily White',
            studentEmail: 'emily.white@ucc.edu.gh',
            status: 'declined',
            topic: 'Sustainable Practices Mentoring',
            requestMessage: "Good day, I'm passionate about environmental conservation and seeking advice on career paths in sustainability. Your background in green tech is inspiring...",
            createdAt: { toDate: () => new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000) },
            declinedAt: { toDate: () => new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000) },
            declineReason: 'Outside my area of expertise',
            studentData: {
                university: 'UCC',
                program: 'Environmental Science',
                focusArea: 'Sustainable Practices',
                avatarUrl: '../assets/images/emily.jpg'
            }
        },
        {
            id: 'demo4',
            studentName: 'Michael Adams',
            studentEmail: 'michael.adams@knust.edu.gh',
            status: 'pending',
            topic: 'Robotics Project Guidance',
            requestMessage: "Hi, I'm working on a robotics project and need guidance on actuator selection and control systems. Your expertise in automation would be invaluable...",
            createdAt: { toDate: () => new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) },
            studentData: {
                university: 'KNUST',
                program: 'Mechanical Engineering',
                focusArea: 'Robotics',
                avatarUrl: '../assets/images/adams.jpg'
            }
        }
    ];

    filteredRequests = [...allRequests];
};

// Apply filters
const applyFilters = () => {
    const statusValue = statusFilter?.value || 'all';
    const universityValue = universityFilter?.value || 'all';
    const interestValue = interestFilter?.value || 'all';

    filteredRequests = allRequests.filter(request => {
        // Status filter
        if (statusValue !== 'all') {
            const statusMap = {
                'pending': 'pending',
                'accepted': 'confirmed',
                'rejected': 'declined'
            };
            if (request.status !== statusMap[statusValue]) return false;
        }

        // University filter
        if (universityValue !== 'all') {
            const universityMap = {
                'knust': 'KNUST',
                'ug': 'University of Ghana',
                'ucc': 'UCC'
            };
            if (request.studentData?.university !== universityMap[universityValue]) return false;
        }

        // Interest filter
        if (interestValue !== 'all') {
            const interestMap = {
                'frontend': 'Frontend Development',
                'backend': 'Backend Development',
                'ux-ui': 'UX/UI Design',
                'data-science': 'Data Science'
            };
            if (request.studentData?.focusArea !== interestMap[interestValue]) return false;
        }

        return true;
    });

    displayedCount = 0;
    displayRequests();
};

// Display requests
const displayRequests = () => {
    console.log('Displaying requests...');
    console.log('requestCardsGrid element:', requestCardsGrid);
    console.log('noRequestsState element:', noRequestsState);
    console.log('filteredRequests count:', filteredRequests.length);

    if (!requestCardsGrid) {
        console.error('requestCardsGrid element not found! Check DOM element IDs.');
        return;
    }

    if (filteredRequests.length === 0) {
        console.log('No requests to display, showing empty state');
        requestCardsGrid.style.display = 'none';
        if (noRequestsState) {
            noRequestsState.style.display = 'block';
        }
        if (loadMoreBtn) {
            loadMoreBtn.style.display = 'none';
        }
        return;
    }

    console.log('Displaying', filteredRequests.length, 'requests');
    requestCardsGrid.style.display = 'grid';
    if (noRequestsState) {
        noRequestsState.style.display = 'none';
    }

    const requestsToShow = filteredRequests.slice(0, displayedCount + REQUESTS_PER_PAGE);
    console.log('Showing', requestsToShow.length, 'request cards');

    const requestCards = requestsToShow.map(request => createRequestCard(request));
    console.log('Generated request cards:', requestCards.length);

    requestCardsGrid.innerHTML = requestCards.join('');
    console.log('Requests grid updated');

    displayedCount = requestsToShow.length;

    // Show/hide load more button
    if (loadMoreBtn) {
        loadMoreBtn.style.display = displayedCount < filteredRequests.length ? 'block' : 'none';
    }
};

// Create request card HTML
const createRequestCard = (request) => {
    const createdDate = request.createdAt?.toDate();
    const studentData = request.studentData || {};

    let statusClass, statusText;
    switch (request.status) {
        case 'pending':
            statusClass = 'status-pending';
            statusText = 'Pending';
            break;
        case 'confirmed':
            statusClass = 'status-accepted';
            statusText = 'Accepted';
            break;
        case 'declined':
            statusClass = 'status-rejected';
            statusText = 'Rejected';
            break;
        default:
            statusClass = 'status-pending';
            statusText = 'Pending';
    }

    const isPending = request.status === 'pending';

    return `
        <div class="request-card">
            <div class="request-header">
                <img
                    src="${studentData.avatarUrl || `https://placehold.co/60x60/E2E8F0/A0B2C4?text=${request.studentName?.charAt(0) || 'S'}`}"
                    alt="Student Profile"
                    class="student-profile-img"
                />
                <div class="student-info">
                    <h3 class="student-name">${escapeHtml(request.studentName || 'Unknown Student')}</h3>
                    <p class="student-university">${escapeHtml(studentData.university || 'Unknown University')} – ${escapeHtml(studentData.program || 'Unknown Program')}</p>
                    <p class="student-interest">
                        Discussion Topic: ${escapeHtml(getTopicDisplayName(request.topic) || 'General')}
                    </p>
                </div>
            </div>
            <p class="message-summary">
                "${escapeHtml(request.requestMessage || request.topic || 'No message provided')}"
            </p>
            <p class="submitted-on">Submitted On: ${formatDate(createdDate)}</p>
            <span class="status-badge ${statusClass}">${statusText}</span>
            <div class="request-actions">
                <button class="btn btn-primary ${isPending ? '' : 'disabled-btn'}"
                        onclick="acceptRequest('${request.id}')"
                        ${isPending ? '' : 'disabled'}>
                    ${request.status === 'confirmed' ? 'Accepted' : 'Accept'}
                </button>
                <button class="btn btn-secondary reject-btn ${isPending ? '' : 'disabled-btn'}"
                        onclick="rejectRequest('${request.id}')"
                        ${isPending ? '' : 'disabled'}>
                    ${request.status === 'declined' ? 'Rejected' : 'Reject'}
                </button>
                <button class="btn btn-secondary" onclick="viewRequestDetails('${request.id}')">
                    View Details
                </button>
            </div>
        </div>
    `;
};

// Show accept request modal
window.showAcceptRequestModal = (requestId) => {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;

    const modalHtml = `
        <div class="modal-overlay" id="acceptRequestModal">
            <div class="modal-content accept-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-check-circle"></i> Accept Session Request</h2>
                    <button class="modal-close" onclick="closeAcceptRequestModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="accept-info">
                        <p>You're about to accept a session request from <strong>${escapeHtml(request.studentName || 'Unknown Student')}</strong>.</p>
                        <p>Topic: <strong>${request.topic ? getTopicDisplayName(request.topic) : 'General mentoring'}</strong></p>
                        <p>Preferred Duration: <strong>${request.preferredDuration ? `${request.preferredDuration} minutes` : 'Not specified'}</strong></p>
                        <p>Preferred Time: <strong>${request.preferredTime ? getPreferredTimeDisplay(request.preferredTime) : 'Not specified'}</strong></p>
                    </div>

                    <form id="acceptRequestForm">
                        <div class="form-group">
                            <label for="sessionDate">Schedule Session Date & Time *</label>
                            <input
                                type="datetime-local"
                                id="sessionDate"
                                required
                                min="${new Date().toISOString().slice(0, 16)}"
                            />
                            <small class="form-hint">Choose a date and time that works for both of you</small>
                        </div>

                        <div class="form-group">
                            <label for="platform">Meeting Platform</label>
                            <select id="platform">
                                <option value="">Select platform (optional)</option>
                                <option value="Google Meet">Google Meet</option>
                                <option value="Zoom">Zoom</option>
                                <option value="Microsoft Teams">Microsoft Teams</option>
                                <option value="Skype">Skype</option>
                                <option value="Phone Call">Phone Call</option>
                                <option value="In Person">In Person</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="meetingLink">Meeting Link (optional)</label>
                            <input
                                type="url"
                                id="meetingLink"
                                placeholder="https://meet.google.com/abc-xyz-123"
                            />
                            <small class="form-hint">Provide the meeting link if available</small>
                        </div>

                        <div class="form-group">
                            <label for="acceptMessage">Message to Student (optional)</label>
                            <textarea
                                id="acceptMessage"
                                rows="3"
                                placeholder="Looking forward to our session! Please prepare any specific questions you'd like to discuss..."
                            ></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeAcceptRequestModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="confirmAcceptRequest('${requestId}')">
                        <i class="fas fa-check"></i> Accept & Schedule
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// Show reject request modal
window.showRejectRequestModal = (requestId) => {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;

    const modalHtml = `
        <div class="modal-overlay" id="rejectRequestModal">
            <div class="modal-content reject-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-times-circle"></i> Decline Session Request</h2>
                    <button class="modal-close" onclick="closeRejectRequestModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="reject-info">
                        <p>You're about to decline a session request from <strong>${escapeHtml(request.studentName || 'Unknown Student')}</strong>.</p>
                        <p>Topic: <strong>${request.topic ? getTopicDisplayName(request.topic) : 'General mentoring'}</strong></p>
                    </div>

                    <form id="rejectRequestForm">
                        <div class="form-group">
                            <label for="declineReason">Reason for Declining *</label>
                            <select id="declineReason" required>
                                <option value="">Select a reason</option>
                                <option value="Outside my expertise">Outside my area of expertise</option>
                                <option value="Schedule conflict">Schedule conflict</option>
                                <option value="Too busy currently">Too busy currently</option>
                                <option value="Not a good fit">Not a good fit for this type of mentoring</option>
                                <option value="Other">Other (please specify below)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="declineMessage">Additional Message to Student (optional)</label>
                            <textarea
                                id="declineMessage"
                                rows="4"
                                placeholder="Thank you for your interest. While I can't mentor you on this topic, I'd recommend looking for mentors who specialize in..."
                            ></textarea>
                            <small class="form-hint">A thoughtful message helps the student understand and find better alternatives</small>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeRejectRequestModal()">Cancel</button>
                    <button class="btn btn-danger" onclick="confirmRejectRequest('${requestId}')">
                        <i class="fas fa-times"></i> Decline Request
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// Updated action handlers to use modals
window.acceptRequest = (requestId) => {
    showAcceptRequestModal(requestId);
};

window.rejectRequest = (requestId) => {
    showRejectRequestModal(requestId);
};

// Confirm accept request
window.confirmAcceptRequest = async (requestId) => {
    try {
        const request = allRequests.find(r => r.id === requestId);
        if (!request) {
            showError('Request not found.');
            return;
        }

        if (request.status !== 'pending') {
            showError('This request has already been processed.');
            return;
        }

        const sessionDateInput = document.getElementById('sessionDate');
        const platformInput = document.getElementById('platform');
        const meetingLinkInput = document.getElementById('meetingLink');
        const messageInput = document.getElementById('acceptMessage');

        if (!sessionDateInput.value) {
            showError('Please select a session date and time.');
            return;
        }

        const sessionDate = new Date(sessionDateInput.value);
        const updateData = {
            status: 'confirmed',
            confirmedAt: serverTimestamp(),
            confirmedBy: currentUser.uid,
            sessionDate: sessionDate
        };

        // Add optional fields if provided
        if (platformInput.value) {
            updateData.platform = platformInput.value;
        }
        if (meetingLinkInput.value) {
            updateData.meetingLink = meetingLinkInput.value;
        }
        if (messageInput.value) {
            updateData.mentorMessage = messageInput.value;
        }

        const requestRef = doc(db, 'sessionRequests', requestId);
        await updateDoc(requestRef, updateData);

        closeAcceptRequestModal();
        showSuccess(`Session request accepted! Meeting scheduled for ${sessionDate.toLocaleDateString()} at ${sessionDate.toLocaleTimeString()}.`);

        await loadSessionRequests();
        displayRequests();

    } catch (error) {
        console.error('Error accepting request:', error);
        showError('Failed to accept request. Please try again.');
    }
};

// Confirm reject request
window.confirmRejectRequest = async (requestId) => {
    try {
        const request = allRequests.find(r => r.id === requestId);
        if (!request) {
            showError('Request not found.');
            return;
        }

        if (request.status !== 'pending') {
            showError('This request has already been processed.');
            return;
        }

        const reasonSelect = document.getElementById('declineReason');
        const messageInput = document.getElementById('declineMessage');

        if (!reasonSelect.value) {
            showError('Please select a reason for declining.');
            return;
        }

        const updateData = {
            status: 'declined',
            declinedAt: serverTimestamp(),
            declinedBy: currentUser.uid,
            declineReason: reasonSelect.value
        };

        if (messageInput.value) {
            updateData.declineMessage = messageInput.value;
        }

        const requestRef = doc(db, 'sessionRequests', requestId);
        await updateDoc(requestRef, updateData);

        closeRejectRequestModal();
        showSuccess('Session request declined. The student will be notified.');

        await loadSessionRequests();
        displayRequests();

    } catch (error) {
        console.error('Error rejecting request:', error);
        showError('Failed to reject request. Please try again.');
    }
};

// Close modal functions
window.closeAcceptRequestModal = () => {
    const modal = document.getElementById('acceptRequestModal');
    if (modal) modal.remove();
};

window.closeRejectRequestModal = () => {
    const modal = document.getElementById('rejectRequestModal');
    if (modal) modal.remove();
};

// Helper functions for modals
const getTopicDisplayName = (topic) => {
    const topics = {
        'career-guidance': 'Career Guidance',
        'skill-development': 'Skill Development',
        'industry-insights': 'Industry Insights',
        'resume-review': 'Resume Review',
        'interview-prep': 'Interview Preparation',
        'networking': 'Networking Advice',
        'other': 'Other'
    };
    return topics[topic] || topic || 'General mentoring';
};

const getPreferredTimeDisplay = (time) => {
    const times = {
        'morning': 'Morning (9 AM - 12 PM)',
        'afternoon': 'Afternoon (12 PM - 5 PM)',
        'evening': 'Evening (5 PM - 8 PM)',
        'flexible': 'I\'m flexible'
    };
    return times[time] || time || 'Not specified';
};

window.viewRequestDetails = (requestId) => {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;

    const studentData = request.studentData || {};
    const createdDate = request.createdAt?.toDate();

    // Map preference values to readable text
    // const getTopicDisplayName = (topic) => {
    //     const topics = {
    //         'career-guidance': 'Career Guidance',
    //         'skill-development': 'Skill Development',
    //         'industry-insights': 'Industry Insights',
    //         'resume-review': 'Resume Review',
    //         'interview-prep': 'Interview Preparation',
    //         'networking': 'Networking Advice',
    //         'other': 'Other'
    //     };
    //     return topics[topic] || topic || 'General mentoring';
    // };

    const getPreferredTimeDisplay = (time) => {
        const times = {
            'morning': 'Morning (9 AM - 12 PM)',
            'afternoon': 'Afternoon (12 PM - 5 PM)',
            'evening': 'Evening (5 PM - 8 PM)',
            'flexible': 'I\'m flexible'
        };
        return times[time] || time || 'Not specified';
    };

    let statusSection = '';
    if (request.status === 'confirmed' && request.confirmedAt) {
        statusSection = `
            <div class="status-section status-confirmed">
                <h4><i class="fas fa-check-circle"></i> Request Accepted</h4>
                <p>Accepted on: ${formatDate(request.confirmedAt.toDate())}</p>
                ${request.sessionDate ? `<p>Scheduled for: ${formatDate(request.sessionDate.toDate ? request.sessionDate.toDate() : request.sessionDate)}</p>` : ''}
            </div>
        `;
    } else if (request.status === 'declined' && request.declinedAt) {
        statusSection = `
            <div class="status-section status-declined">
                <h4><i class="fas fa-times-circle"></i> Request Declined</h4>
                <p>Declined on: ${formatDate(request.declinedAt.toDate())}</p>
                ${request.declineReason ? `<p>Reason: ${escapeHtml(request.declineReason)}</p>` : ''}
            </div>
        `;
    } else {
        statusSection = `
            <div class="status-section status-pending">
                <h4><i class="fas fa-clock"></i> Pending Review</h4>
                <p>This request is waiting for your response.</p>
            </div>
        `;
    }

    const modalHtml = `
        <div class="modal-overlay" id="requestDetailsModal">
            <div class="modal-content request-details-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-user-graduate"></i> Session Request Details</h2>
                    <button class="modal-close" onclick="closeRequestDetailsModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="student-profile-section">
                        <img
                            src="${studentData.avatarUrl || studentData.profilePicture || `https://placehold.co/80x80/E2E8F0/A0B2C4?text=${request.studentName?.charAt(0) || 'S'}`}"
                            alt="${request.studentName}"
                            class="student-avatar"
                        />
                        <div class="student-info">
                            <h3>${escapeHtml(request.studentName || 'Unknown Student')}</h3>
                            <p class="student-email"><i class="fas fa-envelope"></i> ${escapeHtml(request.studentEmail || 'Not provided')}</p>
                            <p class="student-university"><i class="fas fa-university"></i> ${escapeHtml(studentData.university || 'Unknown University')} - ${escapeHtml(studentData.program || 'Unknown Program')}</p>
                            <p class="student-focus"><i class="fas fa-target"></i> Focus Area: ${escapeHtml(studentData.focusArea || 'General')}</p>
                        </div>
                    </div>

                    <div class="request-details-grid">
                        <div class="detail-card">
                            <h4><i class="fas fa-lightbulb"></i> Discussion Topic</h4>
                            <p>${escapeHtml(getTopicDisplayName(request.topic))}</p>
                        </div>

                        <div class="detail-card">
                            <h4><i class="fas fa-clock"></i> Preferred Duration</h4>
                            <p>${request.preferredDuration ? `${request.preferredDuration} minutes` : 'Not specified'}</p>
                        </div>

                        <div class="detail-card">
                            <h4><i class="fas fa-calendar-alt"></i> Preferred Time</h4>
                            <p>${getPreferredTimeDisplay(request.preferredTime)}</p>
                        </div>

                        <div class="detail-card">
                            <h4><i class="fas fa-paper-plane"></i> Submitted</h4>
                            <p>${formatDate(createdDate)}</p>
                        </div>
                    </div>

                    ${request.requestMessage ? `
                        <div class="message-section">
                            <h4><i class="fas fa-comment-dots"></i> Student's Message</h4>
                            <div class="message-content">
                                "${escapeHtml(request.requestMessage)}"
                            </div>
                        </div>
                    ` : ''}

                    ${statusSection}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeRequestDetailsModal()">Close</button>
                    ${request.status === 'pending' ? `
                        <button class="btn btn-primary" onclick="closeRequestDetailsModal(); acceptRequest('${request.id}')">
                            <i class="fas fa-check"></i> Accept Request
                        </button>
                        <button class="btn btn-danger" onclick="closeRequestDetailsModal(); rejectRequest('${request.id}')">
                            <i class="fas fa-times"></i> Decline Request
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// Close request details modal
window.closeRequestDetailsModal = () => {
    const modal = document.getElementById('requestDetailsModal');
    if (modal) modal.remove();
};

// Load more requests
const loadMoreRequests = () => {
    displayRequests();
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
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
};

// Loading state
const showLoading = () => {
    if (requestsLoadingElement) {
        requestsLoadingElement.style.display = 'block';
    }
    if (requestCardsGrid) {
        requestCardsGrid.style.display = 'none';
    }
    if (noRequestsState) {
        noRequestsState.style.display = 'none';
    }
    if (loadMoreBtn) {
        loadMoreBtn.style.display = 'none';
    }
};

const hideLoading = () => {
    if (requestsLoadingElement) {
        requestsLoadingElement.style.display = 'none';
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