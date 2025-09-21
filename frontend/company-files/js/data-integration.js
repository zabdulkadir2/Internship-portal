import { db } from '../../../public/js/firebase.js';
import { collection, getDocs, getDoc, doc, onSnapshot, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Data Integration Module for Company Portal
 * Provides centralized data management and real-time updates
 */

class CompanyDataManager {
    constructor(companyId) {
        this.companyId = companyId;
        this.listeners = new Map();
        this.cache = new Map();
        this.subscribers = new Map();
    }

    // Subscribe to data changes
    subscribe(dataType, callback) {
        if (!this.subscribers.has(dataType)) {
            this.subscribers.set(dataType, new Set());
        }
        this.subscribers.get(dataType).add(callback);

        // Return unsubscribe function
        return () => {
            this.subscribers.get(dataType)?.delete(callback);
        };
    }

    // Notify subscribers of data changes
    notify(dataType, data) {
        const callbacks = this.subscribers.get(dataType);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error in subscriber callback:', error);
                }
            });
        }
    }

    // Get company internships with real-time updates
    getInternships(enableRealTime = false) {
        const cacheKey = 'internships';

        if (enableRealTime && !this.listeners.has(cacheKey)) {
            const q = query(
                collection(db, 'internships'),
                where('companyId', '==', this.companyId)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                let internships = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Sort client-side to avoid composite index requirement
                internships.sort((a, b) => {
                    const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
                    const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
                    return dateB - dateA; // Newest first
                });

                this.cache.set(cacheKey, internships);
                this.notify('internships', internships);
            }, (error) => {
                console.error('Error listening to internships:', error);
            });

            this.listeners.set(cacheKey, unsubscribe);
        }

        // Return cached data if available, otherwise fetch once
        if (this.cache.has(cacheKey)) {
            return Promise.resolve(this.cache.get(cacheKey));
        }

        return this.fetchInternships();
    }

    // Fetch internships once
    async fetchInternships() {
        const q = query(
            collection(db, 'internships'),
            where('companyId', '==', this.companyId)
        );

        const snapshot = await getDocs(q);
        let internships = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort client-side to avoid composite index requirement
        internships.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return dateB - dateA; // Newest first
        });

        this.cache.set('internships', internships);
        return internships;
    }

    // Get applications for company internships with real-time updates
    getApplications(enableRealTime = false) {
        return new Promise(async (resolve, reject) => {
            try {
                const internships = await this.getInternships();
                const internshipIds = internships.map(i => i.id);

                if (internshipIds.length === 0) {
                    resolve([]);
                    return;
                }

                const cacheKey = 'applications';

                if (enableRealTime && !this.listeners.has(cacheKey)) {
                    this.setupApplicationsListener(internshipIds);
                }

                if (this.cache.has(cacheKey)) {
                    resolve(this.cache.get(cacheKey));
                } else {
                    const applications = await this.fetchApplications(internshipIds);
                    resolve(applications);
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    // Setup real-time listener for applications
    setupApplicationsListener(internshipIds) {
        // Handle Firestore 'in' query limitation (max 10 items)
        const batches = [];
        for (let i = 0; i < internshipIds.length; i += 10) {
            batches.push(internshipIds.slice(i, i + 10));
        }

        const unsubscribes = [];
        let allApplications = [];

        batches.forEach((batch, index) => {
            const q = query(
                collection(db, 'applications'),
                where('internshipId', 'in', batch)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const batchApplications = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Update applications for this batch
                allApplications = allApplications.filter(app =>
                    !batch.includes(app.internshipId)
                );
                allApplications = allApplications.concat(batchApplications);

                // Sort by creation date client-side
                allApplications.sort((a, b) => {
                    const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
                    const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
                    return dateB - dateA;
                });

                this.cache.set('applications', allApplications);
                this.notify('applications', allApplications);
            }, (error) => {
                console.error('Error listening to applications batch:', error);
            });

            unsubscribes.push(unsubscribe);
        });

        this.listeners.set('applications', () => {
            unsubscribes.forEach(unsub => unsub());
        });
    }

    // Fetch applications once
    async fetchApplications(internshipIds) {
        const batches = [];
        for (let i = 0; i < internshipIds.length; i += 10) {
            batches.push(internshipIds.slice(i, i + 10));
        }

        let allApplications = [];

        for (const batch of batches) {
            const q = query(
                collection(db, 'applications'),
                where('internshipId', 'in', batch)
            );

            const snapshot = await getDocs(q);
            const batchApplications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            allApplications = allApplications.concat(batchApplications);
        }

        // Sort by creation date
        allApplications.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return dateB - dateA;
        });

        this.cache.set('applications', allApplications);
        return allApplications;
    }

    // Get dashboard statistics
    async getStatistics() {
        try {
            const [internships, applications] = await Promise.all([
                this.getInternships(),
                this.getApplications()
            ]);

            const stats = {
                totalInternships: internships.length,
                activeInternships: internships.filter(i => i.status === 'active').length,
                totalApplications: applications.length,
                pendingApplications: applications.filter(a => !a.status || a.status === 'applied').length,
                shortlistedApplications: applications.filter(a =>
                    a.status === 'shortlisted' || a.status === 'interview-scheduled'
                ).length,
                hiredApplications: applications.filter(a => a.status === 'hired').length
            };

            this.cache.set('statistics', stats);
            return stats;
        } catch (error) {
            console.error('Error calculating statistics:', error);
            return {
                totalInternships: 0,
                activeInternships: 0,
                totalApplications: 0,
                pendingApplications: 0,
                shortlistedApplications: 0,
                hiredApplications: 0
            };
        }
    }

    // Get recent applications with student data
    async getRecentApplicationsWithStudents(limit = 5) {
        try {
            const applications = await this.getApplications();
            const recentApplications = applications.slice(0, limit);

            // Batch fetch student data
            const studentIds = [...new Set(recentApplications.map(app => app.studentId))];
            const students = await this.getStudentsByIds(studentIds);

            const studentsMap = new Map(students.map(student => [student.id, student]));

            const applicationsWithStudents = recentApplications.map(app => ({
                ...app,
                student: studentsMap.get(app.studentId) || {
                    fullName: 'Unknown Student',
                    university: 'Unknown University',
                    email: 'unknown@email.com'
                }
            }));

            return applicationsWithStudents;
        } catch (error) {
            console.error('Error getting recent applications with students:', error);
            return [];
        }
    }

    // Get students by IDs (individual fetch to avoid index issues)
    async getStudentsByIds(studentIds) {
        if (studentIds.length === 0) return [];

        try {
            const students = [];

            // Fetch each student individually to avoid index requirements
            for (const studentId of studentIds) {
                try {
                    const studentDoc = await getDoc(doc(db, 'users', studentId));
                    if (studentDoc.exists()) {
                        students.push({
                            id: studentDoc.id,
                            ...studentDoc.data()
                        });
                    }
                } catch (error) {
                    console.error(`Error fetching student ${studentId}:`, error);
                    // Continue with other students
                }
            }

            return students;
        } catch (error) {
            console.error('Error fetching students by IDs:', error);
            return [];
        }
    }

    // Clean up listeners
    cleanup() {
        this.listeners.forEach((unsubscribe, key) => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.listeners.clear();
        this.cache.clear();
        this.subscribers.clear();
    }

    // Refresh all data
    async refreshAll() {
        this.cache.clear();
        const [internships, applications, statistics] = await Promise.all([
            this.fetchInternships(),
            this.getApplications(),
            this.getStatistics()
        ]);

        this.notify('internships', internships);
        this.notify('applications', applications);
        this.notify('statistics', statistics);

        return { internships, applications, statistics };
    }
}

// Global data manager instance
let globalDataManager = null;

// Initialize data manager for company
export const initializeDataManager = (companyId) => {
    if (globalDataManager) {
        globalDataManager.cleanup();
    }
    globalDataManager = new CompanyDataManager(companyId);
    return globalDataManager;
};

// Get global data manager
export const getDataManager = () => {
    if (!globalDataManager) {
        throw new Error('Data manager not initialized. Call initializeDataManager first.');
    }
    return globalDataManager;
};

// Utility functions for data formatting
export const formatters = {
    date: (timestamp) => {
        if (!timestamp) return 'Unknown date';
        try {
            if (timestamp.toDate) {
                return timestamp.toDate().toLocaleDateString();
            }
            return new Date(timestamp).toLocaleDateString();
        } catch (error) {
            return 'Unknown date';
        }
    },

    status: (status) => {
        const statusMap = {
            'applied': 'Applied',
            'under-review': 'Under Review',
            'interview-scheduled': 'Interview Scheduled',
            'shortlisted': 'Shortlisted',
            'hired': 'Hired',
            'rejected': 'Rejected'
        };
        return statusMap[status] || 'Applied';
    },

    currency: (amount) => {
        if (!amount) return 'Not specified';
        return `$${amount.toLocaleString()}`;
    }
};

// Performance utilities
export const debounce = (func, wait) => {
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

export const throttle = (func, limit) => {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};