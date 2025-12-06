const API_URL = 'http://localhost:5000/api';
let socket;
let token = localStorage.getItem('token');
let user = null;

// Initialize Socket
if (token) {
    initSocket();
}

function initSocket() {
    socket = io('http://localhost:5000');
    socket.on('connect', () => {
        console.log('Connected to socket server');
    });
}

// Auth Functions
async function login() {
    const phone = document.getElementById('phone').value;
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
            alert(data.message);
        }
    } catch (err) {
        console.error(err);
    }
}

async function register() {
    const phone = document.getElementById('phone').value;
    const name = document.getElementById('name').value;
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
    }
}

function handleLoginSuccess(data) {
    token = data.token;
    localStorage.setItem('token', token);
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('map-section').style.display = 'block';
    initSocket();
}

// Rider Functions
async function bookRide() {
    const pickup = document.getElementById('pickup').value;
    const drop = document.getElementById('drop').value;
    const vehicleType = document.getElementById('vehicle-type').value;

    // Mock coordinates for now
    const pickupCoords = { lat: 12.9716, lng: 77.5946 };
    const dropCoords = { lat: 12.9352, lng: 77.6245 };

    try {
        const res = await fetch(`${API_URL}/trips`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                vehicleType,
                pickup: { address: pickup, ...pickupCoords },
                drop: { address: drop, ...dropCoords },
                fare: 100 // Mock fare
            })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('trip-status').style.display = 'block';
            document.getElementById('status-text').innerText = 'Searching for driver...';
        }
    } catch (err) {
        console.error(err);
    }
}

// Driver Functions (Simplified in same file for demo, but separated in HTML)
async function driverLogin() {
    const phone = document.getElementById('phone').value;
    // ... similar login logic ...
    // For demo purposes, assume success and show dashboard
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = 'block';
    initSocket();
}

function toggleStatus() {
    const btn = document.getElementById('status-btn');
    const statusText = document.getElementById('status-text');
    if (btn.innerText === 'Go Online') {
        btn.innerText = 'Go Offline';
        statusText.innerText = 'Online';
        // Emit location updates
        setInterval(() => {
            if (socket) {
                socket.emit('location:update', {
                    driverId: 'driver_id_placeholder', // Need actual ID
                    lat: 12.9716,
                    lng: 77.5946,
                    bearing: 0
                });
            }
        }, 3000);
    } else {
        btn.innerText = 'Go Online';
        statusText.innerText = 'Offline';
    }
}
