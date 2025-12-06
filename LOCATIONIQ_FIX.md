const LOCATIONIQ_API_KEY = 'pk.0f147952a41c555a5b70614039fd148b'; // New free tier key

// Initialize map
function initMap() {
    if (map) return;

    try {
        map = L.map('map').setView([12.9716, 77.5946], 13);

        // Try LocationIQ first, fallback to OpenStreetMap
        L.tileLayer(`https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${LOCATIONIQ_API_KEY}`, {
            attribution: '© LocationIQ',
            maxZoom: 18,
            subdomains: ['a', 'b', 'c']
        }).addTo(map).on('tileerror', function() {
            console.warn('LocationIQ tiles failed, using OpenStreetMap');
            this.remove();
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
                maxZoom: 19
            }).addTo(map);
        });

        setTimeout(() => {
            map.invalidateSize();
        }, 200);
    } catch (err) {
        console.error('Map initialization error:', err);
    }
}

async function searchLocationIQ(query) {
    // Mock data for Bangalore locations
    const mockLocations = [
        { name: 'Koramangala', address: 'Koramangala, Bangalore, Karnataka', lat: 12.9352, lng: 77.6245 },
        { name: 'Indiranagar', address: 'Indiranagar, Bangalore, Karnataka', lat: 12.9716, lng: 77.6412 },
        { name: 'Whitefield', address: 'Whitefield, Bangalore, Karnataka', lat: 12.9698, lng: 77.7499 },
        { name: 'MG Road', address: 'MG Road, Bangalore, Karnataka', lat: 12.9759, lng: 77.6061 },
        { name: 'Electronic City', address: 'Electronic City, Bangalore', lat: 12.8456, lng: 77.6603 },
        { name: 'HSR Layout', address: 'HSR Layout, Bangalore', lat: 12.9121, lng: 77.6446 },
        { name: 'Jayanagar', address: 'Jayanagar, Bangalore', lat: 12.9250, lng: 77.5838 },
        { name: 'BTM Layout', address: 'BTM Layout, Bangalore', lat: 12.9165, lng: 77.6101 }
    ];

    try {
        const response = await fetch(
            `https://us1.locationiq.com/v1/autocomplete.php?key=${LOCATIONIQ_API_KEY}&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`,
            { timeout: 3000 }
        );
        
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                return data.map(item => ({
                    name: item.display_name.split(',')[0],
                    address: item.display_name,
                    lat: parseFloat(item.lat),
                    lng: parseFloat(item.lon)
                }));
            }
        }
    } catch (error) {
        console.warn('LocationIQ API unavailable, using mock data');
    }

    // Fallback to mock data
    return mockLocations.filter(loc => 
        loc.name.toLowerCase().includes(query.toLowerCase()) ||
        loc.address.toLowerCase().includes(query.toLowerCase())
    );
}
