// ==================== UTILITY FUNCTIONS ====================

// Toast Notification System
class Toast {
    static show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${this.getIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, duration);
    }
    
    static getIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }
    
    static success(message, duration) {
        this.show(message, 'success', duration);
    }
    
    static error(message, duration) {
        this.show(message, 'error', duration);
    }
    
    static warning(message, duration) {
        this.show(message, 'warning', duration);
    }
    
    static info(message, duration) {
        this.show(message, 'info', duration);
    }
}

// Loading Spinner
class LoadingSpinner {
    static show(targetElement) {
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.id = 'global-spinner';
        spinner.innerHTML = `
            <div class="spinner-content">
                <div class="spinner"></div>
                <p>Loading...</p>
            </div>
        `;
        document.body.appendChild(spinner);
    }
    
    static hide() {
        const spinner = document.getElementById('global-spinner');
        if (spinner) {
            spinner.remove();
        }
    }
}

// API Helper
class API {
    static async request(url, options = {}) {
        const token = localStorage.getItem('token') || localStorage.getItem('driverToken');
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };
        
        const config = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };
        
        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }
    
    static get(url) {
        return this.request(url, { method: 'GET' });
    }
    
    static post(url, body) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }
    
    static put(url, body) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }
    
    static delete(url) {
        return this.request(url, { method: 'DELETE' });
    }
}

// Format currency
function formatCurrency(amount) {
    return `₹${amount.toFixed(2)}`;
}

// Format date
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

// Format time
function formatTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Format date and time
function formatDateTime(date) {
    return `${formatDate(date)} at ${formatTime(date)}`;
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check if online
function isOnline() {
    return navigator.onLine;
}

// Show offline indicator
function showOfflineIndicator() {
    if (!isOnline()) {
        const indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.className = 'offline-indicator';
        indicator.innerHTML = `
            <i class="fas fa-wifi"></i>
            <span>You're offline</span>
        `;
        document.body.appendChild(indicator);
    } else {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

// Initialize offline detection
window.addEventListener('online', () => {
    showOfflineIndicator();
    Toast.success('Connection restored');
});

window.addEventListener('offline', () => {
    showOfflineIndicator();
    Toast.warning('You are offline');
});

// Export for use in other files
window.Toast = Toast;
window.LoadingSpinner = LoadingSpinner;
window.API = API;
window.utils = {
    formatCurrency,
    formatDate,
    formatTime,
    formatDateTime,
    calculateDistance,
    debounce,
    isOnline,
    showOfflineIndicator
};

