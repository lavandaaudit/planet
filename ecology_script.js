const STATE = {
    map: null,
    layers: {},
    activeStates: {
        quakes: true, fires: false, air: false, temp: false, ozone: false, rad: false, wind: false
    },
    charts: {}
};

// --- Initialization ---
window.onload = () => {
    initMap();
    initMiniCharts();
    loadCycle();
    startClocks();
};

function startClocks() {
    setInterval(() => {
        const now = new Date();
        // UTC Time
        document.getElementById('utc-clock').innerText = now.toISOString().substr(11, 8) + ' UTC';
        
        // Date (e.g. 11 ЛИПНЯ 2025)
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        document.getElementById('date-display').innerText = now.toLocaleDateString('uk-UA', options).toUpperCase();
        
        // System update time
        document.getElementById('sys-time').innerText = now.toTimeString().substr(0, 8);
    }, 1000);
}

function initMap() {
    STATE.map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        center: [20, 0],
        zoom: 2.5,
        minZoom: 1,
        worldCopyJump: true
    });

    L.control.zoom({ position: 'bottomright' }).addTo(STATE.map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(STATE.map);
}

function createMiniChart(id, color, type = 'line') {
    const ctx = document.getElementById(id).getContext('2d');
    
    // Generate some random sparkline data
    const data = Array.from({length: 24}, () => Math.random() * 100);
    
    return new Chart(ctx, {
        type: type,
        data: {
            labels: Array.from({length: 24}, (_, i) => i),
            datasets: [{
                data: data,
                borderColor: color,
                backgroundColor: type === 'bar' ? color : color + '33',
                borderWidth: 2,
                pointRadius: 0,
                fill: type === 'line'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false, min: 0 }
            },
            layout: { padding: 0 }
        }
    });
}

function initMiniCharts() {
    STATE.charts.quakes = createMiniChart('chart-quakes', '#ff3333', 'bar');
    STATE.charts.fires = createMiniChart('chart-fires', '#ffaa00', 'bar');
    STATE.charts.aqi = createMiniChart('chart-aqi', '#39ff14', 'line');
    STATE.charts.solar = createMiniChart('chart-solar', '#ffff00', 'line');
    STATE.charts.temp = createMiniChart('chart-temp', '#ff3333', 'line');
    STATE.charts.co2 = createMiniChart('chart-co2', '#39ff14', 'line');
}

async function loadCycle() {
    await setupQuakes();
    setupFires();
    await setupAirQuality();
    setupSpaceWeather();
    
    // Additional layers
    setupRadiation();
    setupOzone();
    setupWind();
}

// --- Data Fetching & Setup ---

async function setupQuakes() {
    try {
        const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
        const data = await res.json();
        const quakes = data.features;
        
        document.getElementById('active-quakes').innerText = `${quakes.length} активних`;
        document.getElementById('ch-quakes-val').innerText = quakes.length;

        const markers = L.layerGroup();

        quakes.forEach(q => {
            const mag = q.properties.mag;
            const coords = [q.geometry.coordinates[1], q.geometry.coordinates[0]];
            
            let color = '#0072ff';
            if (mag >= 5) color = '#ffaa00';
            if (mag >= 6) color = '#ff3333';

            const marker = L.circleMarker(coords, {
                radius: mag * 1.5,
                fillColor: color,
                color: '#fff',
                weight: 0.5,
                opacity: 0.8,
                fillOpacity: 0.6
            }).bindPopup(`
                <div class="custom-popup">
                    <b style="color:${color}">SEISMIC EVENT</b>
                    <span>MAG: <b>${mag.toFixed(1)}</b></span>
                    <span>LOC: ${q.properties.place}</span>
                </div>
            `);
            markers.addLayer(marker);
        });

        STATE.layers.quakes = markers;
        STATE.map.addLayer(markers); // Active by default
    } catch (e) { console.error("Quakes err:", e); }
}

function setupFires() {
    // NASA GIBS WMS for Fires
    STATE.layers.fires = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
        layers: 'MODIS_Terra_Thermal_Anomalies_All',
        format: 'image/png', transparent: true, opacity: 0.8
    });
    // Mock value for dashboard
    const activeFiresMock = 3186;
    document.getElementById('active-fires').innerText = `${activeFiresMock} активних`;
    document.getElementById('ch-fires-val').innerText = activeFiresMock;
}

async function setupAirQuality() {
    try {
        // Fetch a few key cities for AQI
        const url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=50.45,28.70,39.90,34.05&longitude=30.52,77.10,116.40,-118.24&current=pm2_5';
        const res = await fetch(url);
        const data = await res.json();
        
        let total = 0; let count = 0;
        if(Array.isArray(data)) {
            data.forEach(d => { if(d.current && d.current.pm2_5) { total+=d.current.pm2_5; count++; }});
        }
        if(count > 0) {
            const avg = Math.round(total/count);
            document.getElementById('ch-aqi-val').innerText = avg;
        }
    } catch (e) {}
}

async function setupSpaceWeather() {
    try {
        // NOAA Space Weather JSON - Kp Index
        const resKp = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
        const dataKp = await resKp.json();
        // Last element is most recent (format: [time, Kp, ...])
        if (dataKp && dataKp.length > 1) {
            const latestKp = parseFloat(dataKp[dataKp.length-1][1]);
            document.getElementById('sw-kp').innerText = latestKp.toFixed(1);
        }
    } catch(e) { console.log("Space Weather err:", e); }
}

// Other mock layers
function setupRadiation() {
    STATE.layers.rad = L.tileLayer('https://s3.amazonaws.com/te512.safecast.org/{z}/{x}/{y}.png', { opacity: 0.6, zIndex: 10 });
}
function setupOzone() { /* ... */ }
function setupWind() { /* ... */ }

function toggleLayer(key) {
    if (!STATE.layers[key]) return;
    
    STATE.activeStates[key] = !STATE.activeStates[key];
    const btn = document.getElementById('btn-' + key);

    if (STATE.activeStates[key]) {
        STATE.map.addLayer(STATE.layers[key]);
        btn.classList.add('active');
    } else {
        STATE.map.removeLayer(STATE.layers[key]);
        btn.classList.remove('active');
    }
}
