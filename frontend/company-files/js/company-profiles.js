import { requireAuth, initLogout, getCurrentUser } from '../../../public/js/auth-utils.js';
import { doc, updateDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db } from '../../../public/js/firebase.js';
import { initializeDataManager, getDataManager, formatters } from './data-integration.js';

// Initialize company profile page
const initCompanyProfile = async () => {
    try {
        // Show loading state initially
        showLoadingState();

        // Ensure user is authenticated
        await requireAuth();

        // Initialize logout functionality
        initLogout();

        // Get current user and initialize data manager
        const userData = await getCurrentUser();
        if (userData.role !== 'employer') {
            console.warn('User is not an employer, redirecting to appropriate dashboard');
            window.location.href = '/public/index.html';
            return;
        }

        const dataManager = initializeDataManager(userData.uid);

        // Load and populate company profile data
        await loadCompanyData(userData, dataManager);

        // Initialize form handlers
        initFormHandlers();

        // Initialize avatar/logo handlers
        initLogoHandlers();

        // Initialize view toggle handlers
        initViewToggleHandlers();

        // Hide loading state and show content
        hideLoadingState();

    } catch (error) {
        console.error('Company profile initialization error:', error);
        hideLoadingState();
        showError('Failed to load profile. Please refresh the page.');
    }
};

// Load company profile data and populate display
const loadCompanyData = async (userData, dataManager) => {
    try {
        // Populate company display with user data
        populateCompanyDisplay(userData);

        // Populate edit form with user data
        populateEditForm(userData);

        // Update logo if exists
        updateLogo(userData.logoUrl);

        // Load dynamic data
        await Promise.all([
            loadInternshipListings(dataManager),
            loadCompanyStatistics(dataManager)
        ]);

    } catch (error) {
        console.error('Error loading company data:', error);
        showError('Failed to load company data');
    }
};

// Populate company display elements
const populateCompanyDisplay = (userData) => {
    // Company header info
    const companyName = document.querySelector('.company-name');
    if (companyName) {
        companyName.textContent = userData.companyName || 'Company Name';
    }

    const companyIndustry = document.querySelector('.company-industry');
    if (companyIndustry) {
        companyIndustry.textContent = `${userData.industry || 'Industry'} | ${userData.businessType || 'Business Type'}`;
    }

    const companyLocation = document.querySelector('.company-location');
    if (companyLocation) {
        companyLocation.textContent = userData.location || userData.cityState || 'Location';
    }

    const companyWebsite = document.querySelector('.company-website');
    if (companyWebsite && userData.website) {
        companyWebsite.href = userData.website.startsWith('http') ? userData.website : `https://${userData.website}`;
        companyWebsite.textContent = userData.website;
    }

    // About us section
    const aboutUsText = document.querySelector('.about-us-section p');
    if (aboutUsText) {
        aboutUsText.textContent = userData.description || userData.bio || 'Company description will appear here.';
    }

    // Contact information
    const contactDetails = document.querySelector('.contact-details');
    if (contactDetails) {
        contactDetails.innerHTML = `
            <p><strong>Address:</strong> ${userData.address || 'Address not provided'}</p>
            <p><strong>Phone:</strong> ${userData.phone || 'Phone not provided'}</p>
            <p><strong>Email:</strong> ${userData.email || 'Email not provided'}</p>
        `;
    }
};

// Populate edit form with user data
const populateEditForm = (userData) => {
    const fieldMappings = {
        'companyName': userData.companyName || '',
        'companyDescription': userData.description || userData.bio || '',
        'companyIndustry': userData.industry || '',
        'companyLocation': userData.location || userData.cityState || '',
        'companyWebsite': userData.website || '',
        'companyPhone': userData.phone || '',
        'companyAddress': userData.address || '',
        'companyEmail': userData.email || ''
    };

    Object.entries(fieldMappings).forEach(([fieldId, value]) => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.value = value;
        }
    });
};

// Update company logo display
const updateLogo = (logoUrl) => {
    const logoImg = document.querySelector('.company-logo');
    if (logoImg && logoUrl) {
        logoImg.src = logoUrl;
        logoImg.alt = 'Company Logo';
    }
};

// Initialize view toggle handlers (between display and edit modes)
const initViewToggleHandlers = () => {
    const editBtn = document.querySelector('.section-header .btn-secondary');
    const cancelBtn = document.querySelector('.edit-profile-form .btn-secondary');
    const editForm = document.querySelector('.edit-profile-form');

    if (editBtn) {
        editBtn.addEventListener('click', () => {
            showEditMode();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            hideEditMode();
        });
    }

    // Initially hide edit form
    if (editForm) {
        editForm.style.display = 'none';
    }
};

const showEditMode = () => {
    const editForm = document.querySelector('.edit-profile-form');
    if (editForm) {
        editForm.style.display = 'block';
        editForm.scrollIntoView({ behavior: 'smooth' });
    }
};

const hideEditMode = () => {
    const editForm = document.querySelector('.edit-profile-form');
    if (editForm) {
        editForm.style.display = 'none';
    }
};

// Initialize form event handlers
const initFormHandlers = () => {
    const editForm = document.querySelector('.edit-profile-form form');
    const saveBtn = document.querySelector('.edit-profile-form .btn-primary');

    if (editForm) {
        editForm.addEventListener('submit', handleFormSubmit);
    }

    // Add input change detection for unsaved changes warning
    const inputs = editForm?.querySelectorAll('input, textarea, select');
    inputs?.forEach(input => {
        input.addEventListener('input', () => {
            markFormAsModified();
        });
    });
};

// Handle form submission
const handleFormSubmit = async (e) => {
    e.preventDefault();

    const saveBtn = document.querySelector('.edit-profile-form .btn-primary');
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

        // Update company profile in Firestore
        await updateCompanyProfile(currentUser.uid, formData);

        // Reload and display updated data
        await loadCompanyData();

        // Hide edit mode
        hideEditMode();

        // Show success message
        showSuccess('Company profile updated successfully!');

        // Mark form as unmodified
        markFormAsUnmodified();

    } catch (error) {
        console.error('Error saving company profile:', error);
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
    const logoImg = document.querySelector('.company-logo');

    // Get logo data - could be base64 data URL or placeholder URL
    let logoData = null;
    if (logoImg?.src && !logoImg.src.includes('placehold.co')) {
        logoData = logoImg.src; // This will be base64 data URL for uploaded images
    }

    return {
        companyName: document.getElementById('companyName')?.value || '',
        description: document.getElementById('companyDescription')?.value || '',
        industry: document.getElementById('companyIndustry')?.value || '',
        location: document.getElementById('companyLocation')?.value || '',
        website: document.getElementById('companyWebsite')?.value || '',
        phone: document.getElementById('companyPhone')?.value || '',
        address: document.getElementById('companyAddress')?.value || '',
        email: document.getElementById('companyEmail')?.value || '',
        logoUrl: logoData,
        updatedAt: new Date()
    };
};

// Validate form data
const validateFormData = (data) => {
    const required = ['companyName', 'description', 'industry'];
    const missing = required.filter(field => !data[field]?.trim());

    if (missing.length > 0) {
        showError(`Please fill in all required fields: ${missing.join(', ')}`);
        return false;
    }

    // Validate email format if provided
    if (data.email && data.email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            showError('Please enter a valid email address');
            return false;
        }
    }

    // Validate website format if provided
    if (data.website && data.website.trim()) {
        const websiteRegex = /^(https?:\/\/)?([\w\-]+\.)+[\w\-]+(\/.*)?$/;
        if (!websiteRegex.test(data.website)) {
            showError('Please enter a valid website URL');
            return false;
        }
    }

    return true;
};

// Update company profile in Firestore
const updateCompanyProfile = async (userId, profileData) => {
    try {
        const userDocRef = doc(db, 'users', userId);
        await updateDoc(userDocRef, profileData);
        console.log('Company profile updated successfully');
    } catch (error) {
        console.error('Error updating company profile:', error);
        throw error;
    }
};

// Initialize logo event handlers
const initLogoHandlers = () => {
    const logoUpload = document.getElementById('logoUpload');

    if (logoUpload) {
        logoUpload.addEventListener('change', handleLogoChange);
    }
};

// Handle logo change
const handleLogoChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            // Validate file
            if (!validateLogoFile(file)) {
                return;
            }

            // Convert image to base64 and compress
            const logoDataUrl = await processLogoImage(file);

            // Update logo display
            updateLogo(logoDataUrl);

            // Save logo data to user profile immediately
            const currentUser = await getCurrentUser();
            await updateCompanyProfile(currentUser.uid, {
                logoUrl: logoDataUrl,
                updatedAt: new Date()
            });

            showSuccess('Logo updated successfully!');

        } catch (error) {
            console.error('Error handling logo:', error);
            showError('Failed to process logo. Please try again.');
        }
    }
};

// Validate logo file
const validateLogoFile = (file) => {
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

// Process logo image: resize, compress, and convert to base64
const processLogoImage = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();

            img.onload = () => {
                try {
                    // Create canvas for resizing
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // Set max dimensions (logo size)
                    const maxSize = 150; // 150px max width/height for logo
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
};

const markFormAsUnmodified = () => {
    formModified = false;
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
        loadingElement.style.display = 'block';
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

// Warn user about unsaved changes before leaving
window.addEventListener('beforeunload', (e) => {
    if (isFormModified()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Load internship listings
const loadInternshipListings = async (dataManager) => {
    try {
        const internships = await dataManager.getInternships();
        const applications = await dataManager.getApplications();

        displayInternshipListings(internships, applications);
    } catch (error) {
        console.error('Error loading internship listings:', error);
        showEmptyInternships();
    }
};

// Display internship listings
const displayInternshipListings = (internships, applications) => {
    const listingsContainer = document.getElementById('internship-listings');
    if (!listingsContainer) return;

    // Remove loading placeholder
    const loadingPlaceholder = listingsContainer.querySelector('.loading-placeholder');
    if (loadingPlaceholder) {
        loadingPlaceholder.remove();
    }

    if (internships.length === 0) {
        showEmptyInternships();
        return;
    }

    // Calculate application counts for each internship
    const internshipsWithCounts = internships.map(internship => {
        const applicationCount = applications.filter(app => app.internshipId === internship.id).length;
        return { ...internship, applicationCount };
    });

    listingsContainer.innerHTML = internshipsWithCounts.map(internship => `
        <div class="job-card">
            <div class="job-details">
                <h3 class="job-title">${internship.title}</h3>
                <p class="job-location">${internship.location || 'Location not specified'}</p>
                <p class="job-duration">${internship.duration || 'Duration not specified'}</p>
                <p class="job-deadline">Deadline: ${formatters.date(internship.deadline) || 'No deadline set'}</p>
                <div class="job-stats" style="margin-top: 10px;">
                    <span class="stat-badge" style="background: #f3f4f6; color: #374151; padding: 4px 8px; border-radius: 12px; font-size: 12px;">
                        ${internship.applicationCount} ${internship.applicationCount === 1 ? 'application' : 'applications'}
                    </span>
                    <span class="status-badge status-${internship.status || 'active'}" style="margin-left: 8px; padding: 4px 8px; border-radius: 12px; font-size: 12px;">
                        ${formatters.status(internship.status || 'active')}
                    </span>
                </div>
            </div>
            <div class="job-actions" style="display: flex; flex-direction: column; gap: 8px;">
                <a href="manage.html?internship=${internship.id}" class="btn btn-secondary" style="text-align: center; padding: 8px 16px;">View Applications</a>
                <a href="edit-internship.html?id=${internship.id}" class="btn btn-tertiary" style="text-align: center; padding: 8px 16px;">Edit Details</a>
            </div>
        </div>
    `).join('');
};

// Show empty internships state
const showEmptyInternships = () => {
    const listingsContainer = document.getElementById('internship-listings');
    if (!listingsContainer) return;

    listingsContainer.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; background: #f9fafb; border: 2px dashed #d1d5db; border-radius: 12px;">
            <div style="color: #6b7280; margin-bottom: 16px;">
                <i class="fas fa-briefcase" style="font-size: 48px; opacity: 0.5;"></i>
            </div>
            <h3 style="color: #374151; margin-bottom: 8px;">No Internships Posted Yet</h3>
            <p style="color: #6b7280; margin-bottom: 20px;">Start attracting talented students by posting your first internship opportunity!</p>
            <a href="post.html" class="btn btn-primary">Post Your First Internship</a>
        </div>
    `;
};

// Load company statistics
const loadCompanyStatistics = async (dataManager) => {
    try {
        const statistics = await dataManager.getStatistics();
        displayCompanyStatistics(statistics);
    } catch (error) {
        console.error('Error loading company statistics:', error);
        // Keep placeholder values
    }
};

// Display company statistics
const displayCompanyStatistics = (stats) => {
    const elements = {
        'total-internships': stats.totalInternships || 0,
        'total-applications': stats.totalApplications || 0,
        'students-hired': stats.hiredApplications || 0,
        'active-internships': stats.activeInternships || 0
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;

            // Add a subtle animation
            element.style.opacity = '0';
            setTimeout(() => {
                element.style.transition = 'opacity 0.5s ease';
                element.style.opacity = '1';
            }, 100);
        }
    });
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initCompanyProfile);