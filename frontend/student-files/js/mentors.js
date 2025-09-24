import { requireAuth, getCurrentUser, initLogout } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, addDoc, query, where, orderBy, serverTimestamp, getDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const searchInput = document.querySelector('.search-input');
const searchButton = document.querySelector('.search-button');
const fieldFilter = document.querySelector('.filter-select');
const locationFilter = document.querySelectorAll('.filter-select')[1];
const availabilityFilter = document.querySelectorAll('.filter-select')[2];
const experienceFilter = document.querySelectorAll('.filter-select')[3];
const applyFiltersBtn = document.querySelector('.apply-filters-button');
const mentorCardsContainer = document.getElementById('mentor-cards-container');
const loadMoreBtn = document.getElementById('load-more-mentors');
const mentorsLoadingElement = document.getElementById('mentors-loading');
const noMentorsFoundElement = document.getElementById('no-mentors-found');
const sessionsTableBody = document.getElementById('sessions-table-body');
const sessionsTableContainer = document.getElementById('sessions-table-container');
const sessionsLoadingElement = document.getElementById('sessions-loading');
const noSessionsFoundElement = document.getElementById('no-sessions-found');

// State
let allMentors = [];
let filteredMentors = [];
let studentSessions = [];
let currentUser = null;

// Helper function to convert topic codes to readable names
const getTopicDisplayName = (topic) => {
    const topicMap = {
        'career-guidance': 'Career Guidance',
        'skill-development': 'Skill Development',
        'networking-tips': 'Networking Tips',
        'industry-insights': 'Industry Insights',
        'technical-questions': 'Technical Questions',
        'portfolio-review': 'Portfolio Review',
        'interview-prep': 'Interview Preparation',
        'other': 'Other'
    };
    return topicMap[topic] || topic || 'General';
};

// Function to close modal
window.closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
    }
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

        // Initialize logout functionality
        initLogout();

        // Setup event handlers
        setupEventHandlers();

        // Load data in parallel
        await Promise.all([
            loadMentors(),
            loadStudentSessions()
        ]);

        // Display data
        displayMentors();
        displaySessions();

        // Hide loading state
        hideLoading();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load mentors. Please refresh the page.');
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
    loadMoreBtn?.addEventListener('click', loadMoreMentors);

    // Real-time search
    searchInput?.addEventListener('input', debounce(applyFilters, 300));
};

// Load mentors from Firebase
const loadMentors = async () => {
    try {
        // Try to load mentors - first without isActive filter
        let mentorsQuery = query(
            collection(db, 'users'),
            where('role', '==', 'mentor')
        );

        let mentorsSnapshot = await getDocs(mentorsQuery);
        allMentors = mentorsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Filter out inactive mentors if isActive field exists
        allMentors = allMentors.filter(mentor => mentor.isActive !== false);

        console.log('Loaded mentors from Firebase:', allMentors.length);
        console.log('Mentor data sample:', allMentors.slice(0, 2));

        // If no mentors found, add demo mentors for development
        if (allMentors.length === 0) {
            console.log('No mentors found in database, using demo mentors');
            createDemoMentors();
            return;
        }

        // Sort by rating and experience
        allMentors.sort((a, b) => {
            const ratingA = a.rating || 0;
            const ratingB = b.rating || 0;
            const experienceA = parseInt(a.experienceYears || a.experience) || 0;
            const experienceB = parseInt(b.experienceYears || b.experience) || 0;

            if (ratingB !== ratingA) {
                return ratingB - ratingA;
            }
            return experienceB - experienceA;
        });

        filteredMentors = [...allMentors];

    } catch (error) {
        console.error('Error loading mentors:', error);
        console.log('Falling back to demo mentors due to error');
        // Create some demo mentors if Firebase fails
        createDemoMentors();
    }
};

// Create demo mentors for development
const createDemoMentors = () => {
    allMentors = [
        {
            id: 'demo1',
            fullName: 'Amina Suleiman',
            expertise: 'UX Designer at Google',
            experienceYears: 7,
            bio: 'Passionate about guiding aspiring designers to create impactful user experiences.',
            fieldOfExpertise: 'ux-design',
            location: 'remote',
            availability: ['weekdays', 'evenings'],
            experienceLevel: 'senior',
            rating: 4.9,
            sessionCount: 120,
            avatarUrl: '../assets/images/mentor-Amina.jpg'
        },
        {
            id: 'demo2',
            fullName: 'Kwame Boateng',
            expertise: 'Software Engineer at Andela',
            experienceYears: 10,
            bio: 'Helping the next generation build scalable and robust software solutions.',
            fieldOfExpertise: 'software-dev',
            location: 'accra',
            availability: ['weekdays', 'weekends'],
            experienceLevel: 'senior',
            rating: 4.8,
            sessionCount: 89,
            avatarUrl: '../assets/images/mentor-kwame.jpg'
        },
        {
            id: 'demo3',
            fullName: 'Dr. Emeka Okoro',
            expertise: 'AI Researcher at IBM',
            experienceYears: 15,
            bio: 'Guiding students through the complexities of AI and machine learning research.',
            fieldOfExpertise: 'data-science',
            location: 'remote',
            availability: ['evenings', 'weekends'],
            experienceLevel: 'senior',
            rating: 4.9,
            sessionCount: 156,
            avatarUrl: '../assets/images/mentor-emeka.jpg'
        },
        {
            id: 'demo4',
            fullName: 'Sarah Mensah',
            expertise: 'Product Manager at Microsoft',
            experienceYears: 8,
            bio: 'Mentoring on product strategy, development, and market fit.',
            fieldOfExpertise: 'business-strat',
            location: 'hybrid',
            availability: ['weekdays'],
            experienceLevel: 'mid',
            rating: 4.7,
            sessionCount: 94,
            avatarUrl: '../assets/images/mentor-sarah.jpg'
        },
        {
            id: 'demo5',
            fullName: 'David Osei',
            expertise: 'Financial Analyst at PwC',
            experienceYears: 12,
            bio: 'Providing insights into financial markets and corporate finance careers.',
            fieldOfExpertise: 'finance',
            location: 'accra',
            availability: ['weekdays', 'evenings'],
            experienceLevel: 'senior',
            rating: 4.6,
            sessionCount: 67,
            avatarUrl: '../assets/images/mentor-david.jpg'
        },
        {
            id: 'demo6',
            fullName: 'Fatima Hassan',
            expertise: 'Brand Strategist at Ogilvy',
            experienceYears: 9,
            bio: 'Helping students build strong personal and professional brands.',
            fieldOfExpertise: 'digital-marketing',
            location: 'kumasi',
            availability: ['weekends', 'evenings'],
            experienceLevel: 'mid',
            rating: 4.8,
            sessionCount: 78,
            avatarUrl: '../assets/images/mentor-fatima.jpg'
        }
    ];

    filteredMentors = [...allMentors];
};

// Apply filters
const applyFilters = () => {
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const fieldValue = fieldFilter?.value || '';
    const locationValue = locationFilter?.value || '';
    const availabilityValue = availabilityFilter?.value || '';
    const experienceValue = experienceFilter?.value || '';

    filteredMentors = allMentors.filter(mentor => {
        // Search filter
        if (searchTerm) {
            const searchable = `${mentor.fullName} ${mentor.expertise} ${mentor.bio} ${mentor.fieldOfExpertise}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }

        // Field of expertise filter
        if (fieldValue && mentor.fieldOfExpertise !== fieldValue) {
            return false;
        }

        // Location filter
        if (locationValue && mentor.location !== locationValue) {
            return false;
        }

        // Availability filter
        if (availabilityValue && !mentor.availability?.includes(availabilityValue)) {
            return false;
        }

        // Experience level filter
        if (experienceValue && mentor.experienceLevel !== experienceValue) {
            return false;
        }

        return true;
    });

    displayMentors();
};

// Display mentors
const displayMentors = () => {
    if (!mentorCardsContainer) return;

    if (filteredMentors.length === 0) {
        mentorCardsContainer.style.display = 'none';
        noMentorsFoundElement.style.display = 'block';
        if (loadMoreBtn) {
            loadMoreBtn.style.display = 'none';
        }
        return;
    }

    mentorCardsContainer.style.display = 'grid';
    noMentorsFoundElement.style.display = 'none';
    mentorCardsContainer.innerHTML = filteredMentors.slice(0, 6).map(mentor => createMentorCard(mentor)).join('');

    // Show/hide load more button
    if (loadMoreBtn) {
        loadMoreBtn.style.display = filteredMentors.length > 6 ? 'block' : 'none';
    }
};

// Create mentor card HTML
const createMentorCard = (mentor) => {
    const rating = mentor.rating || 4.5;
    const stars = '★'.repeat(Math.floor(rating)) + (rating % 1 ? '☆' : '');

    // Handle different experience field names
    const experience = mentor.experienceYears || mentor.experience || mentor.yearsOfExperience || 0;

    return `
        <div class="mentor-card">
            <img
                src="${mentor.avatarUrl || mentor.profilePicture || `https://placehold.co/100x100/E2E8F0/A0B2C4?text=${mentor.fullName?.charAt(0) || 'M'}`}"
                alt="${mentor.fullName} profile picture"
                class="mentor-profile-pic"
            />
            <h3>${escapeHtml(mentor.fullName || 'Unknown Mentor')}</h3>
            <p class="expertise">${escapeHtml(mentor.expertise || mentor.jobTitle || 'Professional Mentor')}</p>
            <p class="experience">${experience}+ Years Experience</p>

            <div class="mentor-stats">
                <div class="rating">
                    <span class="stars">${stars}</span>
                    <span class="rating-number">${rating.toFixed(1)}</span>
                </div>
                <div class="session-count">${mentor.sessionCount || 0} sessions</div>
            </div>

            <p class="bio-tagline">${escapeHtml(mentor.bio || 'Experienced mentor ready to guide your career journey.')}</p>

            <div class="mentor-tags">
                ${mentor.fieldOfExpertise || mentor.expertise ? `<span class="mentor-tag">${getFieldDisplayName(mentor.fieldOfExpertise || mentor.expertise)}</span>` : ''}
                ${mentor.location ? `<span class="mentor-tag">${getLocationDisplayName(mentor.location)}</span>` : ''}
            </div>

            <div class="mentor-card-actions">
                <button class="btn-accent-teal" onclick="showMentorProfileModal('${mentor.id}')">View Profile</button>
                <button class="btn btn-primary" onclick="showBookSessionModal('${mentor.id}')">Book Session</button>
            </div>
        </div>
    `;
};

// Show mentor profile modal
window.showMentorProfileModal = (mentorId) => {
    const mentor = allMentors.find(m => m.id === mentorId);
    if (!mentor) return;

    const experience = mentor.experienceYears || mentor.experience || mentor.yearsOfExperience || 0;

    const modalHtml = `
        <div class="modal-overlay" id="mentorProfileModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Mentor Profile</h2>
                    <button class="modal-close" onclick="closeMentorProfileModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="profile-header">
                        <img
                            src="${mentor.avatarUrl || mentor.profilePicture || `https://placehold.co/120x120/E2E8F0/A0B2C4?text=${mentor.fullName?.charAt(0) || 'M'}`}"
                            alt="${mentor.fullName}"
                            class="profile-avatar"
                        />
                        <div class="profile-info">
                            <h3>${escapeHtml(mentor.fullName || 'Unknown Mentor')}</h3>
                            <p class="job-title">${escapeHtml(mentor.expertise || mentor.jobTitle || 'Professional Mentor')}</p>
                            <p class="experience-info">${experience}+ Years Experience</p>
                            <div class="rating-info">
                                <span class="stars">${'★'.repeat(Math.floor(mentor.rating || 4.5))}</span>
                                <span>${(mentor.rating || 4.5).toFixed(1)}/5.0 (${mentor.sessionCount || 0} sessions)</span>
                            </div>
                        </div>
                    </div>

                    ${mentor.bio ? `
                        <div class="profile-section">
                            <h4>About</h4>
                            <p>${escapeHtml(mentor.bio)}</p>
                        </div>
                    ` : ''}

                    <div class="profile-section">
                        <h4>Expertise & Details</h4>
                        <div class="profile-tags">
                            ${mentor.fieldOfExpertise ? `<span class="tag">${getFieldDisplayName(mentor.fieldOfExpertise)}</span>` : ''}
                            ${mentor.location ? `<span class="tag">${getLocationDisplayName(mentor.location)}</span>` : ''}
                            ${mentor.companyName ? `<span class="tag">${escapeHtml(mentor.companyName)}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeMentorProfileModal()">Close</button>
                    <button class="btn btn-primary" onclick="closeMentorProfileModal(); showBookSessionModal('${mentor.id}')">Book Session</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// Show book session modal
window.showBookSessionModal = (mentorId) => {
    const mentor = allMentors.find(m => m.id === mentorId);
    if (!mentor) return;

    const modalHtml = `
        <div class="modal-overlay" id="bookSessionModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Book Session with ${escapeHtml(mentor.fullName)}</h2>
                    <button class="modal-close" onclick="closeBookSessionModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="bookSessionForm">
                        <div class="form-group">
                            <label for="sessionTopic">What would you like to discuss?</label>
                            <select id="sessionTopic" required>
                                <option value="">Select a topic</option>
                                <option value="career-guidance">Career Guidance</option>
                                <option value="skill-development">Skill Development</option>
                                <option value="industry-insights">Industry Insights</option>
                                <option value="resume-review">Resume Review</option>
                                <option value="interview-prep">Interview Preparation</option>
                                <option value="networking">Networking Advice</option>
                                <option value="other">Other (specify in message)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="preferredDuration">Preferred Session Duration</label>
                            <select id="preferredDuration" required>
                                <option value="">Select duration</option>
                                <option value="30">30 minutes</option>
                                <option value="45">45 minutes</option>
                                <option value="60">60 minutes</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="preferredTime">Preferred Time</label>
                            <select id="preferredTime" required>
                                <option value="">Select preferred time</option>
                                <option value="morning">Morning (9 AM - 12 PM)</option>
                                <option value="afternoon">Afternoon (12 PM - 5 PM)</option>
                                <option value="evening">Evening (5 PM - 8 PM)</option>
                                <option value="flexible">I'm flexible</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="requestMessage">Message to Mentor (Optional)</label>
                            <textarea
                                id="requestMessage"
                                rows="4"
                                placeholder="Tell ${mentor.fullName} a bit about yourself and what you hope to get out of this session..."
                            ></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeBookSessionModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitSessionRequest('${mentor.id}')">Send Request</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// Submit session request
window.submitSessionRequest = async (mentorId) => {
    try {
        const mentor = allMentors.find(m => m.id === mentorId);
        if (!mentor) {
            showError('Mentor not found.');
            return;
        }

        const form = document.getElementById('bookSessionForm');
        const formData = new FormData(form);

        const topic = document.getElementById('sessionTopic').value;
        const duration = document.getElementById('preferredDuration').value;
        const preferredTime = document.getElementById('preferredTime').value;
        const message = document.getElementById('requestMessage').value;

        if (!topic || !duration || !preferredTime) {
            showError('Please fill in all required fields.');
            return;
        }

        // Create session request
        const sessionRequest = {
            mentorId: mentorId,
            studentId: currentUser.uid,
            mentorName: mentor.fullName,
            studentName: currentUser.fullName,
            studentEmail: currentUser.email,
            status: 'pending',
            topic: topic,
            preferredDuration: parseInt(duration),
            preferredTime: preferredTime,
            requestMessage: message || `${currentUser.fullName} would like to book a mentorship session.`,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, 'sessionRequests'), sessionRequest);

        closeBookSessionModal();
        showSuccess(`Session request sent to ${mentor.fullName}! You'll be notified when they respond.`);

        // Reload sessions to show the new request
        await loadStudentSessions();
        displaySessions();

    } catch (error) {
        console.error('Error booking session:', error);
        showError('Failed to send session request. Please try again.');
    }
};

// Close modal functions
window.closeMentorProfileModal = () => {
    const modal = document.getElementById('mentorProfileModal');
    if (modal) modal.remove();
};

window.closeBookSessionModal = () => {
    const modal = document.getElementById('bookSessionModal');
    if (modal) modal.remove();
};

// Clear filters
window.clearFilters = () => {
    if (searchInput) searchInput.value = '';
    if (fieldFilter) fieldFilter.selectedIndex = 0;
    if (locationFilter) locationFilter.selectedIndex = 0;
    if (availabilityFilter) availabilityFilter.selectedIndex = 0;
    if (experienceFilter) experienceFilter.selectedIndex = 0;

    filteredMentors = [...allMentors];
    displayMentors();
};

// Alternative function name used in HTML
window.clearAllFilters = window.clearFilters;

// Load more mentors
const loadMoreMentors = () => {
    if (!mentorCardsContainer) return;

    const currentCount = mentorCardsContainer.children.length;
    const nextBatch = filteredMentors.slice(currentCount, currentCount + 6);

    nextBatch.forEach(mentor => {
        const mentorCard = document.createElement('div');
        mentorCard.innerHTML = createMentorCard(mentor);
        mentorCardsContainer.appendChild(mentorCard.firstElementChild);
    });

    // Hide load more if all mentors displayed
    if (currentCount + 6 >= filteredMentors.length && loadMoreBtn) {
        loadMoreBtn.style.display = 'none';
    }
};

// Load student sessions
const loadStudentSessions = async () => {
    try {
        console.log('Loading sessions for student:', currentUser.uid);

        // First try with orderBy, but fall back to simple query if it fails
        let sessionsQuery;
        let querySnapshot;

        try {
            console.log('Trying query with orderBy...');
            sessionsQuery = query(
                collection(db, 'sessionRequests'),
                where('studentId', '==', currentUser.uid),
                orderBy('createdAt', 'desc')
            );
            querySnapshot = await getDocs(sessionsQuery);
            console.log('OrderBy query successful');
        } catch (indexError) {
            console.warn('OrderBy query failed, trying without orderBy:', indexError);
            sessionsQuery = query(
                collection(db, 'sessionRequests'),
                where('studentId', '==', currentUser.uid)
            );
            querySnapshot = await getDocs(sessionsQuery);
            console.log('Simple query successful');
        }

        studentSessions = [];

        console.log('Raw sessions found in database:', querySnapshot.docs.length);

        // Process sessions
        for (const sessionDoc of querySnapshot.docs) {
            const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
            console.log('Processing session:', sessionDoc.id, sessionData);

            // Enrich with mentor data
            try {
                if (sessionData.mentorId) {
                    const mentorDoc = await getDoc(doc(db, 'users', sessionData.mentorId));
                    if (mentorDoc.exists()) {
                        sessionData.mentorData = mentorDoc.data();
                        console.log('Enriched session with mentor data:', mentorDoc.data().fullName);
                    } else {
                        console.warn('Mentor document not found for ID:', sessionData.mentorId);
                    }
                } else {
                    console.warn('Session has no mentorId:', sessionDoc.id);
                }
            } catch (error) {
                console.warn('Could not load mentor data for session:', sessionData.id, error);
            }

            studentSessions.push(sessionData);
        }

        // Sort sessions by createdAt if we have the field
        studentSessions.sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime; // Descending order (newest first)
        });

        console.log('Final processed student sessions:', studentSessions.length);
        if (studentSessions.length > 0) {
            console.log('Session sample:', studentSessions[0]);
        }

        // Temporarily enable demo sessions for testing if no real data
        if (studentSessions.length === 0) {
            console.log('No sessions found in database for student:', currentUser.uid);
            console.log('Enabling demo sessions for testing...');
            createDemoSessions();
        }

    } catch (error) {
        console.error('Critical error loading student sessions:', error);
        console.log('Session loading failed completely, using demo data');
        createDemoSessions();
    }
};

// Create demo sessions for development
const createDemoSessions = () => {
    studentSessions = [
        {
            id: 'demo-session-1',
            mentorId: 'demo1',
            mentorName: 'Amina Suleiman',
            status: 'confirmed',
            sessionDate: new Date(Date.now() + 86400000), // Tomorrow
            platform: 'Google Meet',
            topic: 'UX Design Career Path',
            meetingLink: 'https://meet.google.com/xyz-demo-link',
            mentorData: {
                fullName: 'Amina Suleiman',
                avatarUrl: '../assets/images/mentor-Amina.jpg'
            }
        },
        {
            id: 'demo-session-2',
            mentorId: 'demo2',
            mentorName: 'Kwame Boateng',
            status: 'completed',
            sessionDate: new Date(Date.now() - 604800000), // Last week
            platform: 'Zoom',
            topic: 'Software Development Best Practices',
            rating: 5,
            mentorData: {
                fullName: 'Kwame Boateng',
                avatarUrl: '../assets/images/mentor-kwame.jpg'
            }
        },
        {
            id: 'demo-session-3',
            mentorId: 'demo3',
            mentorName: 'Dr. Emeka Okoro',
            status: 'pending',
            topic: 'AI Research and Career Opportunities',
            requestMessage: 'I would like guidance on getting started in AI research.',
            mentorData: {
                fullName: 'Dr. Emeka Okoro',
                avatarUrl: '../assets/images/mentor-emeka.jpg'
            }
        }
    ];
};

// Display student sessions
const displaySessions = () => {
    console.log('Displaying sessions...');
    console.log('sessionsTableBody element:', sessionsTableBody);
    console.log('sessionsTableContainer element:', sessionsTableContainer);
    console.log('noSessionsFoundElement element:', noSessionsFoundElement);
    console.log('studentSessions count:', studentSessions.length);

    if (!sessionsTableBody) {
        console.error('sessionsTableBody element not found! Check DOM element IDs.');
        return;
    }

    if (studentSessions.length === 0) {
        console.log('No sessions to display, showing empty state');
        if (sessionsTableContainer) {
            sessionsTableContainer.style.display = 'none';
        }
        if (noSessionsFoundElement) {
            noSessionsFoundElement.style.display = 'block';
        }
        return;
    }

    console.log('Displaying', studentSessions.length, 'sessions');
    if (sessionsTableContainer) {
        sessionsTableContainer.style.display = 'block';
    }
    if (noSessionsFoundElement) {
        noSessionsFoundElement.style.display = 'none';
    }

    const sessionRows = studentSessions.map(session => createSessionRow(session));
    console.log('Generated session rows:', sessionRows.length);

    sessionsTableBody.innerHTML = sessionRows.join('');
    console.log('Sessions table updated');
};

// Create session row HTML
const createSessionRow = (session) => {
    const mentorData = session.mentorData || {};
    const mentorName = session.mentorName || mentorData.fullName || 'Unknown Mentor';
    const avatarUrl = mentorData.avatarUrl || `https://placehold.co/40x40/CBD5E1/475569?text=${mentorName.charAt(0)}`;

    let statusClass = 'status-pending';
    let statusText = 'Pending';
    let actionButtons = '';

    switch (session.status) {
        case 'confirmed':
            statusClass = 'status-upcoming';
            statusText = 'Confirmed';
            const isUpcoming = session.sessionDate && new Date(session.sessionDate.toDate ? session.sessionDate.toDate() : session.sessionDate) > new Date();
            if (isUpcoming) {
                actionButtons = `
                    <button class="action-button join-session" onclick="joinSession('${session.id}')">
                        ${session.meetingLink ? 'Join Now' : 'View Details'}
                    </button>
                    <button class="action-button reschedule" onclick="rescheduleSession('${session.id}')">Reschedule</button>
                `;
            } else {
                statusClass = 'status-completed';
                statusText = 'Completed';
                actionButtons = `<button class="action-button view-summary" onclick="viewSessionSummary('${session.id}')">View Summary</button>`;
            }
            break;
        case 'completed':
            statusClass = 'status-completed';
            statusText = 'Completed';
            actionButtons = `<button class="action-button view-summary" onclick="viewSessionSummary('${session.id}')">View Summary</button>`;
            break;
        case 'declined':
            statusClass = 'status-declined';
            statusText = 'Declined';
            // actionButtons = `<button class="action-button book-again" onclick="bookSession('${session.mentorId}')">Book Again</button>`;
            break;
        case 'cancelled':
            statusClass = 'status-cancelled';
            statusText = 'Cancelled';
            actionButtons = `<button class="action-button book-again" onclick="bookSession('${session.mentorId}')">Book Again</button>`;
            break;
        default:
            actionButtons = `
                <button class="action-button view-details" onclick="viewSessionRequest('${session.id}')">View Details</button>
                <button class="action-button cancel" onclick="cancelSessionRequest('${session.id}')">Cancel</button>
            `;
    }

    const sessionDateTime = session.sessionDate
        ? formatDateTime(session.sessionDate.toDate ? session.sessionDate.toDate() : session.sessionDate)
        : 'To be scheduled';

    return `
        <tr>
            <td>
                <div class="mentor-info-cell">
                    <img
                        src="${avatarUrl}"
                        alt="${escapeHtml(mentorName)}"
                        class="session-mentor-pic"
                    />
                    ${escapeHtml(mentorName)}
                </div>
            </td>
            <td>${sessionDateTime}</td>
            <td><span class="status-tag ${statusClass}">${statusText}</span></td>
            <td>${actionButtons}</td>
        </tr>
    `;
};

// Session action handlers
window.joinSession = (sessionId) => {
    const session = studentSessions.find(s => s.id === sessionId);
    if (!session) return;

    if (session.meetingLink) {
        window.open(session.meetingLink, '_blank');
    } else {
        alert('Meeting link not yet available. Please check back later or contact your mentor.');
    }
};

window.rescheduleSession = (sessionId) => {
    // In a real app, this would open a reschedule modal
    alert('Reschedule functionality will be implemented soon. Please contact your mentor directly for now.');
};

window.viewSessionSummary = (sessionId) => {
    const session = studentSessions.find(s => s.id === sessionId);
    if (!session) return;

    const modalHtml = `
        <div class="modal-overlay" id="sessionSummaryModal">
            <div class="modal-content session-summary-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-calendar-check"></i> Session Summary</h2>
                    <button class="modal-close" onclick="closeModal('sessionSummaryModal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="session-info-grid">
                        <div class="info-card">
                            <h4><i class="fas fa-user-tie"></i> Mentor</h4>
                            <p>${escapeHtml(session.mentorName || 'Unknown')}</p>
                        </div>
                        <div class="info-card">
                            <h4><i class="fas fa-lightbulb"></i> Topic</h4>
                            <p>${escapeHtml(getTopicDisplayName(session.topic) || 'General mentoring')}</p>
                        </div>
                        <div class="info-card">
                            <h4><i class="fas fa-calendar-alt"></i> Date</h4>
                            <p>${session.sessionDate ? formatDateTime(session.sessionDate.toDate ? session.sessionDate.toDate() : session.sessionDate) : 'N/A'}</p>
                        </div>
                        <div class="info-card">
                            <h4><i class="fas fa-video"></i> Platform</h4>
                            <p>${escapeHtml(session.platform || 'N/A')}</p>
                        </div>
                        ${session.meetingLink ? `
                        <div class="info-card full-width">
                            <h4><i class="fas fa-link"></i> Meeting Link</h4>
                            <p><a href="${escapeHtml(session.meetingLink)}" target="_blank" class="meeting-link">${escapeHtml(session.meetingLink)}</a></p>
                        </div>` : ''}
                    </div>

                    ${session.summary ? `
                    <div class="session-summary-section">
                        <h4><i class="fas fa-file-alt"></i> Session Summary</h4>
                        <div class="summary-content">${escapeHtml(session.summary).replace(/\n/g, '<br>')}</div>
                    </div>` : ''}

                    <div class="rating-section">
                        <h4><i class="fas fa-star"></i> Session Rating</h4>
                        <div class="rating-display">
                            ${session.rating ?
                                `<div class="stars">${'★'.repeat(session.rating)}${'☆'.repeat(5-session.rating)}</div>
                                 <span class="rating-text">${session.rating}/5</span>` :
                                '<span class="no-rating">Not rated yet</span>'
                            }
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal('sessionSummaryModal')">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.viewSessionRequest = (sessionId) => {
    const session = studentSessions.find(s => s.id === sessionId);
    if (!session) return;

    let statusIcon, statusClass, statusMessage;
    switch(session.status) {
        case 'pending':
            statusIcon = 'fas fa-clock';
            statusClass = 'status-pending';
            statusMessage = 'Your request is pending review by the mentor.';
            break;
        case 'confirmed':
            statusIcon = 'fas fa-check-circle';
            statusClass = 'status-confirmed';
            statusMessage = 'Your session has been confirmed!';
            break;
        case 'declined':
            statusIcon = 'fas fa-times-circle';
            statusClass = 'status-declined';
            statusMessage = 'Your request was declined.';
            break;
        default:
            statusIcon = 'fas fa-question-circle';
            statusClass = 'status-unknown';
            statusMessage = 'Status unknown.';
    }

    const modalHtml = `
        <div class="modal-overlay" id="sessionRequestModal">
            <div class="modal-content session-request-modal">
                <div class="modal-header">
                    <h2><i class="fas fa-paper-plane"></i> Session Request Details</h2>
                    <button class="modal-close" onclick="closeModal('sessionRequestModal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="status-section ${statusClass}">
                        <h4><i class="${statusIcon}"></i> Request Status</h4>
                        <p>${statusMessage}</p>
                    </div>

                    <div class="session-info-grid">
                        <div class="info-card">
                            <h4><i class="fas fa-user-tie"></i> Mentor</h4>
                            <p>${escapeHtml(session.mentorName || 'Unknown')}</p>
                        </div>
                        <div class="info-card">
                            <h4><i class="fas fa-lightbulb"></i> Topic</h4>
                            <p>${escapeHtml(getTopicDisplayName(session.topic) || 'General mentoring')}</p>
                        </div>
                        <div class="info-card">
                            <h4><i class="fas fa-clock"></i> Preferred Duration</h4>
                            <p>${session.preferredDuration || 'Not specified'} minutes</p>
                        </div>
                        <div class="info-card">
                            <h4><i class="fas fa-calendar-alt"></i> Requested</h4>
                            <p>${session.createdAt ? formatDateTime(session.createdAt.toDate()) : 'Unknown'}</p>
                        </div>
                        ${session.preferredTime ? `
                        <div class="info-card full-width">
                            <h4><i class="fas fa-clock"></i> Preferred Time</h4>
                            <p>${escapeHtml(session.preferredTime)}</p>
                        </div>` : ''}
                        ${session.sessionDate && session.status === 'confirmed' ? `
                        <div class="info-card full-width">
                            <h4><i class="fas fa-calendar-check"></i> Scheduled Time</h4>
                            <p>${formatDateTime(session.sessionDate.toDate ? session.sessionDate.toDate() : session.sessionDate)}</p>
                        </div>` : ''}
                        ${session.meetingLink && session.status === 'confirmed' ? `
                        <div class="info-card full-width">
                            <h4><i class="fas fa-link"></i> Meeting Link</h4>
                            <p><a href="${escapeHtml(session.meetingLink)}" target="_blank" class="meeting-link">${escapeHtml(session.meetingLink)}</a></p>
                        </div>` : ''}
                    </div>

                    ${session.requestMessage ? `
                    <div class="message-section">
                        <h4><i class="fas fa-comment"></i> Your Message</h4>
                        <div class="message-content">${escapeHtml(session.requestMessage).replace(/\n/g, '<br>')}</div>
                    </div>` : ''}

                    ${session.mentorMessage && session.status !== 'pending' ? `
                    <div class="mentor-message-section">
                        <h4><i class="fas fa-reply"></i> Mentor's Response</h4>
                        <div class="mentor-message-content">${escapeHtml(session.mentorMessage).replace(/\n/g, '<br>')}</div>
                    </div>` : ''}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeModal('sessionRequestModal')">
                        <i class="fas fa-times"></i> Close
                    </button>
                    ${session.status === 'confirmed' && session.meetingLink ?
                        `<button class="btn btn-primary" onclick="window.open('${escapeHtml(session.meetingLink)}', '_blank')">
                            <i class="fas fa-video"></i> Join Session
                        </button>` : ''
                    }
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.cancelSessionRequest = async (sessionId) => {
    if (!confirm('Are you sure you want to cancel this session request?')) {
        return;
    }

    try {
        // In a real app, this would update the session status to 'cancelled'
        const sessionIndex = studentSessions.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            studentSessions[sessionIndex].status = 'cancelled';
            displaySessions();
            showSuccess('Session request cancelled.');
        }
    } catch (error) {
        console.error('Error cancelling session:', error);
        showError('Failed to cancel session request. Please try again.');
    }
};

window.scrollToMentors = () => {
    document.getElementById('mentor-cards-section')?.scrollIntoView({ behavior: 'smooth' });
};

// Utility functions
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const getFieldDisplayName = (field) => {
    const fields = {
        'software-dev': 'Software Development',
        'ux-design': 'UX/UI Design',
        'digital-marketing': 'Digital Marketing',
        'data-science': 'Data Science',
        'business-strat': 'Business Strategy',
        'finance': 'Finance'
    };
    return fields[field] || field;
};

const getLocationDisplayName = (location) => {
    const locations = {
        'remote': 'Remote',
        'accra': 'Accra',
        'kumasi': 'Kumasi',
        'hybrid': 'Hybrid'
    };
    return locations[location] || location;
};

const formatDateTime = (date) => {
    if (!date) return 'Unknown date';
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
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
    // Show mentor loading state
    if (mentorsLoadingElement) {
        mentorsLoadingElement.style.display = 'block';
    }
    if (mentorCardsContainer) {
        mentorCardsContainer.style.display = 'none';
    }
    if (noMentorsFoundElement) {
        noMentorsFoundElement.style.display = 'none';
    }

    // Show sessions loading state
    if (sessionsLoadingElement) {
        sessionsLoadingElement.style.display = 'block';
    }
    if (sessionsTableContainer) {
        sessionsTableContainer.style.display = 'none';
    }
    if (noSessionsFoundElement) {
        noSessionsFoundElement.style.display = 'none';
    }
};

const hideLoading = () => {
    // Hide mentor loading state
    if (mentorsLoadingElement) {
        mentorsLoadingElement.style.display = 'none';
    }

    // Hide sessions loading state
    if (sessionsLoadingElement) {
        sessionsLoadingElement.style.display = 'none';
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