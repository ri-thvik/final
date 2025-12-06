// ==================== CONFIGURATION ====================
const API_URL = 'http://localhost:5000/api';
const LOCATIONIQ_API_KEY = 'pk.5fd6f4e76edfaa6ed1b0dbe59489ceb1';
let socket;
let token = localStorage.getItem('driverToken');
let driver = null;
let driverOnline = false;
let currentRequest = null;
let currentTrip = null;
let acceptTimer = null;
let tripState = 'idle'; // idle, going_to_pickup, waiting_for_rider, in_trip
let locationInterval = null;
let map = null;
let driverMarker = null;

// Stats - load from localStorage if available
let todayEarnings = parseInt(localStorage.getItem('driver_todayEarnings')) || 0;
let todayTrips = parseInt(localStorage.getItem('driver_todayTrips')) || 0;
let onlineHours = parseFloat(localStorage.getItem('driver_onlineHours')) || 0;

// Save stats to localStorage whenever they change
function saveStats() {
    localStorage.setItem('driver_todayEarnings', todayEarnings);
    localStorage.setItem('driver_todayTrips', todayTrips);
    localStorage.setItem('driver_onlineHours', onlineHours);
}

// Update dashboard stats UI with current values
function updateStats() {
    // Update earnings
    const liveEarnings = document.getElementById('live-earnings');
    if (liveEarnings) liveEarnings.textContent = todayEarnings;

    // Update trips
    const liveTrips = document.getElementById('live-trips');
    if (liveTrips) liveTrips.textContent = todayTrips;

    // Update online hours
    const liveHours = document.getElementById('live-hours');
    if (liveHours) liveHours.textContent = onlineHours.toFixed(1) + 'h';

    // Update rating from driver profile
    const liveRating = document.getElementById('live-rating');
    if (liveRating && driver && driver.rating) {
        liveRating.textContent = driver.rating.toFixed(1);
    }

    // Update target remaining (assuming daily target is ₹500)
    const dailyTarget = 500;
    const remaining = Math.max(0, dailyTarget - todayEarnings);
    const targetRemaining = document.getElementById('target-remaining');
    if (targetRemaining) targetRemaining.textContent = remaining.toFixed(2);

    // Update progress bar
    const progressFill = document.querySelector('.earnings-card .progress-fill');
    if (progressFill) {
        const progress = Math.min(100, (todayEarnings / dailyTarget) * 100);
        progressFill.style.width = progress + '%';
    }

    // Update menu driver info
    const menuDriverName = document.getElementById('menu-driver-name');
    const menuDriverPhone = document.getElementById('menu-driver-phone');
    const menuDriverRating = document.getElementById('menu-driver-rating');
    if (menuDriverName && driver) menuDriverName.textContent = driver.name || 'Driver';
    if (menuDriverPhone && driver) menuDriverPhone.textContent = driver.phone || '';
    if (menuDriverRating && driver) menuDriverRating.textContent = driver.rating?.toFixed(1) || '4.8';
}

// ==================== UTILITIES ====================
function showNotification(message, type = 'info') {
    if (window.Toast) {
        Toast.show(message, type);
    } else {
        // Fallback - just log to console instead of alert
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    // Ensure both screens start hidden
    const authScreen = document.getElementById('auth-screen');
    const mainScreen = document.getElementById('main-screen');
    authScreen.classList.remove('active');
    mainScreen.classList.remove('active');
    authScreen.style.display = 'none';
    mainScreen.style.display = 'none';

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
    const authScreen = document.getElementById('auth-screen');
    const mainScreen = document.getElementById('main-screen');
    const regScreen = document.getElementById('registration-screen');
    setRegistrationVisibility(false);
    authScreen.classList.add('active');
    mainScreen.classList.remove('active');
    regScreen?.classList.remove('active');
    authScreen.style.display = 'block';
    mainScreen.style.display = 'none';
}

function showMainScreen() {
    const authScreen = document.getElementById('auth-screen');
    const mainScreen = document.getElementById('main-screen');
    const regScreen = document.getElementById('registration-screen');
    setRegistrationVisibility(false);
    authScreen.classList.remove('active');
    mainScreen.classList.add('active');
    regScreen?.classList.remove('active');
    authScreen.style.display = 'none';
    mainScreen.style.display = 'block';
    initSocket();
    updateStats();

    // Initialize map after screen is visible
    setTimeout(() => {
        initDriverMap();
    }, 100);
}

async function verifyToken() {
    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.success) {
            // Now fetch driver profile
            const driverRes = await fetch(`${API_URL}/drivers/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const driverData = await driverRes.json();

            if (driverData.success) {
                driver = driverData.data;

                // Restore driver's online status from database
                if (driver.status === 'online') {
                    driverOnline = true;
                    updateOnlineStatus();
                    // Show online sheet and start location tracking
                    setTimeout(() => {
                        showOnlineSheet();
                        startLocationTracking();
                    }, 500);
                } else {
                    driverOnline = false;
                    updateOnlineStatus();
                    showOfflineSheet();
                }

                updateDriverInfo();
                showMainScreen();
            } else {
                // User is logged in but not a driver
                console.warn('User is not a driver or profile missing');
                localStorage.removeItem('driverToken');
                showAuthScreen();
            }
        } else {
            localStorage.removeItem('driverToken');
            showAuthScreen();
        }
    } catch (err) {
        console.error(err);
        localStorage.removeItem('driverToken');
        showAuthScreen();
    }
}

async function handleLogin() {
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('auth-email')?.value.trim();

    if ((!phone || phone.length < 10) && !email) {
        alert('Please enter a valid phone number or email');
        return;
    }

    // Login flow only (registration handled via dedicated screen)
    console.log('Attempting login with phone/email:', phone || email);
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phone || undefined, email: email || undefined })
        });
        console.log('Login response status:', res.status);
        const data = await res.json();
        console.log('Login response data:', data);

        if (data.success) {
            token = data.token;
            localStorage.setItem('driverToken', token);

            // Fetch driver profile
            console.log('Fetching driver profile...');
            const driverRes = await fetch(`${API_URL}/drivers/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const driverData = await driverRes.json();
            console.log('Driver profile response:', driverData);

            if (driverData.success) {
                driver = driverData.data;
                updateDriverInfo();
                showMainScreen();
            } else {
                alert(driverData.message || 'Driver profile not found. Please register as a driver.');
                console.error('Driver profile not found:', driverData);
                startRegistrationWithScroll();
            }
        } else {
            // User not found - suggest registration
            alert(data.message || 'User not found. Please register.');
            startRegistrationWithScroll();
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Error connecting to server: ' + err.message);
    }
}

// ==================== REGISTRATION FUNCTIONS ====================
let currentStep = 1;
let registrationData = {};

function startRegistrationWithScroll() {
    startRegistration();
    scrollRegistrationToTop();
}

function startRegistration() {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-screen').classList.remove('active');
    document.getElementById('main-screen').style.display = 'none';
    document.getElementById('registration-screen').classList.add('active');
    document.getElementById('registration-screen').style.display = 'block';
    setRegistrationVisibility(true);
    currentStep = 1;
    registrationData = {};
    updateProgressSteps();
    scrollRegistrationToTop();
}

function cancelRegistration() {
    if (confirm('Are you sure you want to cancel registration? All entered data will be lost.')) {
        document.getElementById('registration-screen').classList.remove('active');
        document.getElementById('registration-screen').style.display = 'none';
        document.getElementById('auth-screen').classList.add('active');
        document.getElementById('auth-screen').style.display = 'block';
        currentStep = 1;
        registrationData = {};
        resetRegistrationForm();
        scrollRegistrationToTop();
        setRegistrationVisibility(false);
    }
}

function nextStep(step) {
    if (!validateStep(currentStep)) {
        return;
    }

    saveStepData(currentStep);
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    currentStep = step;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    document.querySelector(`[data-step="${step - 1}"]`).classList.add('completed');
    document.querySelector(`[data-step="${step - 1}"]`).classList.remove('active');
    document.querySelector(`[data-step="${step}"]`).classList.add('active');
    updateProgressSteps();
    scrollRegistrationToTop();
}

function prevStep(step) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    currentStep = step;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    document.querySelector(`[data-step="${step + 1}"]`).classList.remove('completed');
    document.querySelector(`[data-step="${step + 1}"]`).classList.remove('active');
    document.querySelector(`[data-step="${step}"]`).classList.add('active');
    updateProgressSteps();
    scrollRegistrationToTop();
}

function scrollRegistrationToTop() {
    const regScreen = document.getElementById('registration-screen');
    if (regScreen) {
        regScreen.scrollTo({ top: 0, behavior: 'smooth' });
        regScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function setRegistrationVisibility(isActive) {
    const body = document.body;
    const regScreen = document.getElementById('registration-screen');
    if (isActive) {
        body.classList.add('registration-active');
        if (regScreen) {
            regScreen.classList.add('active');
            regScreen.style.display = 'block';
        }
    } else {
        body.classList.remove('registration-active');
        if (regScreen) {
            regScreen.classList.remove('active');
            regScreen.style.display = 'none';
        }
    }
}

function updateProgressSteps() {
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');
        if (stepNum < currentStep) {
            step.classList.add('completed');
        } else if (stepNum === currentStep) {
            step.classList.add('active');
        }
    });
}

function validateStep(step) {
    if (step === 1) {
        const name = document.getElementById('reg-name').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        if (!name) { alert('Please enter your full name'); return false; }
        if (!phone || phone.length < 10) { alert('Please enter a valid phone number'); return false; }
        return true;
    } else if (step === 2) {
        const vehicleType = document.getElementById('reg-vehicle-type').value;
        const vehicleNumber = document.getElementById('reg-vehicle-number').value.trim();
        const vehicleModel = document.getElementById('reg-vehicle-model').value.trim();
        const vehicleColor = document.getElementById('reg-vehicle-color').value.trim();
        if (!vehicleType) { alert('Please select vehicle type'); return false; }
        if (!vehicleNumber) { alert('Please enter vehicle number'); return false; }
        if (!vehicleModel) { alert('Please enter vehicle model'); return false; }
        if (!vehicleColor) { alert('Please enter vehicle color'); return false; }
        return true;
    }
    return true;
}

function saveStepData(step) {
    if (step === 1) {
        registrationData.name = document.getElementById('reg-name').value.trim();
        registrationData.phone = document.getElementById('reg-phone').value.trim();
        registrationData.email = document.getElementById('reg-email').value.trim();
    } else if (step === 2) {
        registrationData.vehicleType = document.getElementById('reg-vehicle-type').value;
        registrationData.vehicleNumber = document.getElementById('reg-vehicle-number').value.trim().toUpperCase().replace(/\s/g, '');
        registrationData.vehicleModel = document.getElementById('reg-vehicle-model').value.trim();
        registrationData.vehicleColor = document.getElementById('reg-vehicle-color').value.trim();
    }
}

function resetRegistrationForm() {
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-phone').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-vehicle-type').value = '';
    document.getElementById('reg-vehicle-number').value = '';
    document.getElementById('reg-vehicle-model').value = '';
    document.getElementById('reg-vehicle-color').value = '';
    document.getElementById('terms-accept').checked = false;
    ['license', 'rc', 'insurance', 'aadhar', 'photo'].forEach(doc => {
        const input = document.getElementById(`doc-${doc}`);
        if (input) input.value = '';
        const preview = document.getElementById(`preview-${doc}`);
        if (preview) {
            preview.classList.remove('has-file');
            preview.innerHTML = '';
        }
    });
    document.querySelectorAll('.registration-step').forEach(step => step.classList.remove('active'));
    document.getElementById('step-1').classList.add('active');
    currentStep = 1;
    updateProgressSteps();
}

// Initialize file upload handlers
document.addEventListener('DOMContentLoaded', () => {
    ['license', 'rc', 'insurance', 'aadhar', 'photo'].forEach(doc => {
        const input = document.getElementById(`doc-${doc}`);
        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const preview = document.getElementById(`preview-${doc}`);
                    if (preview) {
                        preview.classList.add('has-file');
                        if (file.type.startsWith('image/')) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                preview.innerHTML = `<div class="file-name"><i class="fas fa-file-image"></i><span>${file.name}</span></div><img src="${e.target.result}" alt="${doc} preview">`;
                            };
                            reader.readAsDataURL(file);
                        } else {
                            preview.innerHTML = `<div class="file-name"><i class="fas fa-file-pdf"></i><span>${file.name}</span></div>`;
                        }
                        registrationData[`doc_${doc}`] = file;
                    }
                }
            });
        }
    });
});

async function submitRegistration() {
    if (!validateStep(3)) return;
    if (!document.getElementById('terms-accept').checked) {
        alert('Please accept the Terms & Conditions to continue');
        return;
    }

    saveStepData(2);
    const submitBtn = document.querySelector('#step-3 .btn-primary');
    const submitText = document.getElementById('submit-btn-text');
    const submitIcon = document.getElementById('submit-btn-icon');

    submitBtn.disabled = true;
    submitText.textContent = 'Registering...';
    submitIcon.className = 'fas fa-spinner fa-spin';

    try {
        // If user already logged in (came from login flow), skip creating user again
        if (!token) {
            const userRes = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: registrationData.phone,
                    name: registrationData.name,
                    email: registrationData.email || undefined,
                    role: 'driver'
                })
            });

            const userData = await userRes.json();
            if (!userData.success) {
                throw new Error(userData.message || 'Registration failed');
            }

            token = userData.token;
            localStorage.setItem('driverToken', token);
        } else {
            console.log('Using existing user session for driver onboarding');
        }

        const driverRes = await fetch(`${API_URL}/drivers/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                vehicleType: registrationData.vehicleType,
                vehicleNumber: registrationData.vehicleNumber,
                vehicleModel: registrationData.vehicleModel,
                vehicleColor: registrationData.vehicleColor
            })
        });

        const driverData = await driverRes.json();
        if (!driverData.success) {
            throw new Error(driverData.message || 'Driver onboarding failed');
        }

        driver = driverData.data;
        alert('Registration successful! Your account is pending verification.');
        updateDriverInfo();
        setRegistrationVisibility(false);
        showMainScreen();

    } catch (err) {
        console.error('Registration error:', err);
        alert('Registration failed: ' + err.message);
        submitBtn.disabled = false;
        submitText.textContent = 'Submit Registration';
        submitIcon.className = 'fas fa-check';
    }
}

function updateDriverInfo() {
    if (driver) {
        document.getElementById('menu-driver-name').textContent = driver.userId?.name || 'Driver';
        document.getElementById('menu-driver-phone').textContent = driver.userId?.phone || '+91 XXXXXXXXXX';
        document.getElementById('menu-driver-rating').textContent = driver.metrics?.avgRating || '5.0';
        const liveRatingEl = document.getElementById('live-rating');
        if (liveRatingEl) {
            liveRatingEl.textContent = driver.metrics?.avgRating || '5.0';
        }
    }
}

function logout() {
    if (driverOnline) {
        alert('Please go offline before logging out');
        return;
    }
    localStorage.removeItem('driverToken');
    token = null;
    driver = null;
    if (socket) socket.disconnect();
    location.reload();
}

// ==================== SOCKET.IO ====================
function initSocket() {
    socket = io('http://localhost:5000');

    socket.on('connect', () => {
        console.log('Connected to socket server');
        if (driver) {
            socket.emit('join', `driver:${driver._id}`);
        }
    });

    socket.on('ride:request', (data) => {
        handleRideRequest(data);
    });

    socket.on('ride:cancelled', (data) => {
        handleRideCancelled(data);
    });
}

// ==================== MENU ====================
function toggleMenu() {
    const menu = document.getElementById('side-menu');
    menu.classList.toggle('active');
}

// ==================== ONLINE/OFFLINE ====================
async function goOnline() {
    try {
        const res = await fetch(`${API_URL}/drivers/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                status: 'online',
                lat: 12.9716,
                lng: 77.5946
            })
        });

        const data = await res.json();

        if (data.success) {
            driverOnline = true;
            updateOnlineStatus();
            showOnlineSheet();
            startLocationTracking();

            // Ensure driver is in the correct socket room
            if (socket && socket.connected && driver) {
                socket.emit('join', `driver:${driver._id}`);
                console.log(`Driver joined room: driver:${driver._id}`);
            }

            console.log('Driver is now online and listening for real ride requests');
        }
    } catch (err) {
        console.error(err);
        alert('Error going online');
    }
}

async function goOffline() {
    if (currentTrip) {
        alert('Please complete current trip before going offline');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/drivers/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                status: 'offline'
            })
        });

        const data = await res.json();

        if (data.success) {
            driverOnline = false;
            updateOnlineStatus();
            showOfflineSheet();
            stopLocationTracking();

            // Re-join room to ensure we can receive requests when going online again
            if (socket && socket.connected && driver) {
                socket.emit('join', `driver:${driver._id}`);
                console.log(`Driver re-joined room after going offline: driver:${driver._id}`);
            }
        }
    } catch (err) {
        console.error(err);
        alert('Error going offline');
    }
}

function updateOnlineStatus() {
    const statusDot = document.querySelector('#status-indicator .status-dot');
    const statusText = document.getElementById('status-text');

    if (driverOnline) {
        statusDot.classList.remove('offline');
        statusDot.classList.add('online');
        statusText.textContent = 'Online';
    } else {
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
        statusText.textContent = 'Offline';
    }
}

function showOfflineSheet() {
    document.getElementById('offline-sheet').style.display = 'block';
    document.getElementById('online-sheet').style.display = 'none';
    document.getElementById('request-sheet').style.display = 'none';
    document.getElementById('trip-sheet').style.display = 'none';
}

function showOnlineSheet() {
    document.getElementById('offline-sheet').style.display = 'none';
    document.getElementById('online-sheet').style.display = 'block';
}

// ==================== LOCATION TRACKING ====================
function startLocationTracking() {
    if (navigator.geolocation) {
        locationInterval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;

                    // Update driver's own map marker
                    updateDriverMapLocation(lat, lng);

                    if (socket && driverOnline) {
                        socket.emit('location:update', {
                            driverId: driver._id,
                            lat: lat,
                            lng: lng,
                            bearing: position.coords.heading || 0,
                            speed: position.coords.speed || 0
                        });
                    }
                },
                (error) => {
                    console.error('Location error:', error);
                }
            );
        }, 3000);
    }
}

function stopLocationTracking() {
    if (locationInterval) {
        clearInterval(locationInterval);
        locationInterval = null;
    }
}

// ==================== STATS ====================
function updateStats() {
    document.getElementById('today-earnings').textContent = todayEarnings;
    document.getElementById('today-trips').textContent = todayTrips;
    document.getElementById('online-hours').textContent = onlineHours + 'h';

    document.getElementById('live-earnings').textContent = todayEarnings;
    document.getElementById('live-trips').textContent = todayTrips;
    document.getElementById('live-hours').textContent = onlineHours + 'h';

    // Update progress
    const target = 500;
    const remaining = Math.max(0, target - todayEarnings);
    const progress = Math.min(100, (todayEarnings / target) * 100);

    document.getElementById('target-remaining').textContent = remaining;
    document.querySelector('.progress-fill').style.width = progress + '%';
}

// ==================== RIDE REQUESTS ====================
function handleRideRequest(data) {
    // Ignore ride requests if driver is offline
    if (!driverOnline) {
        console.log('Ignoring ride request - driver is offline');
        return;
    }

    // Ignore if already handling a request or trip
    if (currentRequest || currentTrip) {
        console.log('Ignoring ride request - already busy');
        return;
    }

    currentRequest = data;

    document.getElementById('request-fare').textContent = data.fare || '0';
    document.getElementById('request-pickup').textContent = data.pickup?.address || 'Loading...';
    document.getElementById('request-drop').textContent = data.drop?.address || 'Loading...';
    document.getElementById('pickup-distance').textContent = '2.5 km';
    document.getElementById('trip-distance').textContent = '5.2 km';
    document.getElementById('rider-name').textContent = data.rider?.name || 'Rider';
    document.getElementById('rider-rating').textContent = data.rider?.rating || '4.5';

    document.getElementById('online-sheet').style.display = 'none';
    document.getElementById('request-sheet').style.display = 'block';

    // Start countdown timer
    let timeLeft = 8;
    document.getElementById('accept-timer').textContent = timeLeft;

    acceptTimer = setInterval(() => {
        timeLeft--;
        document.getElementById('accept-timer').textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(acceptTimer);
            rejectRequest();
        }
    }, 1000);
}

async function acceptRequest() {
    if (!currentRequest) return;

    clearInterval(acceptTimer);

    try {
        const res = await fetch(`${API_URL}/trips/${currentRequest._id}/accept`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await res.json();

        if (data.success) {
            currentTrip = data.data;
            tripState = 'going_to_pickup';

            // Emit socket event to notify rider
            if (socket) {
                socket.emit('ride:accept', {
                    tripId: currentTrip._id,
                    driverId: driver._id,
                    driver: {
                        name: driver.userId?.name || 'Driver',
                        rating: driver.metrics?.avgRating || 5.0,
                        vehicleModel: driver.vehicleModel,
                        vehicleNumber: driver.vehicleNumber
                    }
                });
            }

            showTripSheet();
        } else {
            alert(data.message);
            showOnlineSheet();
        }
    } catch (err) {
        console.error(err);
        alert('Error accepting request');
        showOnlineSheet();
    }

    currentRequest = null;
}

function rejectRequest() {
    clearInterval(acceptTimer);

    // Emit rejection to backend so another driver can be found
    if (socket && currentRequest) {
        socket.emit('ride:reject', {
            tripId: currentRequest._id,
            driverId: driver._id
        });
    }

    currentRequest = null;
    document.getElementById('request-sheet').style.display = 'none';
    showOnlineSheet();
}

function handleRideCancelled(data) {
    console.log('Ride cancelled:', data);

    // Handle cancellation during request phase
    if (currentRequest && currentRequest._id === data.tripId) {
        clearInterval(acceptTimer);
        currentRequest = null;
        document.getElementById('request-sheet').style.display = 'none';
        showOnlineSheet();
        showNotification('Ride request was cancelled by rider', 'warning');
    }

    // Handle cancellation during active trip
    if (currentTrip && currentTrip._id === data.tripId) {
        currentTrip = null;
        tripState = 'idle';
        document.getElementById('trip-sheet').style.display = 'none';
        document.getElementById('complete-sheet').style.display = 'none';
        showOnlineSheet();
        showNotification('Trip was cancelled by rider', 'warning');
    }
}

// ==================== TRIP SHEET ====================
function showTripSheet() {
    document.getElementById('request-sheet').style.display = 'none';
    document.getElementById('trip-sheet').style.display = 'block';

    // Update trip info
    if (currentTrip) {
        // Handle fare - it might be an object {amount: X} or just a number
        const fareValue = typeof currentTrip.fare === 'object' ? currentTrip.fare.amount : currentTrip.fare;
        const fareEl = document.getElementById('trip-fare');
        const pickupEl = document.getElementById('trip-pickup');
        const dropEl = document.getElementById('trip-drop');
        if (fareEl) fareEl.textContent = fareValue || '0';
        if (pickupEl) pickupEl.textContent = currentTrip.pickup?.address || 'Loading...';
        if (dropEl) dropEl.textContent = currentTrip.drop?.address || 'Loading...';

        // Handle rider info - might be populated or just an ID
        const riderName = currentTrip.riderId?.name || currentTrip.rider?.name || 'Rider';
        const riderRating = currentTrip.riderId?.rating || currentTrip.rider?.rating || '4.5';
        const riderNameEl = document.getElementById('trip-rider-name');
        const riderRatingEl = document.getElementById('trip-rider-rating');
        const otpEl = document.getElementById('trip-otp');
        if (riderNameEl) riderNameEl.textContent = riderName;
        if (riderRatingEl) riderRatingEl.textContent = riderRating;
        if (otpEl) otpEl.textContent = currentTrip.otp || '0000';

        // Update map with pickup/drop markers and route
        updateDriverMapForTrip();
    }

    updateTripActionButton();
}

function updateTripActionButton() {
    const statusLabel = document.getElementById('trip-status-label');
    const actionText = document.getElementById('trip-action-text');

    if (!actionText || !statusLabel) return;

    switch (tripState) {
        case 'going_to_pickup':
            statusLabel.textContent = 'Going to pickup';
            actionText.textContent = 'Arrived at Pickup';
            break;
        case 'waiting_for_rider':
            statusLabel.textContent = 'Waiting for rider';
            actionText.textContent = 'Start Trip';
            break;
        case 'in_trip':
            statusLabel.textContent = 'Trip in progress';
            actionText.textContent = 'Complete Trip';
            break;
    }
}

function handleTripAction() {
    switch (tripState) {
        case 'going_to_pickup':
            updateTripStatusFromDriver('driver_arrived', () => {
                tripState = 'waiting_for_rider';
                updateTripActionButton();
            });
            break;
        case 'waiting_for_rider':
            // Show OTP verification modal instead of directly starting trip
            showOtpModal();
            break;
        case 'in_trip':
            completeTrip();
            break;
    }
}

function completeTrip() {
    updateTripStatusFromDriver('trip_completed', () => {
        const fare = currentTrip?.fare?.amount || currentTrip?.fare || 0;
        const distance = currentTrip?.distance || (Math.random() * 10 + 2).toFixed(1);
        const duration = currentTrip?.duration || Math.floor(Math.random() * 30 + 10);

        document.getElementById('complete-fare').textContent = fare;
        document.getElementById('complete-distance').textContent = distance;
        document.getElementById('complete-duration').textContent = duration;

        document.getElementById('trip-sheet').style.display = 'none';
        document.getElementById('complete-sheet').style.display = 'block';

        // Update stats
        todayEarnings += fare;
        todayTrips++;
        updateStats();
        saveStats();

        tripState = 'idle';
    });
}

function finishTrip() {
    currentTrip = null;
    tripState = 'idle';
    document.getElementById('complete-sheet').style.display = 'none';
    clearDriverMapRoute();
    showOnlineSheet();
}

async function cancelTrip() {
    if (!confirm('Are you sure you want to cancel this trip?')) {
        return;
    }

    // Cancel trip logic here
    currentTrip = null;
    tripState = 'idle';
    document.getElementById('trip-sheet').style.display = 'none';
    showOnlineSheet();
}

function callRider() {
    alert('Calling rider...');
}

function chatRider() {
    alert('Chat feature coming soon');
}

// Helper to sync trip status to backend + rider via socket
async function updateTripStatusFromDriver(status, onSuccess) {
    if (!currentTrip || !currentTrip._id) {
        alert('No active trip');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/trips/${currentTrip._id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });

        const data = await res.json();
        if (!data.success) {
            alert(data.message || 'Failed to update trip status');
            return;
        }

        currentTrip = data.data;

        // Emit socket event so rider UI updates immediately
        if (socket) {
            socket.emit('trip:status_update', {
                tripId: currentTrip._id,
                status
            });
        }

        if (typeof onSuccess === 'function') {
            onSuccess();
        }
    } catch (err) {
        console.error('Update trip status error:', err);
        alert('Error updating trip status: ' + err.message);
    }
}


// ==================== MAP FUNCTIONS ====================
function initDriverMap() {
    if (map) return; // Already initialized

    try {
        // Initialize Leaflet map
        map = L.map('map').setView([12.9716, 77.5946], 13);

        // Add LocationIQ tile layer
        L.tileLayer(`https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${LOCATIONIQ_API_KEY}`, {
            attribution: '© LocationIQ',
            maxZoom: 18,
            subdomains: ['a', 'b', 'c']
        }).addTo(map);

        // Get current location and center map
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;

                    map.setView([lat, lng], 15);

                    // Add driver marker
                    driverMarker = L.marker([lat, lng], {
                        icon: L.divIcon({
                            className: 'driver-location-marker',
                            html: '<div class="pulse-marker"><i class="fas fa-car"></i></div>',
                            iconSize: [30, 30]
                        })
                    }).addTo(map);
                },
                (error) => {
                    console.error('Error getting location:', error);
                }
            );
        }

        // Fix for map rendering issues
        setTimeout(() => {
            map.invalidateSize();
        }, 200);
    } catch (err) {
        console.error('Map initialization error:', err);
    }
}

function updateDriverMapLocation(lat, lng) {
    if (map && driverMarker) {
        driverMarker.setLatLng([lat, lng]);
        map.setView([lat, lng], map.getZoom());
    }
}

// ==================== DRIVER MAP ROUTE & MARKERS ====================
let pickupMarker = null;
let dropMarker = null;
let routeLayer = null;

function addDriverMapMarker(lat, lng, type) {
    if (!map) return;

    let iconHtml, className;

    if (type === 'pickup') {
        if (pickupMarker) map.removeLayer(pickupMarker);
        iconHtml = '<div class="map-marker pickup-marker"><i class="fas fa-circle"></i></div>';
        className = 'pickup-marker-icon';
        pickupMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: className,
                html: iconHtml,
                iconSize: [30, 30]
            })
        }).addTo(map);
    } else if (type === 'drop') {
        if (dropMarker) map.removeLayer(dropMarker);
        iconHtml = '<div class="map-marker drop-marker"><i class="fas fa-map-marker-alt"></i></div>';
        className = 'drop-marker-icon';
        dropMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: className,
                html: iconHtml,
                iconSize: [30, 30]
            })
        }).addTo(map);
    }
}

async function drawDriverRoute(pickup, drop) {
    if (!map) return;

    try {
        // Remove existing route
        if (routeLayer) {
            map.removeLayer(routeLayer);
        }

        const response = await fetch(
            `https://us1.locationiq.com/v1/directions/driving/${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}?key=${LOCATIONIQ_API_KEY}&steps=true&alternatives=false&geometries=polyline&overview=full`
        );
        const data = await response.json();

        if (data.routes && data.routes[0]) {
            const route = data.routes[0];
            const coordinates = decodePolyline(route.geometry);

            routeLayer = L.polyline(coordinates, {
                color: '#00C853',
                weight: 4,
                opacity: 0.8
            }).addTo(map);

            // Fit map to show entire route
            const bounds = L.latLngBounds([
                [pickup.lat, pickup.lng],
                [drop.lat, drop.lng]
            ]);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    } catch (error) {
        console.error('Driver routing error:', error);
    }
}

function decodePolyline(encoded) {
    const points = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        points.push([lat / 1e5, lng / 1e5]);
    }

    return points;
}

function clearDriverMapRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    if (pickupMarker) {
        map.removeLayer(pickupMarker);
        pickupMarker = null;
    }
    if (dropMarker) {
        map.removeLayer(dropMarker);
        dropMarker = null;
    }
}

function updateDriverMapForTrip() {
    if (!currentTrip) return;

    // Get pickup and drop coordinates
    const pickup = {
        lat: currentTrip.pickup?.location?.coordinates?.[1] || currentTrip.pickup?.lat,
        lng: currentTrip.pickup?.location?.coordinates?.[0] || currentTrip.pickup?.lng
    };
    const drop = {
        lat: currentTrip.drop?.location?.coordinates?.[1] || currentTrip.drop?.lat,
        lng: currentTrip.drop?.location?.coordinates?.[0] || currentTrip.drop?.lng
    };

    if (pickup.lat && pickup.lng) {
        addDriverMapMarker(pickup.lat, pickup.lng, 'pickup');
    }
    if (drop.lat && drop.lng) {
        addDriverMapMarker(drop.lat, drop.lng, 'drop');
    }
    if (pickup.lat && pickup.lng && drop.lat && drop.lng) {
        drawDriverRoute(pickup, drop);
    }
}

// ==================== OTP VERIFICATION ====================
let otpAttempts = 0;
const MAX_OTP_ATTEMPTS = 3;

function showOtpModal() {
    otpAttempts = 0;
    document.getElementById('otp-modal').style.display = 'flex';
    document.getElementById('otp-attempts').style.display = 'none';

    // Clear all OTP inputs
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`otp-input-${i}`).value = '';
    }

    // Focus on first input
    document.getElementById('otp-input-1').focus();
}

function closeOtpModal() {
    document.getElementById('otp-modal').style.display = 'none';

    // Clear all OTP inputs
    for (let i = 1; i <= 4; i++) {
        document.getElementById(`otp-input-${i}`).value = '';
    }
}

function handleOtpInput(index) {
    const currentInput = document.getElementById(`otp-input-${index}`);
    const value = currentInput.value;

    // Only allow numbers
    currentInput.value = value.replace(/[^0-9]/g, '');

    // Move to next input if value entered
    if (currentInput.value && index < 4) {
        document.getElementById(`otp-input-${index + 1}`).focus();
    }
}

function verifyOtp() {
    // Collect OTP from inputs
    let enteredOtp = '';
    for (let i = 1; i <= 4; i++) {
        enteredOtp += document.getElementById(`otp-input-${i}`).value;
    }

    if (enteredOtp.length !== 4) {
        alert('Please enter complete 4-digit OTP');
        return;
    }

    // Get the stored OTP from currentTrip
    const correctOtp = currentTrip?.otp || '';

    if (enteredOtp === correctOtp) {
        // OTP verified successfully
        closeOtpModal();
        updateTripStatusFromDriver('trip_started', () => {
            tripState = 'in_trip';
            updateTripActionButton();
            showNotification('Trip started!', 'success');
        });
    } else {
        otpAttempts++;

        if (otpAttempts >= MAX_OTP_ATTEMPTS) {
            // Max attempts reached - cancel the ride
            closeOtpModal();
            alert('Maximum OTP attempts reached. Trip will be cancelled.');
            cancelTripDueToOtpFailure();
        } else {
            // Show remaining attempts
            const remainingAttempts = MAX_OTP_ATTEMPTS - otpAttempts;
            document.getElementById('otp-attempts').style.display = 'block';
            document.getElementById('otp-attempts-text').textContent =
                `Wrong OTP. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`;

            // Clear inputs
            for (let i = 1; i <= 4; i++) {
                document.getElementById(`otp-input-${i}`).value = '';
            }
            document.getElementById('otp-input-1').focus();
        }
    }
}

async function cancelTripDueToOtpFailure() {
    try {
        // Cancel the trip via API
        await fetch(`${API_URL}/trips/${currentTrip._id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: 'cancelled' })
        });

        // Emit socket event for cancellation
        if (socket) {
            socket.emit('ride:cancel', {
                tripId: currentTrip._id,
                reason: 'OTP verification failed'
            });
        }

        // Reset UI
        currentTrip = null;
        tripState = 'idle';
        document.getElementById('trip-sheet').style.display = 'none';
        showOnlineSheet();

        showNotification('Trip cancelled due to OTP verification failure', 'error');
    } catch (error) {
        console.error('Error cancelling trip:', error);
    }
}

// ==================== SIDE PAGE FUNCTIONS ====================
// Current filter tracking
let currentTripFilter = 'today';
let currentEarningsFilter = 'today';

// Filter trip history by date range
async function filterTripHistory(filter, buttonElement) {
    // Update active button
    document.querySelectorAll('.history-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');
    currentTripFilter = filter;

    // Load filtered data
    await loadTripHistoryData(filter);
}

async function loadTripHistoryData(filter = 'today') {
    const tripList = document.getElementById('trip-history-list');
    const noTripsMsg = document.getElementById('no-trips-msg');

    // Show loading state
    tripList.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading trips...</p></div>';

    try {
        // Calculate date range based on filter
        const now = new Date();
        let startDate = new Date();

        if (filter === 'today') {
            startDate.setHours(0, 0, 0, 0);
        } else if (filter === 'week') {
            startDate.setDate(now.getDate() - 7);
        } else if (filter === 'month') {
            startDate.setMonth(now.getMonth() - 1);
        }

        // Fetch trips from API
        const response = await fetch(`${API_URL}/trips`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch trips');

        const data = await response.json();
        let trips = data.data || [];

        // Filter trips by date range
        trips = trips.filter(trip => {
            const tripDate = new Date(trip.createdAt);
            return tripDate >= startDate;
        });

        if (!trips || trips.length === 0) {
            tripList.innerHTML = '';
            noTripsMsg.style.display = 'block';
            return;
        }

        noTripsMsg.style.display = 'none';
        tripList.innerHTML = trips.map(trip => {
            const date = new Date(trip.createdAt);
            const timeStr = date.toLocaleString('en-IN', {
                day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
            });
            const fare = trip.fare?.amount || trip.fare || 0;
            const distance = trip.distance ? `${trip.distance.toFixed(1)} km` : '--';
            const duration = trip.duration ? `${Math.round(trip.duration)} min` : '--';

            return `
                <div class="trip-history-card">
                    <div class="trip-card-header">
                        <span class="trip-time">${timeStr}</span>
                        <span class="trip-amount">₹${fare}</span>
                    </div>
                    <div class="trip-card-body">
                        <div class="trip-route">
                            <div class="route-point pickup">
                                <i class="fas fa-circle"></i>
                                <span>${trip.pickup?.address || 'Pickup location'}</span>
                            </div>
                            <div class="route-line"></div>
                            <div class="route-point drop">
                                <i class="fas fa-map-marker-alt"></i>
                                <span>${trip.drop?.address || 'Drop location'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="trip-card-footer">
                        <span><i class="fas fa-road"></i> ${distance}</span>
                        <span><i class="fas fa-clock"></i> ${duration}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error fetching trips:', error);
        tripList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-car"></i>
                <p>No trips found</p>
            </div>
        `;
    }
}

async function showTripHistory() {
    toggleMenu();
    document.getElementById('trip-history-modal').style.display = 'block';
    // Reset filter to today and load data
    currentTripFilter = 'today';
    document.querySelectorAll('.history-filters .filter-btn').forEach(btn => btn.classList.remove('active'));
    const todayBtn = document.querySelector('.history-filters .filter-btn[data-filter="today"]');
    if (todayBtn) todayBtn.classList.add('active');
    await loadTripHistoryData('today');
}

// Filter earnings by date range
async function filterEarnings(filter, buttonElement) {
    // Update active button
    document.querySelectorAll('.earnings-period .period-btn').forEach(btn => btn.classList.remove('active'));
    buttonElement.classList.add('active');
    currentEarningsFilter = filter;

    // Load filtered data
    await loadEarningsData(filter);
}

async function loadEarningsData(filter = 'today') {
    try {
        // Calculate date range
        const now = new Date();
        let startDate = new Date();

        if (filter === 'today') {
            startDate.setHours(0, 0, 0, 0);
        } else if (filter === 'week') {
            startDate.setDate(now.getDate() - 7);
        } else if (filter === 'month') {
            startDate.setMonth(now.getMonth() - 1);
        }

        // Fetch trips from API
        const response = await fetch(`${API_URL}/trips`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch trips');

        const data = await response.json();
        let trips = data.data || [];

        // Filter trips by date range
        console.log('Raw trips from API:', trips);
        console.log('Filtering with startDate:', startDate);

        trips = trips.filter(trip => {
            const tripDate = new Date(trip.createdAt);
            const isCompleted = trip.status === 'completed' || trip.status === 'trip_completed';
            const isDateMatch = tripDate >= startDate;
            console.log(`Trip ${trip._id}: status=${trip.status}, date=${tripDate}, match=${isCompleted && isDateMatch}`);
            return isCompleted && isDateMatch;
        });

        console.log('Filtered trips:', trips);

        // Calculate totals
        let totalEarnings = 0;
        let totalTrips = trips.length;
        let totalHours = 0;

        trips.forEach(trip => {
            totalEarnings += (trip.fare?.amount || trip.fare || 0);
            totalHours += (trip.duration || 0) / 60; // Convert minutes to hours
        });

        const avgFare = totalTrips > 0 ? Math.round(totalEarnings / totalTrips) : 0;

        // Update UI
        document.getElementById('modal-total-earnings').textContent = totalEarnings.toFixed(2);
        document.getElementById('modal-trip-earnings').textContent = totalEarnings.toFixed(2);
        document.getElementById('modal-trips-count').textContent = totalTrips;
        document.getElementById('modal-online-hours').textContent = totalHours.toFixed(1) + 'h';
        document.getElementById('modal-avg-fare').textContent = avgFare;

    } catch (error) {
        console.error('Error fetching earnings:', error);
        // Fall back to localStorage data
        const earnings = parseInt(localStorage.getItem('driver_todayEarnings')) || 0;
        const trips = parseInt(localStorage.getItem('driver_todayTrips')) || 0;
        const hours = parseFloat(localStorage.getItem('driver_onlineHours')) || 0;
        const avgFare = trips > 0 ? Math.round(earnings / trips) : 0;

        document.getElementById('modal-total-earnings').textContent = earnings;
        document.getElementById('modal-trip-earnings').textContent = earnings;
        document.getElementById('modal-trips-count').textContent = trips;
        document.getElementById('modal-online-hours').textContent = hours.toFixed(1) + 'h';
        document.getElementById('modal-avg-fare').textContent = avgFare;
    }
}

async function showEarnings() {
    toggleMenu();
    document.getElementById('earnings-modal').style.display = 'block';
    // Reset filter to today and load data
    currentEarningsFilter = 'today';
    document.querySelectorAll('.earnings-period .period-btn').forEach(btn => btn.classList.remove('active'));
    const todayBtn = document.querySelector('.earnings-period .period-btn[data-period="today"]');
    if (todayBtn) todayBtn.classList.add('active');
    await loadEarningsData('today');
}

function showPerformance() {
    toggleMenu();
    // Populate with real driver data
    const modalRating = document.getElementById('modal-rating');
    if (modalRating) {
        if (driver && driver.metrics && driver.metrics.avgRating) {
            modalRating.textContent = driver.metrics.avgRating.toFixed(1);
        } else if (driver && driver.rating) {
            modalRating.textContent = driver.rating.toFixed(1);
        } else {
            modalRating.textContent = '5.0';
        }
    }

    // Update performance metrics with real data if available
    if (driver && driver.metrics) {
        const acceptanceRate = driver.metrics.acceptanceRate || 92;
        const cancellationRate = driver.metrics.cancellationRate || 5;
        const onTimeRate = driver.metrics.onTimeRate || 88;

        // Update the metric bars
        const acceptanceFill = document.querySelector('.metric-card:nth-child(1) .metric-fill');
        const cancellationFill = document.querySelector('.metric-card:nth-child(2) .metric-fill');
        const onTimeFill = document.querySelector('.metric-card:nth-child(3) .metric-fill');

        if (acceptanceFill) acceptanceFill.style.width = acceptanceRate + '%';
        if (cancellationFill) cancellationFill.style.width = cancellationRate + '%';
        if (onTimeFill) onTimeFill.style.width = onTimeRate + '%';

        // Update values
        const acceptanceValue = document.querySelector('.metric-card:nth-child(1) .metric-value');
        const cancellationValue = document.querySelector('.metric-card:nth-child(2) .metric-value');
        const onTimeValue = document.querySelector('.metric-card:nth-child(3) .metric-value');

        if (acceptanceValue) acceptanceValue.textContent = acceptanceRate + '%';
        if (cancellationValue) cancellationValue.textContent = cancellationRate + '%';
        if (onTimeValue) onTimeValue.textContent = onTimeRate + '%';
    }

    document.getElementById('performance-modal').style.display = 'block';
}

function showSupport() {
    toggleMenu();
    document.getElementById('support-modal').style.display = 'block';
}

function showSettings() {
    toggleMenu();
    document.getElementById('settings-modal-page').style.display = 'block';
}

function closePageModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            modal.style.display = 'none';
            modal.style.animation = 'slideInRight 0.3s ease';
        }, 280);
    }
}
