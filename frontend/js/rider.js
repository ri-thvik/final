// ==================== CONFIGURATION ====================
const API_URL = 'http://localhost:5000/api';
let socket;
let token = localStorage.getItem('token');
let user = null;
let currentTrip = null;
let selectedVehicleType = null;
let pickupLocation = null;
let dropLocation = null;
let searchType = null; // 'pickup' or 'drop'
let savedAddresses = [];
let tripHistory = [];

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    // Hide splash screen after 2 seconds
    setTimeout(() => {
        document.getElementById('splash-screen').style.display = 'none';

        if (token) {
            verifyToken();
        } else {
            showAuthScreen();
        }
    }, 2000);
});

// ==================== AUTH FUNCTIONS ====================
function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'block';
}

function showMainScreen() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    initSocket();

    // Initialize map
    setTimeout(() => {
        if (window.mapFunctions) {
            window.mapFunctions.initMap();
        }
    }, 100);
}

async function verifyToken() {
    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            user = data.data;
            updateUserInfo();
            showMainScreen();
        } else {
            localStorage.removeItem('token');
            showAuthScreen();
        }
    } catch (err) {
        console.error(err);
        localStorage.removeItem('token');
        showAuthScreen();
    }
}

async function handleAuth() {
    const phone = document.getElementById('phone').value;
    const nameInput = document.getElementById('name');
    const nameGroup = document.getElementById('name-group');
    const authBtn = document.getElementById('auth-btn');

    if (!phone || phone.length < 10) {
        alert('Please enter a valid phone number');
        return;
    }

    // Try login first
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();

        if (data.success) {
            handleLoginSuccess(data);
        } else {
            // Show name field for registration
            nameGroup.style.display = 'block';
            authBtn.innerHTML = '<span>Register</span><i class="fas fa-arrow-right"></i>';
            authBtn.onclick = () => register(phone);
        }
    } catch (err) {
        console.error(err);
        alert('Error connecting to server');
    }
}

async function register(phone) {
    const name = document.getElementById('name').value;

    if (!name) {
        alert('Please enter your name');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name, role: 'rider' })
        });
        const data = await res.json();

        if (data.success) {
            handleLoginSuccess(data);
        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Error connecting to server');
    }
}

async function handleLoginSuccess(data) {
    token = data.token;
    localStorage.setItem('token', token);

    // Fetch complete user profile
    try {
        const userRes = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();

        if (userData.success && userData.data) {
            user = userData.data;
            console.log('User loaded:', user);
        } else {
            user = { name: 'User', _id: Date.now().toString() };
        }
    } catch (err) {
        console.error('Error fetching user:', err);
        user = { name: 'User', _id: Date.now().toString() };
    }

    updateUserInfo();
    showMainScreen();
    initSocket();
}

function updateUserInfo() {
    if (user) {
        document.getElementById('user-name').textContent = user.name;
        document.getElementById('menu-user-name').textContent = user.name;
        document.getElementById('menu-user-phone').textContent = user.phone || '+91 XXXXXXXXXX';
    }
}

function logout() {
    localStorage.removeItem('token');
    token = null;
    user = null;
    if (socket) socket.disconnect();
    location.reload();
}

// ==================== SOCKET.IO ====================
function initSocket() {
    socket = io('http://localhost:5000');

    socket.on('connect', () => {
        console.log('Connected to socket server');
        if (user && user._id) {
            socket.emit('join', `rider:${user._id}`);
            console.log(`Rider joined room: rider:${user._id}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from socket server');
    });

    socket.on('reconnect', () => {
        console.log('Reconnected to socket server');
        if (user && user._id) {
            socket.emit('join', `rider:${user._id}`);
            console.log(`Rider re-joined room: rider:${user._id}`);
        }
    });

    socket.on('driver:location', (data) => {
        updateDriverLocation(data);
    });

    socket.on('trip:update', (data) => {
        updateTripStatus(data);
    });

    // Listen for driver assignment
    socket.on('trip:driver_assigned', (data) => {
        console.log('Driver assigned:', data);
        handleDriverAssigned(data);
    });

    // Listen for trip status changes
    socket.on('trip:status_changed', (data) => {
        console.log('Trip status changed:', data);
        updateTripStatus(data);
    });

    // Listen for trip cancellation (by driver or OTP failure)
    socket.on('trip:cancelled', (data) => {
        console.log('Trip cancelled:', data);
        handleTripCancelled(data);
    });

    // Listen for no drivers available
    socket.on('ride:no_drivers', (data) => {
        console.log('No drivers available:', data);
        handleNoDrivers(data);
    });
}

// ==================== MENU ====================
function toggleMenu() {
    const menu = document.getElementById('side-menu');
    const overlay = document.getElementById('side-menu-overlay');
    menu.classList.toggle('active');
    if (overlay) {
        overlay.classList.toggle('active');
    }
}

// ==================== LOCATION ====================
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                pickupLocation = { lat, lng, address: 'Current Location' };
                document.getElementById('pickup-input').value = 'Getting address...';

                // Use maps.js reverse geocode if available
                if (window.mapFunctions) {
                    window.mapFunctions.reverseGeocode(lat, lng, 'pickup');
                    window.mapFunctions.addMarker(lat, lng, 'pickup');

                    // Center map on current location
                    if (window.mapFunctions.map) {
                        window.mapFunctions.map.setView([lat, lng], 15);
                    }
                } else {
                    document.getElementById('pickup-input').value = 'Current Location';
                }
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Unable to get your location. Please enable location services.');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        alert('Geolocation is not supported by your browser');
    }
}

function openLocationSearch(type) {
    searchType = type;
    document.getElementById('location-search-modal').style.display = 'flex';
    document.getElementById('location-search-input').focus();
}

function closeLocationSearch() {
    document.getElementById('location-search-modal').style.display = 'none';
}

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

async function searchLocation(event) {
    const query = event.target.value;
    if (query.length < 3) return;

    // Use LocationIQ search
    if (window.mapFunctions) {
        const results = await window.mapFunctions.searchLocationIQ(query);
        displaySearchResults(results);
    }
}

function displaySearchResults(results) {
    const container = document.getElementById('search-results');
    container.innerHTML = `
        <div class="search-result-item" onclick="selectCurrentLocation()">
            <i class="fas fa-location-crosshairs"></i>
            <div class="result-info">
                <h4>Current Location</h4>
                <p>Use my current location</p>
            </div>
        </div>
    `;

    results.forEach((result, index) => {
        container.innerHTML += `
            <div class="search-result-item" onclick="selectSearchResult(${index})" data-lat="${result.lat}" data-lng="${result.lng}">
                <i class="fas fa-map-marker-alt"></i>
                <div class="result-info">
                    <h4>${result.name}</h4>
                    <p>${result.address}</p>
                </div>
            </div>
        `;
    });
}

function selectCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const location = { lat, lng, address: 'Current Location' };

                if (searchType === 'pickup') {
                    pickupLocation = location;
                    document.getElementById('pickup-input').value = 'Getting address...';
                    if (window.mapFunctions) {
                        window.mapFunctions.reverseGeocode(lat, lng, 'pickup');
                        window.mapFunctions.addMarker(lat, lng, 'pickup');
                    }
                } else {
                    dropLocation = location;
                    document.getElementById('drop-input').value = 'Getting address...';
                    if (window.mapFunctions) {
                        window.mapFunctions.reverseGeocode(lat, lng, 'drop');
                        window.mapFunctions.addMarker(lat, lng, 'drop');
                    }
                }

                closeLocationSearch();
                checkIfReadyToShowVehicles();

                // Draw route if both locations are set
                if (pickupLocation && dropLocation && window.mapFunctions) {
                    window.mapFunctions.drawRoute(pickupLocation, dropLocation);
                }
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Unable to get your location');
            }
        );
    } else {
        alert('Geolocation not supported');
    }
}

function selectSearchResult(index) {
    const container = document.getElementById('search-results');
    const resultElements = container.querySelectorAll('.search-result-item');
    const resultElement = resultElements[index + 1]; // +1 because first is "Current Location"

    if (!resultElement) return;

    const name = resultElement.querySelector('h4').textContent;
    const address = resultElement.querySelector('p').textContent;
    const lat = parseFloat(resultElement.dataset.lat);
    const lng = parseFloat(resultElement.dataset.lng);

    const location = { lat, lng, address };

    if (searchType === 'pickup') {
        pickupLocation = location;
        document.getElementById('pickup-input').value = name;
        if (window.mapFunctions) {
            window.mapFunctions.addMarker(lat, lng, 'pickup');
        }
    } else {
        dropLocation = location;
        document.getElementById('drop-input').value = name;
        if (window.mapFunctions) {
            window.mapFunctions.addMarker(lat, lng, 'drop');
        }
    }

    closeLocationSearch();
    checkIfReadyToShowVehicles();

    // Draw route if both locations are set
    if (pickupLocation && dropLocation && window.mapFunctions) {
        window.mapFunctions.drawRoute(pickupLocation, dropLocation);
    }
}

function clearLocation(type) {
    if (type === 'pickup') {
        pickupLocation = null;
        document.getElementById('pickup-input').value = '';
    } else {
        dropLocation = null;
        document.getElementById('drop-input').value = '';
    }
    hideVehicleSheet();
}

function selectSavedPlace(type) {
    alert(`Saved place feature coming soon: ${type}`);
}

function checkIfReadyToShowVehicles() {
    if (pickupLocation && dropLocation) {
        showVehicleSheet();
    }
}

// ==================== VEHICLE SELECTION ====================
function showVehicleSheet() {
    document.getElementById('location-sheet').style.display = 'none';
    document.getElementById('vehicle-sheet').style.display = 'block';

    // Fares are already calculated by maps.js drawRoute function
    // If not, use default calculation
    if (!document.querySelector('[data-type="bike"] .price-amount').textContent ||
        document.querySelector('[data-type="bike"] .price-amount').textContent === '45') {
        const distance = Math.random() * 10 + 2; // 2-12 km
        document.querySelector('[data-type="bike"] .price-amount').textContent = Math.round(distance * 8);
        document.querySelector('[data-type="auto"] .price-amount').textContent = Math.round(distance * 12);
        document.querySelector('[data-type="car"] .price-amount').textContent = Math.round(distance * 18);
    }
}

function hideVehicleSheet() {
    document.getElementById('vehicle-sheet').style.display = 'none';
    document.getElementById('location-sheet').style.display = 'block';
}

function selectVehicle(type) {
    // Remove previous selection
    document.querySelectorAll('.vehicle-option').forEach(opt => {
        opt.classList.remove('selected');
    });

    // Add selection
    document.querySelector(`[data-type="${type}"]`).classList.add('selected');
    selectedVehicleType = type;
}

// ==================== BOOKING ====================
async function confirmBooking() {
    if (!selectedVehicleType) {
        alert('Please select a vehicle type');
        return;
    }

    // Reset search retry counter for new booking
    searchRetryCount = 0;
    if (retrySearchTimer) {
        clearTimeout(retrySearchTimer);
        retrySearchTimer = null;
    }

    const fareAmount = document.querySelector(`[data-type="${selectedVehicleType}"] .price-amount`).textContent;

    try {
        const res = await fetch(`${API_URL}/trips`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                vehicleType: selectedVehicleType,
                pickup: {
                    address: pickupLocation.address,
                    lat: pickupLocation.lat,
                    lng: pickupLocation.lng
                },
                drop: {
                    address: dropLocation.address,
                    lat: dropLocation.lat,
                    lng: dropLocation.lng
                },
                fare: parseInt(fareAmount)
            })
        });

        const data = await res.json();

        if (data.success) {
            currentTrip = data.data;
            showSearchingSheet();

            // Ensure rider is in correct socket room
            if (socket && socket.connected && user && user._id) {
                socket.emit('join', `rider:${user._id}`);
                console.log(`Rider re-joined room before ride request: rider:${user._id}`);
            }

            // Emit socket event to find drivers
            if (socket) {
                socket.emit('ride:request', {
                    tripId: currentTrip._id,
                    vehicleType: selectedVehicleType,
                    pickup: {
                        lat: pickupLocation.lat,
                        lng: pickupLocation.lng,
                        address: pickupLocation.address
                    },
                    drop: {
                        lat: dropLocation.lat,
                        lng: dropLocation.lng,
                        address: dropLocation.address
                    },
                    fare: parseInt(fareAmount),
                    rider: {
                        name: user.name,
                        rating: 4.5 // Mock rating
                    }
                });
            }

            // Listen for driver assignment
            socket.on('trip:driver_assigned', (update) => {
                console.log('Driver assigned event received:', update);
                handleDriverAssigned(update);
            });

        } else {
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
        alert('Error creating trip');
    }
}

function showSearchingSheet() {
    document.getElementById('vehicle-sheet').style.display = 'none';
    document.getElementById('searching-sheet').style.display = 'block';
}

function cancelSearch() {
    document.getElementById('searching-sheet').style.display = 'none';
    document.getElementById('vehicle-sheet').style.display = 'block';
}

function handleDriverAssigned(data) {
    console.log('Handling driver assignment:', data);

    // Update UI with driver information
    document.getElementById('driver-name').textContent = data.driver?.name || 'Driver';
    document.getElementById('driver-rating').textContent = data.driver?.rating || '5.0';
    document.getElementById('vehicle-model').textContent = data.driver?.vehicleModel || 'Vehicle';
    document.getElementById('vehicle-number').textContent = data.driver?.vehicleNumber || 'N/A';
    document.getElementById('driver-eta').textContent = '3 mins';
    document.getElementById('trip-otp').textContent = data.otp || '0000';

    // Show driver sheet
    document.getElementById('searching-sheet').style.display = 'none';
    document.getElementById('driver-sheet').style.display = 'block';
    document.getElementById('otp-section').style.display = 'block';

    // Add driver marker on map if available
    if (window.mapFunctions && data.driver?.location) {
        window.mapFunctions.addMarker(
            data.driver.location.lat,
            data.driver.location.lng,
            'driver'
        );
    }
}

function updateDriverLocation(data) {
    // Update driver location on map
    console.log('Driver location updated:', data);
    if (window.mapFunctions && data.lat && data.lng) {
        window.mapFunctions.updateDriverMarker(data.lat, data.lng);
    }
}

function updateTripStatus(data) {
    console.log('Trip status updated:', data);
    const statusTextEl = document.getElementById('trip-status-text');
    const driverEtaEl = document.getElementById('driver-eta');

    if (statusTextEl) {
        switch (data.status) {
            case 'driver_assigned':
                statusTextEl.textContent = 'Driver is on the way';
                if (driverEtaEl) driverEtaEl.textContent = '5 mins';
                break;
            case 'driver_arrived':
                statusTextEl.textContent = 'Driver has arrived';
                if (driverEtaEl) driverEtaEl.textContent = 'At pickup';
                showNotification('Your driver has arrived!', 'success');
                // Hide OTP section since driver has arrived
                const otpSection = document.getElementById('otp-section');
                if (otpSection) otpSection.style.display = 'block';
                break;
            case 'trip_started':
                statusTextEl.textContent = 'Trip in progress';
                if (driverEtaEl) driverEtaEl.style.display = 'none';
                // Hide OTP section when trip starts
                const otpSectionStarted = document.getElementById('otp-section');
                if (otpSectionStarted) otpSectionStarted.style.display = 'none';
                break;
            case 'trip_completed':
                statusTextEl.textContent = 'Trip completed';
                // Hide driver sheet and show rating modal after short delay
                document.getElementById('driver-sheet').style.display = 'none';
                document.getElementById('location-sheet').style.display = 'block';
                showNotification('Trip completed! Please rate your ride.', 'success');
                setTimeout(() => {
                    if (data.tripId || currentTrip?._id) {
                        showRatingModal(data.tripId || currentTrip._id);
                    }
                }, 1000);
                currentTrip = null;
                break;
            case 'cancelled':
                statusTextEl.textContent = 'Trip cancelled';
                document.getElementById('driver-sheet').style.display = 'none';
                document.getElementById('location-sheet').style.display = 'block';
                showNotification('Trip was cancelled', 'warning');
                currentTrip = null;
                break;
            default:
                statusTextEl.textContent = data.status || 'Unknown';
        }
    }
}

function callDriver() {
    alert('Calling driver...');
}

function chatDriver() {
    alert('Chat feature coming soon');
}

function cancelTrip() {
    if (confirm('Are you sure you want to cancel this trip?')) {
        // Emit cancellation to backend
        if (socket && currentTrip) {
            socket.emit('ride:cancel', {
                tripId: currentTrip._id
            });
        }

        // Reset UI
        document.getElementById('driver-sheet').style.display = 'none';
        document.getElementById('searching-sheet').style.display = 'none';
        document.getElementById('location-sheet').style.display = 'block';
        currentTrip = null;
    }
}

function handleTripCancelled(data) {
    console.log('Handling trip cancellation:', data);

    // Show notification with reason
    const reason = data.reason || 'Trip was cancelled';
    showNotification(reason, 'warning');

    // Reset UI - hide all trip-related sheets
    const driverSheet = document.getElementById('driver-sheet');
    const searchingSheet = document.getElementById('searching-sheet');
    const locationSheet = document.getElementById('location-sheet');

    if (driverSheet) driverSheet.style.display = 'none';
    if (searchingSheet) searchingSheet.style.display = 'none';
    if (locationSheet) locationSheet.style.display = 'block';

    // Clear current trip
    currentTrip = null;
}

let retrySearchTimer = null;
const MAX_SEARCH_RETRIES = 6; // 60 seconds total (10s x 6)
let searchRetryCount = 0;

function handleNoDrivers(data) {
    console.log('No drivers available:', data);

    searchRetryCount++;

    if (searchRetryCount < MAX_SEARCH_RETRIES) {
        // Show message and retry
        showNotification(`Looking for drivers... Retry ${searchRetryCount}/${MAX_SEARCH_RETRIES}`, 'info');

        // Retry after 10 seconds
        retrySearchTimer = setTimeout(() => {
            if (currentTrip && socket) {
                console.log('Retrying driver search...');
                socket.emit('ride:request', {
                    tripId: currentTrip._id,
                    vehicleType: selectedVehicleType,
                    pickup: {
                        lat: pickupLocation.lat,
                        lng: pickupLocation.lng,
                        address: pickupLocation.address
                    },
                    drop: {
                        lat: dropLocation.lat,
                        lng: dropLocation.lng,
                        address: dropLocation.address
                    },
                    fare: currentTrip.fare?.amount || 0,
                    rider: {
                        name: user?.name || 'Rider',
                        rating: 4.5
                    }
                });
            }
        }, 10000);
    } else {
        // Max retries reached
        showNotification('No drivers available in your area. Please try again later.', 'error');

        // Reset search retry count
        searchRetryCount = 0;

        // Cancel the trip
        if (socket && currentTrip) {
            socket.emit('ride:cancel', {
                tripId: currentTrip._id,
                reason: 'No drivers available'
            });
        }

        // Reset UI
        document.getElementById('searching-sheet').style.display = 'none';
        document.getElementById('location-sheet').style.display = 'block';
        currentTrip = null;
    }
}

// ==================== UTILITIES ====================
function showNotification(message, type = 'info') {
    if (window.Toast) {
        Toast.show(message, type);
    } else {
        alert(message);
    }
}

// ==================== TRIP HISTORY ====================
let currentRatingTripId = null;

async function showTripHistory() {
    const modal = document.getElementById('trip-history-modal');
    const content = document.getElementById('trip-history-content');

    modal.style.display = 'flex';
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading trips...</p></div>';

    try {
        const response = await API.get(`${API_URL}/trips`);
        tripHistory = response.data || [];

        if (tripHistory.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-history"></i></div>
                    <h3>No trips yet</h3>
                    <p>Your trip history will appear here</p>
                </div>
            `;
        } else {
            content.innerHTML = tripHistory.map(trip => `
                <div class="trip-item" onclick="viewTripDetails('${trip._id}')">
                    <div class="trip-icon">
                        <i class="fas fa-${trip.vehicleType === 'bike' ? 'motorcycle' : trip.vehicleType === 'auto' ? 'taxi' : 'car'}"></i>
                    </div>
                    <div class="trip-info">
                        <div class="trip-route">
                            <p class="trip-pickup">${trip.pickup.address || 'Pickup location'}</p>
                            <p class="trip-drop">${trip.drop.address || 'Drop location'}</p>
                        </div>
                        <div class="trip-meta">
                            <span class="trip-date">${window.utils.formatDateTime(trip.createdAt)}</span>
                            <span class="trip-status status-${trip.status}">${trip.status.replace('_', ' ')}</span>
                        </div>
                    </div>
                    <div class="trip-fare">
                        <span>₹${trip.fare.amount || 0}</span>
                        ${trip.status === 'trip_completed' && !trip.rated ?
                    '<button class="btn-rate" onclick="event.stopPropagation(); showRatingModal(\'' + trip._id + '\')">Rate</button>' :
                    ''}
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        content.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <h3>Error loading trips</h3>
                <p>${error.message}</p>
                <button class="btn-primary" onclick="showTripHistory()">Retry</button>
            </div>
        `;
    }
}

function closeTripHistory() {
    document.getElementById('trip-history-modal').style.display = 'none';
}

function viewTripDetails(tripId) {
    const trip = tripHistory.find(t => t._id === tripId);
    if (trip) {
        alert(`Trip Details:\nFrom: ${trip.pickup.address}\nTo: ${trip.drop.address}\nFare: ₹${trip.fare.amount}\nStatus: ${trip.status}`);
    }
}

// ==================== PROFILE ====================
async function showProfile() {
    const modal = document.getElementById('profile-modal');
    const content = document.getElementById('profile-content');

    modal.style.display = 'flex';
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading profile...</p></div>';

    try {
        const response = await API.get(`${API_URL}/auth/me`);
        user = response.data;

        content.innerHTML = `
            <div class="profile-section">
                <div class="profile-header">
                    <div class="profile-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <h3>${user.name || 'User'}</h3>
                    <p>${user.phone || ''}</p>
                    ${user.email ? `<p>${user.email}</p>` : ''}
                </div>
                <div class="profile-form">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="profile-name" value="${user.name || ''}" placeholder="Enter your name">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="profile-email" value="${user.email || ''}" placeholder="Enter your email">
                    </div>
                    <button class="btn-primary" onclick="updateProfile()">Save Changes</button>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <h3>Error loading profile</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function closeProfile() {
    document.getElementById('profile-modal').style.display = 'none';
}

async function updateProfile() {
    const name = document.getElementById('profile-name').value;
    const email = document.getElementById('profile-email').value;

    try {
        LoadingSpinner.show();
        await API.put(`${API_URL}/auth/profile`, { name, email });
        Toast.success('Profile updated successfully');
        closeProfile();
        await showProfile(); // Refresh
    } catch (error) {
        Toast.error(error.message || 'Failed to update profile');
    } finally {
        LoadingSpinner.hide();
    }
}

// ==================== WALLET ====================
async function showWallet() {
    const modal = document.getElementById('wallet-modal');
    const content = document.getElementById('wallet-content');

    modal.style.display = 'flex';
    content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading wallet...</p></div>';

    try {
        const [balanceResponse, transactionsResponse] = await Promise.all([
            API.get(`${API_URL}/payments/wallet`),
            API.get(`${API_URL}/payments/transactions?limit=10`)
        ]);

        const balance = balanceResponse.data.balance || 0;
        const transactions = transactionsResponse.data || [];

        content.innerHTML = `
            <div class="wallet-section">
                <div class="wallet-balance">
                    <p>Wallet Balance</p>
                    <h2>₹${balance.toFixed(2)}</h2>
                    <button class="btn-primary" onclick="showTopUp()">Add Money</button>
                </div>
                <div class="transactions-section">
                    <h3>Recent Transactions</h3>
                    ${transactions.length === 0 ?
                '<div class="empty-state"><p>No transactions yet</p></div>' :
                transactions.map(t => `
                            <div class="transaction-item">
                                <div class="transaction-info">
                                    <p class="transaction-type">${t.category.replace('_', ' ')}</p>
                                    <p class="transaction-date">${window.utils.formatDateTime(t.createdAt)}</p>
                                </div>
                                <div class="transaction-amount ${t.type}">
                                    ${t.type === 'credit' ? '+' : '-'}₹${t.amount.toFixed(2)}
                                </div>
                            </div>
                        `).join('')
            }
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <h3>Error loading wallet</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function closeWallet() {
    document.getElementById('wallet-modal').style.display = 'none';
}

function showTopUp() {
    const amount = prompt('Enter amount to add:');
    if (amount && parseFloat(amount) > 0) {
        Toast.info('Payment integration coming soon');
    }
}

// ==================== SAVED ADDRESSES ====================
async function showSavedAddresses() {
    Toast.info('Saved addresses feature coming soon');
}

// ==================== RATING ====================
function showRatingModal(tripId) {
    currentRatingTripId = tripId;
    const modal = document.getElementById('rating-modal');
    modal.style.display = 'flex';

    // Reset stars
    document.querySelectorAll('#star-rating i').forEach(star => {
        star.className = 'far fa-star';
    });
    document.getElementById('rating-review').value = '';

    // Add star hover/click handlers
    let selectedRating = 0;
    document.querySelectorAll('#star-rating i').forEach((star, index) => {
        star.addEventListener('mouseenter', () => {
            highlightStars(index + 1);
        });
        star.addEventListener('click', () => {
            selectedRating = index + 1;
            highlightStars(selectedRating);
        });
    });

    document.getElementById('star-rating').addEventListener('mouseleave', () => {
        highlightStars(selectedRating);
    });
}

function highlightStars(count) {
    document.querySelectorAll('#star-rating i').forEach((star, index) => {
        if (index < count) {
            star.className = 'fas fa-star';
        } else {
            star.className = 'far fa-star';
        }
    });
}

function closeRatingModal() {
    document.getElementById('rating-modal').style.display = 'none';
    currentRatingTripId = null;
}

async function submitRating() {
    if (!currentRatingTripId) return;

    const stars = document.querySelectorAll('#star-rating .fas.fa-star');
    const rating = stars.length;
    const review = document.getElementById('rating-review').value;

    if (rating === 0) {
        Toast.warning('Please select a rating');
        return;
    }

    try {
        LoadingSpinner.show();
        await API.post(`${API_URL}/ratings`, {
            tripId: currentRatingTripId,
            rating,
            review,
            ratingBy: 'rider'
        });
        Toast.success('Thank you for your feedback!');
        closeRatingModal();
        showTripHistory(); // Refresh trip history
    } catch (error) {
        Toast.error(error.message || 'Failed to submit rating');
    } finally {
        LoadingSpinner.hide();
    }
}

// ==================== NOTIFICATIONS ====================
async function showNotifications() {
    const modal = document.getElementById('notifications-modal');
    const content = document.getElementById('notifications-content');

    modal.style.display = 'flex';
    content.innerHTML = '<div class="empty-state"><p>No notifications yet</p></div>';
}

function closeNotifications() {
    document.getElementById('notifications-modal').style.display = 'none';
}

// ==================== HELP & SUPPORT ====================
function showHelp() {
    const modal = document.getElementById('help-modal');
    const content = document.getElementById('help-content');

    modal.style.display = 'flex';
    content.innerHTML = `
        <div class="help-section">
            <h3>Frequently Asked Questions</h3>
            <div class="faq-item">
                <h4>How do I book a ride?</h4>
                <p>Enter your pickup and drop locations, select a vehicle type, and confirm your booking.</p>
            </div>
            <div class="faq-item">
                <h4>How do I pay?</h4>
                <p>You can pay using wallet, UPI, card, or cash. Payment options are available after trip completion.</p>
            </div>
            <div class="faq-item">
                <h4>Can I cancel a trip?</h4>
                <p>Yes, you can cancel a trip. Cancellation fees may apply based on the trip status.</p>
            </div>
            <div class="help-contact">
                <h3>Contact Support</h3>
                <p>Email: support@rapidride.com</p>
                <p>Phone: +91 1800-XXX-XXXX</p>
            </div>
        </div>
    `;
}

function closeHelp() {
    document.getElementById('help-modal').style.display = 'none';
}

// ==================== SETTINGS ====================
function showSettings() {
    const modal = document.getElementById('settings-modal');
    const content = document.getElementById('settings-content');

    modal.style.display = 'flex';
    content.innerHTML = `
        <div class="settings-section">
            <div class="settings-item">
                <span>Notifications</span>
                <label class="switch">
                    <input type="checkbox" checked>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="settings-item">
                <span>Location Services</span>
                <label class="switch">
                    <input type="checkbox" checked>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="settings-item">
                <span>Dark Mode</span>
                <label class="switch">
                    <input type="checkbox">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="settings-item">
                <button class="btn-danger" onclick="logout()">Logout</button>
            </div>
        </div>
    `;
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

// Export function for maps.js to call
window.checkIfReadyToShowVehicles = checkIfReadyToShowVehicles;
