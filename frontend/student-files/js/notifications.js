import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// DOM elements
const notificationsLoading = document.getElementById('notifications-loading');
const notificationsContent = document.getElementById('notifications-content');
const notificationsList = document.querySelector('.notifications-list');
const notificationFilter = document.getElementById('notification-filter');
const markAllReadBtn = document.getElementById('mark-all-read-btn');

// State
let currentUser = null;
let allNotifications = [];
let filteredNotifications = [];

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

        // Load notifications
        await loadNotifications();

        // Hide loading and show content
        hideLoading();

    } catch (error) {
        console.error('Page initialization error:', error);
        showError('Failed to load notifications. Please refresh the page.');
        hideLoading();
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    notificationFilter?.addEventListener('change', applyFilters);
    markAllReadBtn?.addEventListener('click', markAllAsRead);

    // Setup click handlers for notification actions
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('mark-read-btn')) {
            const notificationId = e.target.dataset.id;
            markAsRead(notificationId);
        } else if (e.target.classList.contains('view-application-btn')) {
            window.location.href = 'applications.html';
        }
    });
};

// Load notifications
const loadNotifications = async () => {
    try {
        // Load notifications and create mock data for demo
        await Promise.all([
            loadFirestoreNotifications(),
            generateShortlistNotifications()
        ]);

        // Sort by date
        allNotifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Update UI
        updateNotificationStats();
        filteredNotifications = [...allNotifications];
        displayNotifications();

    } catch (error) {
        console.error('Error loading notifications:', error);
        showError('Failed to load notifications. Please try again.');
    }
};

// Load notifications from Firestore
const loadFirestoreNotifications = async () => {
    try {
        const q = query(
            collection(db, 'notifications'),
            where('recipientId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const firestoreNotifications = [];

        querySnapshot.forEach((doc) => {
            firestoreNotifications.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date()
            });
        });

        allNotifications = firestoreNotifications;
        console.log('Loaded Firestore notifications:', firestoreNotifications.length);

    } catch (error) {
        console.error('Error loading Firestore notifications:', error);
        // Continue with mock data if Firestore fails
    }
};

// Generate shortlist notifications based on current applications
const generateShortlistNotifications = async () => {
    try {
        // Check for shortlisted applications
        const shortlistQuery = query(
            collection(db, 'shortlists'),
            where('studentId', '==', currentUser.uid)
        );

        const shortlistSnapshot = await getDocs(shortlistQuery);
        const shortlistNotifications = [];

        for (const doc of shortlistSnapshot.docs) {
            const shortlistData = doc.data();

            // Create notification for shortlisted application
            const notification = {
                id: `shortlist_${doc.id}`,
                type: 'shortlist',
                title: 'Congratulations! You\'ve been shortlisted',
                message: `Great news! You have been shortlisted for a position at ${shortlistData.companyName}. The company is interested in your profile and may contact you soon for the next steps.`,
                companyName: shortlistData.companyName,
                createdAt: shortlistData.createdAt?.toDate() || new Date(),
                read: false,
                actionUrl: 'applications.html'
            };

            shortlistNotifications.push(notification);
        }

        // Add demo notifications if no real data exists
        if (allNotifications.length === 0 && shortlistNotifications.length === 0) {
            shortlistNotifications.push(...generateDemoNotifications());
        }

        allNotifications = [...allNotifications, ...shortlistNotifications];

    } catch (error) {
        console.error('Error generating shortlist notifications:', error);
        // Add demo notifications as fallback
        if (allNotifications.length === 0) {
            allNotifications.push(...generateDemoNotifications());
        }
    }
};

// Generate demo notifications for testing
const generateDemoNotifications = () => {
    return [
        {
            id: 'demo_1',
            type: 'shortlist',
            title: 'You\'ve been shortlisted!',
            message: 'Congratulations! Tech Innovations Inc. has shortlisted you for the Frontend Developer Intern position.',
            companyName: 'Tech Innovations Inc.',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
            read: false,
            actionUrl: 'applications.html'
        },
        {
            id: 'demo_2',
            type: 'application',
            title: 'Application Status Update',
            message: 'Your application for Data Analyst Internship at Insightful Solutions is now under review.',
            companyName: 'Insightful Solutions',
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
            read: true,
            actionUrl: 'applications.html'
        },
        {
            id: 'demo_3',
            type: 'interview',
            title: 'Interview Invitation',
            message: 'You have been invited for an interview at Creative Minds Studio. Please check your email for details.',
            companyName: 'Creative Minds Studio',
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
            read: false,
            actionUrl: 'schedule.html'
        },
        {
            id: 'demo_4',
            type: 'system',
            title: 'Platform Update',
            message: 'New features have been added to CampusConnect! You can now track your application progress in real-time.',
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
            read: true
        }
    ];
};

// Apply filters
const applyFilters = () => {
    const filterValue = notificationFilter?.value || '';

    if (filterValue === '') {
        filteredNotifications = [...allNotifications];
    } else {
        filteredNotifications = allNotifications.filter(notification =>
            notification.type === filterValue
        );
    }

    displayNotifications();
};

// Display notifications
const displayNotifications = () => {
    if (!notificationsList) return;

    if (filteredNotifications.length === 0) {
        notificationsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-bell-slash"></i>
                </div>
                <h3>No notifications yet</h3>
                <p>You'll see notifications here when there are updates on your applications.</p>
            </div>
        `;
        return;
    }

    notificationsList.innerHTML = filteredNotifications.map(notification =>
        createNotificationCard(notification)
    ).join('');
};

// Create notification card
const createNotificationCard = (notification) => {
    const timeAgo = getTimeAgo(notification.createdAt);
    const typeIcon = getTypeIcon(notification.type);

    return `
        <div class="notification-item ${notification.read ? 'read' : 'unread'} ${notification.type}">
            <div class="notification-header">
                <h3 class="notification-title">
                    ${typeIcon} ${escapeHtml(notification.title)}
                </h3>
                <span class="notification-time">${timeAgo}</span>
            </div>

            <div class="notification-message">
                ${escapeHtml(notification.message)}
            </div>

            <div class="notification-meta">
                <span class="notification-type ${notification.type}">
                    ${getTypeDisplayName(notification.type)}
                </span>

                <div class="notification-actions">
                    ${!notification.read ? `
                        <button class="btn-link mark-read-btn" data-id="${notification.id}">
                            Mark as read
                        </button>
                    ` : ''}
                    ${notification.actionUrl ? `
                        <button class="btn btn-small btn-primary view-application-btn">
                            View Details
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
};

// Update notification statistics
const updateNotificationStats = () => {
    const totalCount = allNotifications.length;
    const unreadCount = allNotifications.filter(n => !n.read).length;

    const totalElement = document.getElementById('total-notifications');
    const unreadElement = document.getElementById('unread-notifications');

    if (totalElement) totalElement.textContent = totalCount;
    if (unreadElement) unreadElement.textContent = unreadCount;
};

// Mark single notification as read
const markAsRead = async (notificationId) => {
    try {
        const notification = allNotifications.find(n => n.id === notificationId);
        if (!notification || notification.read) return;

        // Update in Firebase if it's a real notification
        if (!notificationId.startsWith('demo_') && !notificationId.startsWith('shortlist_')) {
            await updateDoc(doc(db, 'notifications', notificationId), {
                read: true,
                readAt: serverTimestamp()
            });
        }

        // Update local state
        notification.read = true;

        // Refresh UI
        updateNotificationStats();
        displayNotifications();

    } catch (error) {
        console.error('Error marking notification as read:', error);
        alert('Failed to mark notification as read. Please try again.');
    }
};

// Mark all notifications as read
const markAllAsRead = async () => {
    try {
        const unreadNotifications = allNotifications.filter(n => !n.read);

        if (unreadNotifications.length === 0) {
            alert('All notifications are already marked as read.');
            return;
        }

        // Update in Firebase for real notifications
        const firebaseUpdates = unreadNotifications
            .filter(n => !n.id.startsWith('demo_') && !n.id.startsWith('shortlist_'))
            .map(n => updateDoc(doc(db, 'notifications', n.id), {
                read: true,
                readAt: serverTimestamp()
            }));

        await Promise.all(firebaseUpdates);

        // Update local state
        unreadNotifications.forEach(notification => {
            notification.read = true;
        });

        // Refresh UI
        updateNotificationStats();
        displayNotifications();

        showSuccessMessage('All notifications marked as read');

    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        alert('Failed to mark all notifications as read. Please try again.');
    }
};

// Utility functions
const getTypeIcon = (type) => {
    const icons = {
        'shortlist': '<i class="fas fa-star" style="color: #8b5cf6;"></i>',
        'application': '<i class="fas fa-file-alt" style="color: #10b981;"></i>',
        'interview': '<i class="fas fa-calendar-check" style="color: #f59e0b;"></i>',
        'system': '<i class="fas fa-info-circle" style="color: #6b7280;"></i>'
    };
    return icons[type] || '<i class="fas fa-bell"></i>';
};

const getTypeDisplayName = (type) => {
    const names = {
        'shortlist': 'Shortlist Alert',
        'application': 'Application Update',
        'interview': 'Interview Invitation',
        'system': 'System Announcement'
    };
    return names[type] || 'Notification';
};

const getTimeAgo = (date) => {
    const now = new Date();
    const diffInMs = now - date;
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInDays > 0) {
        return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
    } else if (diffInHours > 0) {
        return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
    } else {
        return 'Just now';
    }
};

const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const showSuccessMessage = (message) => {
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #d1fae5;
        color: #065f46;
        padding: 12px 20px;
        border-radius: 8px;
        border: 1px solid #a7f3d0;
        z-index: 10000;
        max-width: 300px;
    `;
    successDiv.textContent = message;

    document.body.appendChild(successDiv);

    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.remove();
        }
    }, 3000);
};

// Loading state management
const showLoading = () => {
    if (notificationsLoading) notificationsLoading.style.display = 'flex';
    if (notificationsContent) notificationsContent.style.display = 'none';
};

const hideLoading = () => {
    if (notificationsLoading) notificationsLoading.style.display = 'none';
    if (notificationsContent) notificationsContent.style.display = 'block';
};

// Error handling
const showError = (message) => {
    if (notificationsList) {
        notificationsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                </div>
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 16px;">Retry</button>
            </div>
        `;
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);