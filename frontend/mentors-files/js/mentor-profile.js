import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../../../public/js/firebase.js';

// Initialize mentor profile page
const initMentorProfile = async () => {
    try {
        // Show loading state initially
        showLoadingState();

        // Ensure user is authenticated
        await requireAuth();

        // Initialize logout functionality
        initLogout();

        // Load and populate user profile data
        await loadProfileData();

        // Initialize form handlers
        initFormHandlers();

        // Initialize avatar handlers
        initAvatarHandlers();

        // Hide loading state and show content
        hideLoadingState();

    } catch (error) {
        console.error('Mentor profile initialization error:', error);
        hideLoadingState();
        showError('Failed to load profile. Please refresh the page.');
    }
};

// Load user profile data and populate form
const loadProfileData = async () => {
    try {
        const userData = await getCurrentUser();

        if (userData.role !== 'mentor') {
            console.warn('User is not a mentor, redirecting to appropriate dashboard');
            window.location.href = '/public/index.html';
            return;
        }

        // Populate form fields with user data
        populateFormFields(userData);

        // Update avatar if exists
        updateAvatar(userData.avatarUrl);

    } catch (error) {
        console.error('Error loading profile data:', error);
        showError('Failed to load profile data');
    }
};

// Populate form fields with user data
const populateFormFields = (userData) => {
    const fieldMappings = {
        'first-name': userData.firstName || userData.fullName?.split(' ')[0] || '',
        'last-name': userData.lastName || userData.fullName?.split(' ').slice(1).join(' ') || '',
        'email': userData.email || '',
        'phone': userData.phone || '',
        'city-state': userData.cityState || userData.city || '',
        'country': userData.country || 'Ghana',
        'postal-code': userData.postalCode || '',
        'company-name': userData.companyName || '',
        'job-title': userData.jobTitle || '',
        'expertise': userData.expertise || '',
        'experience': userData.experience || '',
        'language': userData.language || 'English',
        'bio': userData.bio || ''
    };

    Object.entries(fieldMappings).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = value;
        }
    });
};

// Update avatar display
const updateAvatar = (avatarUrl) => {
    const avatarImg = document.querySelector('.profile-avatar');
    if (avatarImg && avatarUrl) {
        avatarImg.src = avatarUrl;
        avatarImg.alt = 'User Avatar';
    }
};

// Initialize form event handlers
const initFormHandlers = () => {
    const profileForm = document.querySelector('.profile-form');
    const saveBtn = document.querySelector('.save-btn');
    const cancelBtn = document.querySelector('.cancel-btn');

    if (profileForm) {
        profileForm.addEventListener('submit', handleFormSubmit);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', handleFormCancel);
    }

    // Add input change detection for unsaved changes warning
    const inputs = profileForm?.querySelectorAll('input, textarea, select');
    inputs?.forEach(input => {
        input.addEventListener('input', () => {
            markFormAsModified();
        });
    });
};

// Handle form submission
const handleFormSubmit = async (e) => {
    e.preventDefault();

    const saveBtn = document.querySelector('.save-btn');
    const originalText = saveBtn?.textContent;

    try {
        // Show loading state
        if (saveBtn) {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
        }

        // Get current user
        const currentUser = await getCurrentUser();

        // Collect form data
        const formData = collectFormData();

        // Validate form data
        if (!validateFormData(formData)) {
            return;
        }

        // Update user profile in Firestore
        await updateUserProfile(currentUser.uid, formData);

        // Show success message
        showSuccess('Profile updated successfully!');

        // Mark form as unmodified
        markFormAsUnmodified();

    } catch (error) {
        console.error('Error saving profile:', error);
        showError('Failed to save profile. Please try again.');
    } finally {
        // Reset button state
        if (saveBtn) {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }
};

// Collect form data
const collectFormData = () => {
    const avatarImg = document.querySelector('.profile-avatar');

    // Get avatar data - could be base64 data URL or placeholder URL
    let avatarData = null;
    if (avatarImg?.src && !avatarImg.src.includes('placehold.co')) {
        avatarData = avatarImg.src; // This will be base64 data URL for uploaded images
    }

    return {
        firstName: document.getElementById('first-name')?.value || '',
        lastName: document.getElementById('last-name')?.value || '',
        fullName: `${document.getElementById('first-name')?.value || ''} ${document.getElementById('last-name')?.value || ''}`.trim(),
        email: document.getElementById('email')?.value || '',
        phone: document.getElementById('phone')?.value || '',
        cityState: document.getElementById('city-state')?.value || '',
        country: document.getElementById('country')?.value || 'Ghana',
        postalCode: document.getElementById('postal-code')?.value || '',
        companyName: document.getElementById('company-name')?.value || '',
        jobTitle: document.getElementById('job-title')?.value || '',
        expertise: document.getElementById('expertise')?.value || '',
        experience: parseInt(document.getElementById('experience')?.value) || 0,
        language: document.getElementById('language')?.value || 'English',
        bio: document.getElementById('bio')?.value || '',
        avatarUrl: avatarData,
        updatedAt: new Date()
    };
};

// Validate form data
const validateFormData = (data) => {
    const required = ['firstName', 'lastName', 'email', 'expertise'];
    const missing = required.filter(field => !data[field]?.trim());

    if (missing.length > 0) {
        showError(`Please fill in all required fields: ${missing.join(', ')}`);
        return false;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
        showError('Please enter a valid email address');
        return false;
    }

    // Validate experience (should be positive number)
    if (data.experience < 0) {
        showError('Years of experience must be a positive number');
        return false;
    }

    return true;
};

// Update user profile in Firestore
const updateUserProfile = async (userId, profileData) => {
    try {
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, profileData);
        console.log('Profile updated successfully');
    } catch (error) {
        console.error('Error updating profile:', error);
        throw error;
    }
};

// Handle form cancel
const handleFormCancel = async () => {
    if (isFormModified()) {
        const confirm = window.confirm('You have unsaved changes. Are you sure you want to cancel?');
        if (!confirm) return;
    }

    try {
        // Show loading state for data refresh
        showDataLoadingState();

        // Reload profile data to reset form
        await loadProfileData();
        markFormAsUnmodified();

        showSuccess('Form reset to original values');
    } catch (error) {
        console.error('Error resetting form:', error);
        showError('Failed to reset form');
    } finally {
        hideDataLoadingState();
    }
};

// Initialize avatar event handlers
const initAvatarHandlers = () => {
    const changeAvatarBtn = document.querySelector('.change-avatar-btn');
    const removeAvatarBtn = document.querySelector('.remove-avatar-btn');

    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', handleChangeAvatar);
    }

    if (removeAvatarBtn) {
        removeAvatarBtn.addEventListener('click', handleRemoveAvatar);
    }
};

// Handle avatar change
const handleChangeAvatar = () => {
    // Create file input for avatar upload
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Validate file
                if (!validateAvatarFile(file)) {
                    return;
                }

                // Show loading state
                const changeBtn = document.querySelector('.change-avatar-btn');
                if (changeBtn) {
                    changeBtn.textContent = 'Processing...';
                    changeBtn.disabled = true;
                }

                // Convert image to base64 and compress
                const avatarDataUrl = await processAvatarImage(file);

                // Update avatar display
                updateAvatar(avatarDataUrl);

                // Save avatar data to user profile immediately
                const currentUser = await getCurrentUser();
                await updateUserProfile(currentUser.uid, {
                    avatarUrl: avatarDataUrl,
                    updatedAt: new Date()
                });

                showSuccess('Avatar updated successfully!');

            } catch (error) {
                console.error('Error handling avatar:', error);
                showError('Failed to process avatar. Please try again.');
            } finally {
                // Reset button state
                const changeBtn = document.querySelector('.change-avatar-btn');
                if (changeBtn) {
                    changeBtn.textContent = 'Change avatar';
                    changeBtn.disabled = false;
                }
            }
        }
    });

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
};

// Handle avatar removal
const handleRemoveAvatar = async () => {
    try {
        const removeBtn = document.querySelector('.remove-avatar-btn');

        if (removeBtn) {
            removeBtn.textContent = 'Removing...';
            removeBtn.disabled = true;
        }

        const currentUser = await getCurrentUser();

        // Update user profile to remove avatar URL (no file deletion needed for base64)
        await updateUserProfile(currentUser.uid, {
            avatarUrl: null,
            updatedAt: new Date()
        });

        // Update avatar display to default
        const defaultAvatar = "https://placehold.co/100x100/CBD5E1/475569?text=Avatar";
        updateAvatar(defaultAvatar);

        showSuccess('Avatar removed successfully!');

    } catch (error) {
        console.error('Error removing avatar:', error);
        showError('Failed to remove avatar. Please try again.');
    } finally {
        // Reset button state
        const removeBtn = document.querySelector('.remove-avatar-btn');
        if (removeBtn) {
            removeBtn.textContent = 'Remove avatar';
            removeBtn.disabled = false;
        }
    }
};

// Validate avatar file
const validateAvatarFile = (file) => {
    // Check file type
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file.');
        return false;
    }

    // Check file size (max 2MB for base64 storage)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
        showError('Image file must be smaller than 2MB.');
        return false;
    }

    return true;
};

// Process avatar image: resize, compress, and convert to base64
const processAvatarImage = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                try {
                    // Create canvas for resizing
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Set max dimensions (avatar size)
                    const maxSize = 200; // 200px max width/height
                    let { width, height } = img;

                    // Calculate new dimensions maintaining aspect ratio
                    if (width > height) {
                        if (width > maxSize) {
                            height = (height * maxSize) / width;
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width = (width * maxSize) / height;
                            height = maxSize;
                        }
                    }

                    // Set canvas size
                    canvas.width = width;
                    canvas.height = height;

                    // Draw and compress
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to base64 with compression
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8); // 80% quality

                    // Check final size (Firestore has 1MB document limit)
                    const sizeInBytes = Math.round((compressedDataUrl.length * 3) / 4);
                    const maxFirestoreSize = 800 * 1024; // 800KB to be safe

                    if (sizeInBytes > maxFirestoreSize) {
                        // Try with lower quality
                        const lowerQualityDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                        const newSize = Math.round((lowerQualityDataUrl.length * 3) / 4);

                        if (newSize > maxFirestoreSize) {
                            reject(new Error('Image is too large even after compression. Please choose a smaller image.'));
                            return;
                        }

                        resolve(lowerQualityDataUrl);
                    } else {
                        resolve(compressedDataUrl);
                    }

                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
};

// Form modification tracking
let formModified = false;

const markFormAsModified = () => {
    formModified = true;
    const saveBtn = document.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.classList.add('modified');
    }
};

const markFormAsUnmodified = () => {
    formModified = false;
    const saveBtn = document.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.classList.remove('modified');
    }
};

const isFormModified = () => formModified;

// Utility functions for user feedback
const showSuccess = (message) => {
    showNotification(message, 'success');
};

const showError = (message) => {
    showNotification(message, 'error');
};

const showNotification = (message, type = 'info') => {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add styles
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

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 5000);
};

// Loading state management
const showLoadingState = () => {
    const loadingElement = document.getElementById('profile-loading');
    const contentElement = document.getElementById('profile-content');

    if (loadingElement) {
        loadingElement.style.display = 'flex';
    }
    if (contentElement) {
        contentElement.style.display = 'none';
    }

    document.body.classList.add('profile-loading-active');
};

const hideLoadingState = () => {
    const loadingElement = document.getElementById('profile-loading');
    const contentElement = document.getElementById('profile-content');

    setTimeout(() => {
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        if (contentElement) {
            contentElement.style.display = 'block';
            contentElement.classList.add('profile-content-enter');

            setTimeout(() => {
                contentElement.classList.add('profile-content-enter-active');
            }, 10);
        }

        document.body.classList.remove('profile-loading-active');
    }, 800);
};

// Show loading state when refetching data
const showDataLoadingState = () => {
    const form = document.querySelector('.profile-form');
    const avatarSection = document.querySelector('.profile-avatar-section');

    if (form) {
        form.style.opacity = '0.6';
        form.style.pointerEvents = 'none';
    }
    if (avatarSection) {
        avatarSection.style.opacity = '0.6';
        avatarSection.style.pointerEvents = 'none';
    }
};

const hideDataLoadingState = () => {
    const form = document.querySelector('.profile-form');
    const avatarSection = document.querySelector('.profile-avatar-section');

    if (form) {
        form.style.opacity = '1';
        form.style.pointerEvents = 'auto';
    }
    if (avatarSection) {
        avatarSection.style.opacity = '1';
        avatarSection.style.pointerEvents = 'auto';
    }
};

// Warn user about unsaved changes before leaving
window.addEventListener('beforeunload', (e) => {
    if (isFormModified()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initMentorProfile);