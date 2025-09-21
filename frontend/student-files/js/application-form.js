import { requireAuth, getCurrentUser } from '../../../public/js/auth-utils.js';
import { db, storage } from '../../../public/js/firebase.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// DOM Elements
const modal = document.getElementById('application-modal');
const closeModalBtn = document.getElementById('close-application-modal');
const applicationForm = document.getElementById('application-form');
const submitBtn = document.getElementById('submit-application-btn');
const saveDraftBtn = document.getElementById('save-draft-btn');

// Form fields
const resumeUpload = document.getElementById('resume-upload');
const coverLetterTextarea = document.getElementById('cover-letter');
const additionalInfoTextarea = document.getElementById('additional-info');

// Character counters
const coverLetterCount = document.getElementById('cover-letter-count');
const additionalInfoCount = document.getElementById('additional-info-count');

// Current internship data
let currentInternship = null;
let currentUser = null;

// Define openApplicationModal function
const openApplicationModal = (internshipData) => {
    console.log('openApplicationModal called with:', internshipData);
    currentInternship = internshipData;

    // Check if modal exists
    const modal = document.getElementById('application-modal');
    if (!modal) {
        console.error('Application modal not found in DOM');
        return;
    }

    // Populate internship info
    const titleElement = document.getElementById('modal-internship-title');
    const summaryTitleElement = document.getElementById('summary-title');
    const summaryCompanyElement = document.getElementById('summary-company');
    const summaryLocationElement = document.getElementById('summary-location');

    if (titleElement) titleElement.textContent = `Apply for ${internshipData.title}`;
    if (summaryTitleElement) summaryTitleElement.textContent = internshipData.title;
    if (summaryCompanyElement) summaryCompanyElement.textContent = internshipData.companyName;
    if (summaryLocationElement) summaryLocationElement.textContent = `${internshipData.location || 'Remote'} • ${internshipData.duration || 'Duration TBD'}`;

    // Pre-populate user data if available
    if (currentUser) {
        prefillUserData();
    }

    // Show modal
    modal.style.display = 'flex';
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    console.log('Modal should now be visible');
    console.log('Modal style.display:', modal.style.display);
    console.log('Modal classes:', modal.className);

    // Focus first input
    setTimeout(() => {
        const firstInput = modal.querySelector('input:not([type="file"]), textarea');
        if (firstInput) firstInput.focus();
    }, 300);
};

// Initialize application form
const initApplicationForm = async () => {
    try {
        console.log('Initializing application form...');
        currentUser = await getCurrentUser();
        console.log('Current user loaded:', currentUser);

        // Setup event handlers
        setupEventHandlers();
        setupCharacterCounters();
        setupFileUploadHandlers();

        console.log('Application form initialized successfully');

    } catch (error) {
        console.error('Error initializing application form:', error);
    }
};

// Setup event handlers
const setupEventHandlers = () => {
    // Close modal handlers
    closeModalBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Form submission
    applicationForm?.addEventListener('submit', handleFormSubmit);

    // Save draft
    saveDraftBtn?.addEventListener('click', handleSaveDraft);

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.style.display === 'flex') {
            closeModal();
        }
    });
};

// Setup character counters
const setupCharacterCounters = () => {
    if (coverLetterTextarea && coverLetterCount) {
        coverLetterTextarea.addEventListener('input', () => {
            const count = coverLetterTextarea.value.length;
            coverLetterCount.textContent = count;

            if (count > 1000) {
                coverLetterCount.style.color = '#EF4444';
            } else if (count > 800) {
                coverLetterCount.style.color = '#F59E0B';
            } else {
                coverLetterCount.style.color = '#6B7280';
            }
        });
    }

    if (additionalInfoTextarea && additionalInfoCount) {
        additionalInfoTextarea.addEventListener('input', () => {
            const count = additionalInfoTextarea.value.length;
            additionalInfoCount.textContent = count;

            if (count > 500) {
                additionalInfoCount.style.color = '#EF4444';
            } else if (count > 400) {
                additionalInfoCount.style.color = '#F59E0B';
            } else {
                additionalInfoCount.style.color = '#6B7280';
            }
        });
    }
};

// Setup file upload handlers
const setupFileUploadHandlers = () => {
    if (resumeUpload) {
        const container = resumeUpload.parentElement;
        const uploadText = container.querySelector('.file-upload-text');
        const successDiv = container.querySelector('.file-upload-success');

        // File input change
        resumeUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFileSelection(file, uploadText, successDiv);
            }
        });

        // Drag and drop functionality
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.style.borderColor = '#1E3A8A';
            container.style.backgroundColor = '#F8FAFC';
        });

        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            container.style.borderColor = '#D1D5DB';
            container.style.backgroundColor = '';
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.style.borderColor = '#D1D5DB';
            container.style.backgroundColor = '';

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                resumeUpload.files = files;
                handleFileSelection(file, uploadText, successDiv);
            }
        });
    }
};

// Handle file selection
const handleFileSelection = (file, uploadText, successDiv) => {
    // Validate file
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
        showError('Please upload a PDF, DOC, or DOCX file.');
        return;
    }

    if (file.size > maxSize) {
        showError('File size must be less than 5MB.');
        return;
    }

    // Show success state
    uploadText.style.display = 'none';
    successDiv.style.display = 'flex';
    successDiv.querySelector('.file-name').textContent = file.name;
};


// Pre-fill form with user data
const prefillUserData = async () => {
    if (!currentUser) return;

    try {
        // Pre-fill phone if available
        const phoneInput = document.getElementById('phone');
        if (phoneInput && currentUser.phone) {
            phoneInput.value = currentUser.phone;
        }

        // Pre-fill skills if available
        const skillsInput = document.getElementById('relevant-skills');
        if (skillsInput && currentUser.skills && Array.isArray(currentUser.skills)) {
            skillsInput.value = currentUser.skills.join(', ');
        }

        // Set minimum start date to today
        const startDateInput = document.getElementById('start-date');
        if (startDateInput) {
            const today = new Date().toISOString().split('T')[0];
            startDateInput.min = today;
        }

    } catch (error) {
        console.error('Error pre-filling form data:', error);
    }
};

// Close modal
const closeModal = () => {
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        resetForm();
    }, 300);
};

// Reset form
const resetForm = () => {
    applicationForm?.reset();

    // Reset character counters
    if (coverLetterCount) coverLetterCount.textContent = '0';
    if (additionalInfoCount) additionalInfoCount.textContent = '0';

    // Reset file upload UI
    const uploadText = document.querySelector('.file-upload-text');
    const successDiv = document.querySelector('.file-upload-success');
    if (uploadText && successDiv) {
        uploadText.style.display = 'flex';
        successDiv.style.display = 'none';
    }

    // Clear any error states
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        group.classList.remove('error', 'success');
        const errorMsg = group.querySelector('.error-message');
        if (errorMsg) errorMsg.remove();
    });
};

// Handle form submission
const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
        setSubmitLoading(true);

        // Collect form data
        const formData = await collectFormData();

        // Submit application
        const result = await submitEnhancedApplication(currentInternship.id, currentInternship, formData);

        if (result.success) {
            showSuccess('Application submitted successfully!');
            closeModal();

            // Update UI to show application submitted
            updateApplyButtonState();
        }

    } catch (error) {
        console.error('Application submission error:', error);

        if (error.message.includes('already applied')) {
            showError('You have already applied to this internship.');
        } else {
            showError('Failed to submit application. Please try again.');
        }
    } finally {
        setSubmitLoading(false);
    }
};

// Validate form
const validateForm = () => {
    let isValid = true;
    const requiredFields = [
        { element: resumeUpload, message: 'Resume is required' },
        { element: document.getElementById('start-date'), message: 'Start date is required' }
    ];

    // Clear existing errors
    document.querySelectorAll('.form-group').forEach(group => {
        group.classList.remove('error');
        const errorMsg = group.querySelector('.error-message');
        if (errorMsg) errorMsg.remove();
    });

    // Validate required fields
    requiredFields.forEach(field => {
        if (!field.element.value || (field.element.type === 'file' && !field.element.files.length)) {
            showFieldError(field.element, field.message);
            isValid = false;
        }
    });

    // Validate file size and type
    if (resumeUpload.files.length > 0) {
        const file = resumeUpload.files[0];
        const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (!validTypes.includes(file.type)) {
            showFieldError(resumeUpload, 'Please upload a PDF, DOC, or DOCX file');
            isValid = false;
        } else if (file.size > maxSize) {
            showFieldError(resumeUpload, 'File size must be less than 5MB');
            isValid = false;
        }
    }

    // Validate character limits
    if (coverLetterTextarea.value.length > 1000) {
        showFieldError(coverLetterTextarea, 'Cover letter must be 1000 characters or less');
        isValid = false;
    }

    if (additionalInfoTextarea.value.length > 500) {
        showFieldError(additionalInfoTextarea, 'Additional information must be 500 characters or less');
        isValid = false;
    }

    // Validate URLs
    const urlFields = [
        { element: document.getElementById('linkedin'), name: 'LinkedIn URL' },
        { element: document.getElementById('portfolio'), name: 'Portfolio URL' }
    ];

    urlFields.forEach(field => {
        if (field.element.value && !isValidUrl(field.element.value)) {
            showFieldError(field.element, `Please enter a valid ${field.name}`);
            isValid = false;
        }
    });

    return isValid;
};

// Show field error
const showFieldError = (element, message) => {
    const formGroup = element.closest('.form-group');
    if (formGroup) {
        formGroup.classList.add('error');

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        formGroup.appendChild(errorDiv);
    }
};

// Validate URL
const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
};

// Collect form data
const collectFormData = async () => {
    const formData = new FormData(applicationForm);
    const data = {};

    // Get basic form data
    for (let [key, value] of formData.entries()) {
        if (key !== 'resume') {
            data[key] = value;
        }
    }

    // Handle file upload
    if (resumeUpload.files.length > 0) {
        const file = resumeUpload.files[0];
        data.resumeFile = file;
        data.resumeFileName = file.name;
        data.resumeFileSize = file.size;
        data.resumeFileType = file.type;
    }

    // Add user info
    data.studentId = currentUser.uid;
    data.studentName = currentUser.fullName;
    data.studentEmail = currentUser.email;

    // Process skills
    if (data.relevantSkills) {
        data.relevantSkills = data.relevantSkills.split(',').map(skill => skill.trim()).filter(skill => skill);
    }

    return data;
};

// Submit enhanced application
const submitEnhancedApplication = async (internshipId, internshipData, applicationData) => {
    try {
        // Check if already applied and if re-application is allowed
        const applicationCheck = await checkExistingApplication(internshipId);
        if (applicationCheck.hasApplication && !applicationCheck.canReapply) {
            const statusMessage = getApplicationStatusMessage(applicationCheck.status);
            throw new Error(statusMessage);
        }

        // Upload resume file if provided
        let resumeUrl = null;
        if (applicationData.resumeFile) {
            resumeUrl = await uploadResumeFile(applicationData.resumeFile, currentUser.uid, internshipId);
        }

        // Prepare application document
        const applicationDoc = {
            // Basic info
            studentId: applicationData.studentId,
            studentName: applicationData.studentName,
            studentEmail: applicationData.studentEmail,
            internshipId: internshipId,
            internshipTitle: internshipData.title,
            companyId: internshipData.companyId,
            companyName: internshipData.companyName,

            // Application data
            coverLetter: applicationData.coverLetter || '',
            phone: applicationData.phone || '',
            linkedin: applicationData.linkedin || '',
            portfolio: applicationData.portfolio || '',
            startDate: applicationData.startDate,
            preferredDuration: applicationData.duration || '',
            relevantSkills: applicationData.relevantSkills || [],
            additionalInfo: applicationData.additionalInfo || '',

            // File data
            resumeUrl: resumeUrl,
            resumeFileName: applicationData.resumeFileName || '',
            resumeFileSize: applicationData.resumeFileSize || 0,
            resumeFileType: applicationData.resumeFileType || '',

            // Metadata
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Use the enhanced submitApplication function
        return await window.submitEnhancedApplication(applicationDoc);

    } catch (error) {
        console.error('Error in submitEnhancedApplication:', error);
        throw error;
    }
};

// Check for existing application using the same logic as internships.js
const checkExistingApplication = async (internshipId) => {
    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

        const q = query(
            collection(db, 'applications'),
            where('internshipId', '==', internshipId),
            where('studentId', '==', currentUser.uid)
        );

        const querySnapshot = await getDocs(q);
        const existingApplications = [];

        querySnapshot.forEach((doc) => {
            existingApplications.push({
                id: doc.id,
                ...doc.data()
            });
        });

        if (existingApplications.length === 0) {
            return { hasApplication: false, canReapply: true, status: null };
        }

        // Get the most recent application
        const mostRecentApp = existingApplications.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return dateB - dateA;
        })[0];

        const status = mostRecentApp.status || 'pending';
        const canReapply = canReapplyBasedOnStatus(status);

        return {
            hasApplication: true,
            canReapply: canReapply,
            status: status,
            application: mostRecentApp
        };

    } catch (error) {
        console.error('Error checking existing application:', error);
        return { hasApplication: false, canReapply: true, status: null };
    }
};

// Helper function for determining re-application eligibility (matches internships.js)
const canReapplyBasedOnStatus = (status) => {
    const allowReapplicationStatuses = ['rejected', 'withdrawn'];
    const blockReapplicationStatuses = [
        'pending', 'applied', 'under-review', 'reviewing',
        'interview-scheduled', 'interview', 'shortlisted',
        'accepted', 'hired'
    ];

    if (!status) return true;

    if (allowReapplicationStatuses.includes(status.toLowerCase())) {
        return true;
    }

    if (blockReapplicationStatuses.includes(status.toLowerCase())) {
        return false;
    }

    return true; // Default to allowing for unknown statuses
};

// Get user-friendly message about application status (matches internships.js)
const getApplicationStatusMessage = (status) => {
    const statusMessages = {
        'pending': 'Your application is pending review',
        'applied': 'Your application is pending review',
        'under-review': 'Your application is currently under review',
        'reviewing': 'Your application is currently under review',
        'interview-scheduled': 'You have an interview scheduled for this position',
        'interview': 'You have an interview scheduled for this position',
        'shortlisted': 'Congratulations! You have been shortlisted for this position',
        'accepted': 'Congratulations! You have been accepted for this position',
        'hired': 'Congratulations! You have been hired for this position',
        'rejected': 'Your previous application was not selected. You can apply again with an improved profile.',
        'withdrawn': 'You previously withdrew your application. You can apply again if interested.'
    };

    return statusMessages[status] || 'You have already applied for this position';
};

// Upload resume file to Firebase Storage
const uploadResumeFile = async (file, studentId, internshipId) => {
    try {
        const timestamp = Date.now();
        const filename = `resumes/${studentId}/${internshipId}_${timestamp}_${file.name}`;
        const storageRef = ref(storage, filename);

        const snapshot = await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);

        return downloadUrl;

    } catch (error) {
        console.error('Error uploading resume:', error);
        throw new Error('Failed to upload resume. Please try again.');
    }
};

// Handle save draft
const handleSaveDraft = async () => {
    try {
        const formData = await collectFormData();

        // Save to localStorage for now
        const draftKey = `application_draft_${currentInternship.id}`;
        localStorage.setItem(draftKey, JSON.stringify(formData));

        showSuccess('Draft saved successfully!');

    } catch (error) {
        console.error('Error saving draft:', error);
        showError('Failed to save draft.');
    }
};

// Update apply button state
const updateApplyButtonState = () => {
    const applyButtons = document.querySelectorAll(`[data-id="${currentInternship.id}"]`);
    applyButtons.forEach(btn => {
        btn.textContent = 'Applied ✓';
        btn.style.backgroundColor = '#10b981';
        btn.style.pointerEvents = 'none';
    });
};

// Set submit button loading state
const setSubmitLoading = (loading) => {
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');

    if (loading) {
        btnText.style.display = 'none';
        btnSpinner.style.display = 'inline-block';
        submitBtn.disabled = true;
    } else {
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        submitBtn.disabled = false;
    }
};

// Utility functions
const showSuccess = (message) => {
    showNotification(message, 'success');
};

const showError = (message) => {
    showNotification(message, 'error');
};

const showNotification = (message, type = 'info') => {
    // Remove existing notifications
    const existingNotification = document.querySelector('.toast-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'toast-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10001;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        ${type === 'success'
            ? 'background-color: #10b981;'
            : type === 'error'
            ? 'background-color: #ef4444;'
            : 'background-color: #3b82f6;'
        }
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 4000);
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initApplicationForm);

// Make it available globally for backward compatibility
window.openApplicationModal = openApplicationModal;

export { openApplicationModal };