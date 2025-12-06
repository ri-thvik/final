// ==================== LOCATIONIQ MAPS CONFIGURATION ====================
const LOCATIONIQ_API_KEY = 'pk.5fd6f4e76edfaa6ed1b0dbe59489ceb1';
let map;
let markers = {
    pickup: null,
    drop: null,
    driver: null,
    currentLocation: null
};
let routeLayer = null;

// ==================== MAP INITIALIZATION ====================
function initMap() {
    // Initialize Leaflet map
    map = L.map('map').setView([12.9716, 77.5946], 13);

    // Add LocationIQ tile layer
    L.tileLayer(`https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${LOCATIONIQ_API_KEY}`, {
        attribution: '&copy; <a href="https://locationiq.com">LocationIQ</a>',
        maxZoom: 18,
        subdomains: ['a', 'b', 'c']
    }).addTo(map);

    // Get current location and center map
    getCurrentLocationOnMap();

    // Fix for map rendering issues when container is initially hidden
    setTimeout(() => {
        map.invalidateSize();
    }, 200);

    // Allow direct map click to set pickup/drop (first click sets pickup, second sets drop, subsequent clicks update drop)
    map.on('click', async (e) => {
        // Block map clicks if a trip/booking is in progress
        const searchingSheet = document.getElementById('searching-sheet');
        const driverSheet = document.getElementById('driver-sheet');

        if ((searchingSheet && searchingSheet.style.display !== 'none') ||
            (driverSheet && driverSheet.style.display !== 'none') ||
            window.currentTrip) {
            console.log('Map click blocked - trip in progress');
            return;
        }

        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        // If no pickup set, set pickup
        if (!window.pickupLocation || !window.pickupLocation.lat) {
            window.pickupLocation = { lat, lng, address: 'Pickup' };
            addMarker(lat, lng, 'pickup');
            reverseGeocode(lat, lng, 'pickup');
            return;
        }

        // Otherwise set/update drop
        window.dropLocation = { lat, lng, address: 'Drop' };
        addMarker(lat, lng, 'drop');
        reverseGeocode(lat, lng, 'drop');

        // If both exist, draw route and show vehicle selection
        if (window.pickupLocation && window.dropLocation) {
            await drawRoute(window.pickupLocation, window.dropLocation);

            // Trigger vehicle selection in rider.js
            if (typeof window.checkIfReadyToShowVehicles === 'function') {
                window.checkIfReadyToShowVehicles();
            } else {
                // Fallback: directly show vehicle sheet
                const locationSheet = document.getElementById('location-sheet');
                const vehicleSheet = document.getElementById('vehicle-sheet');
                if (locationSheet && vehicleSheet) {
                    locationSheet.style.display = 'none';
                    vehicleSheet.style.display = 'block';
                }
            }
        }
    });
}

// ==================== LOCATION FUNCTIONS ====================
function getCurrentLocationOnMap() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                map.setView([lat, lng], 15);

                // Add current location marker
                if (markers.currentLocation) {
                    map.removeLayer(markers.currentLocation);
                }

                markers.currentLocation = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'current-location-marker',
                        html: '<div class="pulse-marker"><i class="fas fa-circle"></i></div>',
                        iconSize: [20, 20]
                    })
                }).addTo(map);

                // Set pickup location
                pickupLocation = { lat, lng, address: 'Current Location' };
                document.getElementById('pickup-input').value = 'Current Location';

                // Reverse geocode to get address
                reverseGeocode(lat, lng, 'pickup');
            },
            (error) => {
                console.error('Error getting location:', error);
                // Default to Bangalore
                map.setView([12.9716, 77.5946], 13);
            }
        );
    }
}

async function reverseGeocode(lat, lng, type) {
    try {
        const response = await fetch(
            `https://us1.locationiq.com/v1/reverse.php?key=${LOCATIONIQ_API_KEY}&lat=${lat}&lon=${lng}&format=json`
        );
        const data = await response.json();

        const address = data.display_name || 'Unknown location';

        if (type === 'pickup') {
            pickupLocation = { lat, lng, address };
            document.getElementById('pickup-input').value = address;
        } else if (type === 'drop') {
            dropLocation = { lat, lng, address };
            document.getElementById('drop-input').value = address;
        }
    } catch (error) {
        console.error('Reverse geocoding error:', error);
    }
}

async function searchLocationIQ(query) {
    try {
        const response = await fetch(
            `https://us1.locationiq.com/v1/autocomplete.php?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`
        );
        const data = await response.json();

        // Check if response is valid and is an array
        if (!response.ok || !Array.isArray(data)) {
            console.error('Search error: Invalid response', data);
            return [];
        }

        return data.map(item => ({
            name: item.display_name.split(',')[0],
            address: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon)
        }));
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

function addMarker(lat, lng, type) {
    // Remove existing marker of this type
    if (markers[type]) {
        map.removeLayer(markers[type]);
    }

    let iconHtml, className;

    if (type === 'pickup') {
        iconHtml = '<div class="map-marker pickup-marker"><i class="fas fa-circle"></i></div>';
        className = 'pickup-marker-icon';
    } else if (type === 'drop') {
        iconHtml = '<div class="map-marker drop-marker"><i class="fas fa-map-marker-alt"></i></div>';
        className = 'drop-marker-icon';
    } else if (type === 'driver') {
        iconHtml = '<div class="map-marker driver-marker"><i class="fas fa-car"></i></div>';
        className = 'driver-marker-icon';
    }

    markers[type] = L.marker([lat, lng], {
        icon: L.divIcon({
            className: className,
            html: iconHtml,
            iconSize: [30, 30]
        })
    }).addTo(map);
}

async function drawRoute(pickup, drop) {
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
                color: '#00D9FF',
                weight: 4,
                opacity: 0.8
            }).addTo(map);

            // Fit map to show entire route
            const bounds = L.latLngBounds([
                [pickup.lat, pickup.lng],
                [drop.lat, drop.lng]
            ]);
            map.fitBounds(bounds, { padding: [50, 50] });

            // Calculate fare based on distance
            const distanceKm = route.distance / 1000;
            calculateFare(distanceKm);

            return route;
        }
    } catch (error) {
        console.error('Routing error:', error);
    }
}

function decodePolyline(encoded) {
    // Decode polyline algorithm
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

function calculateFare(distanceKm) {
    const baseFares = {
        bike: 20,
        auto: 30,
        car: 50
    };

    const perKmRates = {
        bike: 8,
        auto: 12,
        car: 18
    };

    Object.keys(baseFares).forEach(type => {
        const fare = Math.round(baseFares[type] + (distanceKm * perKmRates[type]));
        const element = document.querySelector(`[data-type="${type}"] .price-amount`);
        if (element) {
            element.textContent = fare;
        }
    });
}

function updateDriverMarker(lat, lng) {
    if (markers.driver) {
        // Smooth animation to new position
        const currentLatLng = markers.driver.getLatLng();
        const newLatLng = L.latLng(lat, lng);

        // Animate marker movement
        let start = null;
        const duration = 1000; // 1 second

        function animate(timestamp) {
            if (!start) start = timestamp;
            const progress = Math.min((timestamp - start) / duration, 1);

            const currentLat = currentLatLng.lat + (newLatLng.lat - currentLatLng.lat) * progress;
            const currentLng = currentLatLng.lng + (newLatLng.lng - currentLatLng.lng) * progress;

            markers.driver.setLatLng([currentLat, currentLng]);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }

        requestAnimationFrame(animate);
    } else {
        addMarker(lat, lng, 'driver');
    }
}

// ==================== EXPORT FOR RIDER.JS ====================
window.mapFunctions = {
    initMap,
    getCurrentLocationOnMap,
    searchLocationIQ,
    addMarker,
    drawRoute,
    updateDriverMarker,
    reverseGeocode
};
