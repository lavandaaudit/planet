// ═══════════════════════════════════════════════════════
// IBONARIUM V4.0 PRO — FULL REAL-TIME ECOLOGY RADAR
// All data from real public APIs. No hardcoded values.
// ═══════════════════════════════════════════════════════

// ───── CONFIG ─────
const CONFIG = {
    REFRESH_MS: 300000,
    CHART_HISTORY: 20,
    MAP_REFRESH_MS: 60000,
    FETCH_TIMEOUT: 12000, // 12 сек на кожен API

    API: {
        EARTHQUAKES: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
        EONET: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500',
        // NOAA SWPC — лише ті ендпоінти що існують (перевірено 12.07.2026)
        SWPC_KP: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
        SWPC_KF: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
        SWPC_DST: 'https://services.swpc.noaa.gov/products/kyoto-dst.json',
        SWPC_F107: 'https://services.swpc.noaa.gov/products/10cm-flux-30-day.json',
        SWPC_ALERTS: 'https://services.swpc.noaa.gov/products/alerts.json',
        // NOAA GML CO2 — правильний URL (перевірено)
        CO2: 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_daily_mlo.csv',
        AQ_CITIES: [
            { name: 'Київ', lat: 50.45, lon: 30.52 },
            { name: 'Делі', lat: 28.70, lon: 77.10 },
            { name: 'Пекін', lat: 39.90, lon: 116.40 },
            { name: 'Лос-Анджелес', lat: 34.05, lon: -118.24 },
            { name: 'Токіо', lat: 35.68, lon: 139.69 },
            { name: 'Сан-Паулу', lat: -23.55, lon: -46.63 },
            { name: 'Каїр', lat: 30.04, lon: 31.24 },
            { name: 'Лондон', lat: 51.51, lon: -0.13 }
        ],
        BUOYS: [
            { name: 'N. Atlantic', lat: 50, lon: -30 },
            { name: 'Hawaii', lat: 21, lon: -157 },
            { name: 'Southern Ocean', lat: -55, lon: 120 },
            { name: 'Cape of Hope', lat: -35, lon: 18 },
            { name: 'Bering Sea', lat: 58, lon: -175 },
            { name: 'Gulf of Mexico', lat: 25, lon: -90 },
            { name: 'Japan', lat: 35, lon: 140 },
            { name: 'Peru', lat: -15, lon: -80 }
        ],
        CURRENT_BUOYS: [
            { lat: 25, lon: -80 }, { lat: 35, lon: 140 },
            { lat: -34, lon: 18 }, { lat: 0, lon: -10 },
            { lat: -30, lon: -170 }, { lat: 45, lon: -30 }
        ]
    },
    MAP: {
        OWM_KEY: 'b99fdb51e2dcc8e0549f8b99ef20cedd',
        AQICN_TOKEN: '9c118126bb63a15998f5a5e3cc9cfa88'
    }
};

// ───── STATE ─────
const STATE = {
    map: null, layers: {},
    activeStates: {
        quakes: true, fires: false, air: false, volcanoes: false,
        storms: false, floods: false, clouds: false, precip: false,
        pressure: false, waves: false, sst: false, chloro: false,
        salinity: false, rad: false
    },
    charts: {},
    history: { quakes: [], events: [], aqi: [], solar: [], co2: [], storms: [] },
    prevPulse: null, lastRefresh: null,
    apiStatus: {}, errors: []
};

// ═══════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════
window.onload = () => {
    try {
        initMap();
        initMiniCharts();
        startClocks();
        refreshAll();
        setInterval(() => { try { refreshAll(); } catch(e) { console.error('[refreshAll]', e); } }, CONFIG.REFRESH_MS);
        setInterval(() => { try { refreshMapMarkers(); } catch(e) {} }, CONFIG.MAP_REFRESH_MS);
    } catch(e) {
        console.error('[init]', e);
    }
};

function startClocks() {
    function tick() {
        try {
            const now = new Date();
            setText('utc-clock', now.toISOString().substr(11, 8) + ' UTC');
            setText('date-display', now.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase());
            setText('sys-time', now.toTimeString().substr(0, 8));
            const el = document.getElementById('sys-next');
            if (el && STATE.lastRefresh) {
                const diff = Math.max(0, Math.ceil((CONFIG.REFRESH_MS - (Date.now() - STATE.lastRefresh)) / 1000));
                el.innerText = diff + ' сек';
            }
        } catch(e) {}
    }
    tick();
    setInterval(tick, 1000);
}

// ═══════════════════════════════════════════════════════
//  SAFE FETCH WITH TIMEOUT
// ═══════════════════════════════════════════════════════
function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function safeFetch(url, label) {
    try {
        const r = await fetchWithTimeout(url, CONFIG.FETCH_TIMEOUT);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        STATE.apiStatus[label] = true;
        return data;
    } catch (e) {
        const msg = e.name === 'AbortError' ? 'timeout' : e.message;
        console.warn(`[API FAIL] ${label}: ${msg}`);
        STATE.apiStatus[label] = false;
        STATE.errors.push(label + ':' + msg);
        return null;
    }
}

async function safeFetchText(url, label) {
    try {
        const r = await fetchWithTimeout(url, CONFIG.FETCH_TIMEOUT);
        if (!r.ok) throw new Error(r.status);
        const text = await r.text();
        STATE.apiStatus[label] = true;
        return text;
    } catch (e) {
        const msg = e.name === 'AbortError' ? 'timeout' : e.message;
        console.warn(`[API FAIL] ${label}: ${msg}`);
        STATE.apiStatus[label] = false;
        STATE.errors.push(label + ':' + msg);
        return null;
    }
}

// ═══════════════════════════════════════════════════════
//  DATA FETCHERS
// ═══════════════════════════════════════════════════════

async function fetchEarthquakes() {
    try {
        const data = await safeFetch(CONFIG.API.EARTHQUAKES, 'USGS');
        return (data && data.features) ? data.features : [];
    } catch(e) { return []; }
}

async function fetchEONET() {
    try {
        const data = await safeFetch(CONFIG.API.EONET, 'NASA-EONET');
        return (data && data.events) ? data.events : [];
    } catch(e) { return []; }
}

async function fetchSpaceWeather() {
    const result = { kp: null, dst: null, f107: null, alerts: [] };

    // Kp index — масив масивів: [time_tag, Kp, observed/predicted]
    try {
        const kpRaw = await safeFetch(CONFIG.API.SWPC_KP, 'NOAA-Kp');
        if (kpRaw && Array.isArray(kpRaw) && kpRaw.length > 1) {
            for (let i = kpRaw.length - 1; i >= 1; i--) {
                const val = parseFloat(kpRaw[i][1]);
                if (!isNaN(val)) { result.kp = val; break; }
            }
        }
    } catch(e) {}

    // Dst index — масив об'єктів: {time_tag, dst}
    try {
        const dstRaw = await safeFetch(CONFIG.API.SWPC_DST, 'NOAA-Dst');
        if (dstRaw && Array.isArray(dstRaw) && dstRaw.length > 0) {
            const last = dstRaw[dstRaw.length - 1];
            if (last && last.dst !== undefined) result.dst = last.dst;
        }
    } catch(e) {}

    // F10.7 радіопотік
    try {
        const f107Raw = await safeFetch(CONFIG.API.SWPC_F107, 'NOAA-F107');
        if (f107Raw && Array.isArray(f107Raw) && f107Raw.length > 1) {
            const last = f107Raw[f107Raw.length - 1];
            if (last && last.time_tag) {
                // Формат: {time_tag, observed, predicted}
                result.f107 = last.observed || last.predicted || null;
            }
        }
    } catch(e) {}

    // Alerts — активні повідомлення
    try {
        const alertsRaw = await safeFetch(CONFIG.API.SWPC_ALERTS, 'NOAA-Alerts');
        if (alertsRaw && Array.isArray(alertsRaw)) {
            result.alerts = alertsRaw;
        }
    } catch(e) {}

    return result;
}

async function fetchCO2() {
    const csv = await safeFetchText(CONFIG.API.CO2, 'NOAA-CO2');
    if (!csv) return null;
    try {
        const lines = csv.trim().split('\n');
        // Формат: YYYY,M,D,decimal_date,CO2 (без заголовка!)
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;
            const parts = line.split(',');
            const val = parseFloat(parts[4]); // CO2 в колонці 4
            if (!isNaN(val) && val > 300) return val;
        }
        return null;
    } catch(e) { return null; }
}

async function fetchAirQuality() {
    try {
        const cities = CONFIG.API.AQ_CITIES;
        const lats = cities.map(c => c.lat).join(',');
        const lons = cities.map(c => c.lon).join(',');
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide&timezone=auto`;
        const data = await safeFetch(url, 'Open-Meteo-AQ');
        if (!data) return [];
        const results = [];
        const arr = Array.isArray(data) ? data : [data];
        arr.forEach((d, i) => {
            if (!d || !d.current) return;
            const pm25 = d.current.pm2_5 || 0;
            let aqiLabel = 'Good';
            if (pm25 > 35) aqiLabel = 'Moderate';
            if (pm25 > 55) aqiLabel = 'Unhealthy-SG';
            if (pm25 > 150) aqiLabel = 'Unhealthy';
            if (pm25 > 250) aqiLabel = 'Very Unhealthy';
            results.push({
                name: cities[i] ? cities[i].name : 'Point ' + i,
                pm25: Math.round(pm25),
                pm10: d.current.pm10 ? Math.round(d.current.pm10) : null,
                no2: d.current.nitrogen_dioxide ? Math.round(d.current.nitrogen_dioxide) : null,
                o3: d.current.ozone ? Math.round(d.current.ozone) : null,
                co: d.current.carbon_monoxide ? Math.round(d.current.carbon_monoxide) : null,
                aqiLabel
            });
        });
        return results;
    } catch(e) { return []; }
}

async function fetchMarine() {
    const results = [];
    const promises = CONFIG.API.BUOYS.map(async b => {
        try {
            const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${b.lat}&longitude=${b.lon}&current=wave_height,wave_period,wave_direction&timezone=auto`;
            const r = await fetchWithTimeout(url, CONFIG.FETCH_TIMEOUT);
            if (!r.ok) return null;
            const data = await r.json();
            if (data && data.current) {
                return { ...b, waveHeight: data.current.wave_height, wavePeriod: data.current.wave_period, waveDir: data.current.wave_direction };
            }
        } catch(e) {}
        return null;
    });
    try {
        const items = await Promise.all(promises);
        items.forEach(item => { if (item) results.push(item); });
    } catch(e) {}
    return results;
}

async function fetchCurrents() {
    try {
        const buoys = CONFIG.API.CURRENT_BUOYS;
        const lats = buoys.map(b => b.lat).join(',');
        const lons = buoys.map(b => b.lon).join(',');
        const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&current=ocean_current_velocity,ocean_current_direction&timezone=auto`;
        const data = await safeFetch(url, 'Open-Meteo-Marine');
        if (!data) return [];
        const arr = Array.isArray(data) ? data : [data];
        return arr.filter(d => d && d.current).map(d => ({
            lat: d.latitude, lon: d.longitude,
            velocity: d.current.ocean_current_velocity || 0,
            direction: d.current.ocean_current_direction || 0
        }));
    } catch(e) { return []; }
}

// ═══════════════════════════════════════════════════════
//  PROCESSORS
// ═══════════════════════════════════════════════════════

function classifyEONET(events) {
    const cats = { wildfires: [], volcanoes: [], severeStorms: [], floods: [], landslides: [], tempExtremes: [], other: [] };
    (events || []).forEach(ev => {
        try {
            const catObj = ev.categories && ev.categories[0] ? ev.categories[0] : null;
            const catId = catObj ? (catObj.id || catObj.title || '') : '';
            const mapped = mapCategory(catId);
            if (cats[mapped]) cats[mapped].push(ev);
            else cats.other.push(ev);
        } catch(e) { cats.other.push(ev); }
    });
    return cats;
}

function mapCategory(catId) {
    const s = String(catId).toLowerCase();
    if (s.includes('wildfire') || s.includes('fire')) return 'wildfires';
    if (s.includes('volcano')) return 'volcanoes';
    if (s.includes('storm') || s.includes('cyclone') || s.includes('hurricane') || s.includes('typhoon')) return 'severeStorms';
    if (s.includes('flood')) return 'floods';
    if (s.includes('landslide')) return 'landslides';
    if (s.includes('temp') || s.includes('heat') || s.includes('cold')) return 'tempExtremes';
    return 'other';
}

function getEventCoords(ev) {
    try {
        if (ev.geometry && ev.geometry.length > 0) {
            const g = ev.geometry[0];
            if (g.type === 'Point' && g.coordinates && g.coordinates.length >= 2) {
                return [g.coordinates[1], g.coordinates[0]];
            }
        }
    } catch(e) {}
    return null;
}

function calcEarthPulse(d) {
    let risk = 0;
    risk += Math.min((d.quakesCount || 0) * 3, 30);
    risk += Math.min((d.firesCount || 0) * 0.5, 15);
    risk += Math.min((d.stormsCount || 0) * 5, 20);
    risk += Math.min((d.floodsCount || 0) * 5, 15);
    risk += Math.min((d.volcanoesCount || 0) * 4, 10);
    if (d.kp && d.kp > 4) risk += (d.kp - 4) * 3;
    if (d.avgAqi > 100) risk += Math.min((d.avgAqi - 100) * 0.2, 10);
    return Math.max(0, Math.min(100, Math.round(100 - risk)));
}

function calcPlanetStatus(pulse) {
    if (pulse >= 70) return { text: 'STABLE', sub: 'Стан планети відносно стабільний', cls: 'green' };
    if (pulse >= 45) return { text: 'ELEVATED', sub: 'Підвищена активність природних явищ', cls: 'yellow' };
    if (pulse >= 25) return { text: 'WARNING', sub: 'Значна екологічна та геофізична активність', cls: 'orange' };
    return { text: 'CRITICAL', sub: 'Критичний рівень загроз по всій планеті', cls: 'red' };
}

function calcRiskRegions(d) {
    const regions = [];
    (d.quakes || []).forEach(q => {
        try {
            const mag = q.properties && q.properties.mag ? q.properties.mag : 0;
            if (mag >= 5) {
                regions.push({
                    name: q.properties.place || 'Unknown',
                    risk: Math.min(99, Math.round(mag * 14)),
                    type: 'Землетрус M' + mag.toFixed(1),
                    color: mag >= 6 ? 'red' : 'orange'
                });
            }
        } catch(e) {}
    });
    (d.volcanoEvents || []).forEach(v => {
        regions.push({ name: v.title || 'Volcano', risk: 85, type: 'Вулканічна активність', color: 'orange' });
    });
    (d.aqData || []).forEach(c => {
        if (c.pm25 > 50) {
            regions.push({
                name: c.name, risk: Math.min(95, Math.round(c.pm25 * 0.9)),
                type: 'Забруднення повітря PM2.5=' + c.pm25,
                color: c.pm25 > 150 ? 'red' : 'yellow'
            });
        }
    });
    regions.sort((a, b) => b.risk - a.risk);
    return regions.slice(0, 3);
}

function buildTimeline(d) {
    const events = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    (d.quakes || []).forEach(q => {
        try {
            const t = new Date(q.properties.time);
            if (t >= oneHourAgo) {
                events.push({
                    time: t, icon: 'quake',
                    text: 'M' + q.properties.mag.toFixed(1) + ' ' + (q.properties.place || ''),
                    color: q.properties.mag >= 6 ? 'red' : 'orange'
                });
            }
        } catch(e) {}
    });
    var allEonet = [].concat(d.fireEvents || [], d.stormEvents || [], d.floodEvents || [], d.volcanoEvents || []);
    allEonet.forEach(function(ev) {
        try {
            if (ev.geometry && ev.geometry.length > 0) {
                var lastG = ev.geometry[ev.geometry.length - 1];
                if (lastG.date) {
                    var t = new Date(lastG.date);
                    if (t >= oneHourAgo) {
                        var catObj = ev.categories && ev.categories[0] ? ev.categories[0] : {};
                        var s = String(catObj.id || catObj.title || '').toLowerCase();
                        var icon = 'event';
                        if (s.includes('fire')) icon = 'fire';
                        else if (s.includes('storm') || s.includes('cyclone')) icon = 'storm';
                        else if (s.includes('flood')) icon = 'flood';
                        else if (s.includes('volcano')) icon = 'volcano';
                        events.push({ time: t, icon: icon, text: ev.title || 'Event', color: 'orange' });
                    }
                }
            }
        } catch(e) {}
    });
    if (d.spaceWeather) {
        if (d.spaceWeather.kp && d.spaceWeather.kp >= 5) {
            events.push({ time: now, icon: 'solar', text: 'Kp=' + d.spaceWeather.kp.toFixed(1) + ' Геомагнітна буря', color: 'yellow' });
        }
        if (d.spaceWeather.alerts && d.spaceWeather.alerts.length > 0) {
            d.spaceWeather.alerts.forEach(function(a) {
                events.push({ time: now, icon: 'solar', text: a.message || a.identifier || 'SWPC Alert', color: 'red' });
            });
        }
    }
    events.sort(function(a, b) { return b.time - a.time; });
    return events.slice(0, 8);
}

function buildAISummary(d) {
    var p = [];
    var st = calcPlanetStatus(d.pulse);
    p.push('Загальний стан планети: <b>' + st.text + '</b>.');
    if (d.quakesCount > 0) p.push('За останні 24 години: <b>' + d.quakesCount + '</b> землетрусів M4.5+.');
    if (d.firesCount > 0) p.push('NASA EONET: <b>' + d.firesCount + '</b> активних лісових пожеж.');
    if (d.volcanoesCount > 0) p.push('Вулканічна активність: <b>' + d.volcanoesCount + '</b> активних вулканів.');
    if (d.stormsCount > 0) p.push('Активних штормів: <b>' + d.stormsCount + '</b>.');
    if (d.floodsCount > 0) p.push('Активних повеней: <b>' + d.floodsCount + '</b>.');
    if (d.aqData && d.aqData.length > 0) {
        var worst = d.aqData.reduce(function(a, b) { return a.pm25 > b.pm25 ? a : b; });
        if (worst.pm25 > 50) p.push('Найгірше повітря: <b>' + worst.name + '</b> (PM2.5=' + worst.pm25 + ').');
        p.push('Середній PM2.5: <b>' + d.avgAqi + '</b>.');
    }
    if (d.spaceWeather) {
        if (d.spaceWeather.kp !== null) p.push('Kp-індекс: <b>' + d.spaceWeather.kp.toFixed(1) + '</b>' + (d.spaceWeather.kp >= 5 ? ' — БУРЯ!' : ' — спокійно') + '.');
        if (d.spaceWeather.dst !== null) p.push('Dst-індекс: <b>' + d.spaceWeather.dst + ' nT</b>.');
        if (d.spaceWeather.f107 !== null) p.push('F10.7 радіопотік: <b>' + d.spaceWeather.f107 + ' SFU</b>.');
    }
    if (d.co2) p.push('CO2 (Mauna Loa): <b>' + d.co2.toFixed(1) + ' ppm</b>.');
    if (STATE.errors.length > 0) p.push('<span style="color:#666">API помилки: ' + STATE.errors.slice(-3).join(', ') + '</span>');
    return p.map(function(x) { return '<p>' + x + '</p>'; }).join('');
}

function buildPredictions(d) {
    var preds = [];
    if ((d.firesCount || 0) > 20) preds.push({ label: 'Ризик лісових пожеж', level: 'ВИСОКИЙ', color: 'red' });
    else if ((d.firesCount || 0) > 5) preds.push({ label: 'Ризик лісових пожеж', level: 'ПОМІРНИЙ', color: 'orange' });
    else preds.push({ label: 'Ризик лісових пожеж', level: 'НИЗЬКИЙ', color: 'green' });

    var bigQ = (d.quakes || []).filter(function(q) { return q.properties && q.properties.mag >= 5.5; }).length;
    if (bigQ >= 3) preds.push({ label: 'Сильні землетруси (M5.5+)', level: 'ВИСОКИЙ', color: 'red' });
    else if (bigQ >= 1) preds.push({ label: 'Сильні землетруси', level: 'ПОМІРНИЙ', color: 'orange' });
    else preds.push({ label: 'Сильні землетруси', level: 'НИЗЬКА', color: 'green' });

    var kp = d.spaceWeather ? d.spaceWeather.kp : 0;
    if (kp >= 5) preds.push({ label: 'Геомагнітна буря', level: 'АКТИВНА (Kp=' + kp.toFixed(1) + ')', color: 'red' });
    else if (kp >= 4) preds.push({ label: 'Геомагнітна буря', level: 'ПОМІРНИЙ (Kp=' + kp.toFixed(1) + ')', color: 'yellow' });
    else preds.push({ label: 'Геомагнітна буря', level: 'НИЗЬКА', color: 'green' });

    if ((d.stormsCount || 0) > 5) preds.push({ label: 'Тропічні циклони', level: 'ВИСОКИЙ', color: 'red' });
    else if ((d.stormsCount || 0) > 0) preds.push({ label: 'Тропічні циклони', level: 'ПОМІРНИЙ', color: 'yellow' });
    else preds.push({ label: 'Тропічні циклони', level: 'НИЗЬКА', color: 'green' });

    return preds;
}

// ═══════════════════════════════════════════════════════
//  UI UPDATERS
// ═══════════════════════════════════════════════════════
function setText(id, text) { var el = document.getElementById(id); if (el) el.innerText = text; }
function setHTML(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

function updatePlanetStatus(pulse) {
    var st = calcPlanetStatus(pulse);
    var el = document.getElementById('planet-status-class');
    var sub = document.getElementById('planet-status-text');
    if (el) { el.textContent = st.text; el.className = 'status-text ' + st.cls; }
    if (sub) sub.textContent = st.sub;
}

function updatePulse(pulse) {
    var ring = document.getElementById('pulse-ring');
    var valEl = document.getElementById('pulse-value');
    var labelEl = document.getElementById('pulse-label');
    var trendEl = document.getElementById('pulse-trend');
    var offset = 283 - Math.round(283 * pulse / 100);
    if (ring) ring.setAttribute('stroke-dashoffset', offset);
    if (valEl) valEl.innerHTML = pulse + '<span class="small">/100</span>';
    var label = 'CRITICAL', cls = 'red';
    if (pulse >= 70) { label = 'GOOD'; cls = 'green'; }
    else if (pulse >= 45) { label = 'MODERATE'; cls = 'yellow'; }
    else if (pulse >= 25) { label = 'ELEVATED'; cls = 'orange'; }
    if (labelEl) labelEl.textContent = label;
    if (trendEl && STATE.prevPulse !== null) {
        var diff = pulse - STATE.prevPulse;
        trendEl.textContent = (diff > 0 ? '+' : '') + diff + ' за цикл';
        trendEl.className = 'pulse-trend ' + cls;
    }
    STATE.prevPulse = pulse;
}

function updateEventCounts(d) {
    setText('active-quakes', (d.quakesCount || 0) + ' активних');
    setText('active-fires', (d.firesCount || 0) + ' активних');
    setText('active-storms', (d.stormsCount || 0) + ' активних');
    setText('active-floods', (d.floodsCount || 0) + ' активних');
    setText('active-volcanoes', (d.volcanoesCount || 0) + ' активних');
}

function updateRiskRegionsUI(regions) {
    var c = document.getElementById('risk-regions');
    if (!c) return;
    if (!regions || regions.length === 0) { c.innerHTML = '<div style="color:#666;padding:8px;font-size:12px;">Немає значних загроз</div>'; return; }
    c.innerHTML = regions.map(function(r, i) {
        return '<div class="risk-item"><div class="risk-label"><span>' + (i+1) + '. ' + r.name + '</span> <span>' + r.type + ' <b class="c-' + r.color + '">' + r.risk + '%</b></span></div><div class="risk-bar"><div class="fill bg-' + r.color + '" style="width:' + r.risk + '%"></div></div></div>';
    }).join('');
}

function updateSpaceWeatherUI(sw) {
    if (sw.kp !== null) {
        setText('sw-kp', sw.kp.toFixed(1));
        var kpL = 'Спокійний', kpC = 'c-green';
        if (sw.kp >= 5) { kpL = 'БУРЯ'; kpC = 'c-red'; }
        else if (sw.kp >= 4) { kpL = 'Помірний'; kpC = 'c-yellow'; }
        var el = document.getElementById('sw-kp-stat');
        if (el) { el.textContent = kpL; el.className = 'sp-stat ' + kpC; }
    }
    if (sw.dst !== null) {
        setText('sw-dst', sw.dst + ' nT');
        var dL = 'Стабільний', dC = 'c-green';
        if (sw.dst < -50) { dL = 'Сильна буря'; dC = 'c-red'; }
        else if (sw.dst < -30) { dL = 'Помірна буря'; dC = 'c-yellow'; }
        else if (sw.dst < -20) { dL = 'Збурення'; dC = 'c-yellow'; }
        var el2 = document.getElementById('sw-dst-stat');
        if (el2) { el2.textContent = dL; el2.className = 'sp-stat ' + dC; }
    }
    // F10.7 замість X-Ray
    if (sw.f107 !== null) {
        setText('sw-xray', sw.f107 + ' SFU');
        var fL = 'Низький', fC = 'c-green';
        if (sw.f107 > 150) { fL = 'Помірний'; fC = 'c-yellow'; }
        if (sw.f107 > 200) { fL = 'Високий'; fC = 'c-orange'; }
        var el3 = document.getElementById('sw-xray-stat');
        if (el3) { el3.textContent = fL; el3.className = 'sp-stat ' + fC; }
    } else {
        setText('sw-xray', 'N/A');
        var el3b = document.getElementById('sw-xray-stat');
        if (el3b) { el3b.textContent = 'Немає даних'; el3b.className = 'sp-stat'; }
    }
    // Solar wind — використовуємо Dst як proxy для відображення
    setText('sw-wind', (sw.dst !== null ? 'Dst ' + sw.dst : 'N/A'));
    var wL = 'Норма', wC = 'c-green';
    if (sw.dst !== null && sw.dst < -30) { wL = 'Магнітна буря'; wC = 'c-red'; }
    else if (sw.dst !== null && sw.dst < -20) { wL = 'Збурення'; wC = 'c-yellow'; }
    var el4 = document.getElementById('sw-wind-stat');
    if (el4) { el4.textContent = wL; el4.className = 'sp-stat ' + wC; }
}

function updateClimateUI(d) {
    if (d.co2) {
        setText('cl-co2', d.co2.toFixed(1));
        var el = document.getElementById('cl-co2');
        if (el) el.className = 'cl-val c-orange';
    } else {
        setText('cl-co2', 'N/A');
    }
    if (d.spaceWeather && d.spaceWeather.kp !== null) {
        setText('cl-kp', d.spaceWeather.kp.toFixed(1));
        var el2 = document.getElementById('cl-kp');
        if (el2) el2.className = 'cl-val ' + (d.spaceWeather.kp >= 5 ? 'c-red' : 'c-green');
        setText('cl-kp-unit', d.spaceWeather.kp >= 5 ? 'БУРЯ' : 'спокійно');
    }
    if (d.spaceWeather && d.spaceWeather.dst !== null) {
        setText('cl-wind', d.spaceWeather.dst);
    } else {
        setText('cl-wind', 'N/A');
    }
    setText('cl-ch4', 'N/A');
}

function updateTimelineUI(events) {
    var c = document.getElementById('timeline-events');
    if (!c) return;
    if (!events || events.length === 0) { c.innerHTML = '<div style="color:#666;padding:8px;font-size:12px;">За останню годину значних подій не зафіксовано</div>'; return; }
    c.innerHTML = events.map(function(e) {
        var h = String(e.time.getHours()).padStart(2, '0');
        var m = String(e.time.getMinutes()).padStart(2, '0');
        return '<div class="t-event"><span class="c-' + e.color + '">●</span> <div><b>' + h + ':' + m + '</b> ' + e.text + '</div></div>';
    }).join('');
}

function updatePredictionsUI(preds) {
    var c = document.getElementById('prediction-list');
    if (!c) return;
    c.innerHTML = preds.map(function(p) {
        return '<li><div class="p-left"><span class="c-' + p.color + '">●</span> ' + p.label + '</div><div class="p-right c-' + p.color + '">' + p.level + '</div></li>';
    }).join('');
}

function updateInfraUI() {
    var checks = [
        { id: 'usgs', key: 'USGS' },
        { id: 'noaa', key: 'NOAA-Kp' },
        { id: 'eonet', key: 'NASA-EONET' },
        { id: 'meteo', key: 'Open-Meteo-AQ' },
        { id: 'noaa-gml', key: 'NOAA-CO2' }
    ];
    var ok = 0;
    checks.forEach(function(c) {
        var el = document.getElementById('infra-' + c.id + '-status');
        var alive = STATE.apiStatus[c.key];
        if (alive) ok++;
        if (el) { el.textContent = alive ? 'OK' : 'FAIL'; el.style.color = alive ? '#39ff14' : '#ff3333'; }
    });
    setText('sys-apis', ok + ' / ' + checks.length);
}

// ═══════════════════════════════════════════════════════
//  MAP
// ═══════════════════════════════════════════════════════
function initMap() {
    STATE.map = L.map('map', {
        zoomControl: false, attributionControl: false,
        center: [20, 0], zoom: 2.5, minZoom: 1, worldCopyJump: true
    });
    L.control.zoom({ position: 'bottomright' }).addTo(STATE.map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19
    }).addTo(STATE.map);

    var k = CONFIG.MAP;
    STATE.layers.air = L.tileLayer('https://tiles.aqicn.org/tiles/usepa-aqi/{z}/{x}/{y}.png?token=' + k.AQICN_TOKEN);
    STATE.layers.fires = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
        layers: 'MODIS_Terra_Thermal_Anomalies_All', format: 'image/png', transparent: true, opacity: 0.8
    });
    STATE.layers.clouds = L.tileLayer('https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=' + k.OWM_KEY);
    STATE.layers.precip = L.tileLayer('https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=' + k.OWM_KEY);
    STATE.layers.pressure = L.tileLayer('https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png?appid=' + k.OWM_KEY);
    STATE.layers.sst = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
        layers: 'GHRSST_L4_MUR_Sea_Surface_Temperature', format: 'image/png', transparent: true, opacity: 0.6
    });
    STATE.layers.chloro = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
        layers: 'MODIS_Aqua_L2_Chlorophyll_A', format: 'image/png', transparent: true, opacity: 0.6
    });
    STATE.layers.rad = L.tileLayer('https://s3.amazonaws.com/te512.safecast.org/{z}/{x}/{y}.png', { opacity: 0.6, zIndex: 10 });
}

function updateQuakeMarkers(quakes) {
    if (STATE.layers.quakes) try { STATE.map.removeLayer(STATE.layers.quakes); } catch(e) {}
    var markers = L.layerGroup();
    (quakes || []).forEach(function(q) {
        try {
            var mag = q.properties.mag;
            var coords = [q.geometry.coordinates[1], q.geometry.coordinates[0]];
            var color = '#0072ff';
            if (mag >= 5) color = '#ffaa00';
            if (mag >= 6) color = '#ff3333';
            markers.addLayer(L.circleMarker(coords, {
                radius: mag * 1.5, fillColor: color, color: '#fff', weight: 0.5, opacity: 0.8, fillOpacity: 0.6
            }).bindPopup('<div class="custom-popup"><b style="color:' + color + '">SEISMIC EVENT</b><span>MAG: <b>' + mag.toFixed(1) + '</b></span><span>LOC: ' + q.properties.place + '</span></div>'));
        } catch(e) {}
    });
    STATE.layers.quakes = markers;
    if (STATE.activeStates.quakes) STATE.map.addLayer(markers);
}

function buildEONETLayers(d) {
    function makeLayer(events, fillColor, emoji) {
        var g = L.layerGroup();
        (events || []).forEach(function(ev) {
            var coords = getEventCoords(ev);
            if (coords) {
                g.addLayer(L.circleMarker(coords, {
                    radius: 6, fillColor: fillColor, color: fillColor, weight: 1, fillOpacity: 0.7
                }).bindPopup('<b>' + emoji + ' ' + (ev.title || 'Event') + '</b>'));
            }
        });
        return g;
    }
    STATE.layers.volcanoes = makeLayer(d.volcanoEvents, '#ff3333', '🌋');
    STATE.layers.storms = makeLayer(d.stormEvents, '#00f3ff', '🌊');
    STATE.layers.floods = makeLayer(d.floodEvents, '#3366ff', '🌊');
    STATE.layers.fireMarkers = makeLayer(d.fireEvents, '#ff6600', '🔥');
}

function buildMarineLayers(waveData, currentData) {
    var wm = [];
    (waveData || []).forEach(function(b) {
        try {
            var h = b.waveHeight || 0;
            var color = '#00f3ff'; if (h > 3) color = '#ffaa00'; if (h > 6) color = '#ff3333';
            wm.push(L.circleMarker([b.lat, b.lon], {
                radius: 5 + h, fillColor: color, color: '#fff', weight: 1, fillOpacity: 0.7
            }).bindPopup('<b>🌊 ' + b.name + '</b><br>Wave: <b>' + h + ' m</b> (T=' + (b.wavePeriod || 0) + 's)'));
        } catch(e) {}
    });
    STATE.layers.waves = L.layerGroup(wm);

    var cm = [];
    (currentData || []).forEach(function(d) {
        try {
            cm.push(L.circleMarker([d.lat, d.lon], {
                radius: Math.max(2, (d.velocity || 0) * 10), color: '#39ff14', fillOpacity: 0.2
            }).bindPopup('<b>FLOW</b><br>Velocity: ' + d.velocity + ' m/s'));
        } catch(e) {}
    });
    STATE.layers.salinity = L.layerGroup(cm);
}

async function refreshMapMarkers() {
    try {
        var quakes = await fetchEarthquakes();
        updateQuakeMarkers(quakes);
    } catch(e) {}
}

// ═══════════════════════════════════════════════════════
//  MINI CHARTS
// ═══════════════════════════════════════════════════════
function createMiniChart(id, color, type) {
    type = type || 'line';
    var canvas = document.getElementById(id);
    if (!canvas || typeof Chart === 'undefined') return null;
    var ctx = canvas.getContext('2d');
    return new Chart(ctx, {
        type: type,
        data: { labels: Array.from({length: CONFIG.CHART_HISTORY}, function(_, i) { return i; }), datasets: [{ data: Array(CONFIG.CHART_HISTORY).fill(0), borderColor: color, backgroundColor: type === 'bar' ? color : color + '33', borderWidth: 2, pointRadius: 0, fill: type === 'line' }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, min: 0 } }, layout: { padding: 0 } }
    });
}

function initMiniCharts() {
    STATE.charts.quakes = createMiniChart('chart-quakes', '#ff3333', 'bar');
    STATE.charts.fires = createMiniChart('chart-fires', '#ffaa00', 'bar');
    STATE.charts.aqi = createMiniChart('chart-aqi', '#39ff14', 'line');
    STATE.charts.solar = createMiniChart('chart-solar', '#ffff00', 'line');
    STATE.charts.co2 = createMiniChart('chart-co2', '#39ff14', 'line');
    STATE.charts.storm = createMiniChart('chart-storm', '#00f3ff', 'bar');
}

function pushChart(chart, val) {
    if (!chart) return;
    chart.data.datasets[0].data.push(val);
    chart.data.datasets[0].data.shift();
    try { chart.update('none'); } catch(e) {}
}

// ═══════════════════════════════════════════════════════
//  LAYER TOGGLE
// ═══════════════════════════════════════════════════════
function toggleLayer(key) {
    if (!STATE.layers[key]) return;
    STATE.activeStates[key] = !STATE.activeStates[key];
    var btn = document.getElementById('btn-' + key);
    if (STATE.activeStates[key]) {
        STATE.map.addLayer(STATE.layers[key]);
        if (btn) btn.classList.add('active');
    } else {
        STATE.map.removeLayer(STATE.layers[key]);
        if (btn) btn.classList.remove('active');
    }
}

// ═══════════════════════════════════════════════════════
//  MAIN REFRESH — кожен блок в окремому try/catch
// ═══════════════════════════════════════════════════════
async function refreshAll() {
    STATE.lastRefresh = Date.now();
    STATE.errors = [];
    console.log('[IBONARIUM] Refreshing...');

    var quakes = [], eonetEvents = [], spaceWeather = { kp: null, dst: null, f107: null, alerts: [] }, co2 = null, aqData = [], marineData = [], currents = [];

    // ── Етап 1: Паралельне завантаження ──
    try {
        var results = await Promise.allSettled([
            fetchEarthquakes(),
            fetchEONET(),
            fetchSpaceWeather(),
            fetchCO2(),
            fetchAirQuality(),
            fetchMarine(),
            fetchCurrents()
        ]);
        if (results[0].status === 'fulfilled') quakes = results[0].value || [];
        if (results[1].status === 'fulfilled') eonetEvents = results[1].value || [];
        if (results[2].status === 'fulfilled') spaceWeather = results[2].value || spaceWeather;
        if (results[3].status === 'fulfilled') co2 = results[3].value;
        if (results[4].status === 'fulfilled') aqData = results[4].value || [];
        if (results[5].status === 'fulfilled') marineData = results[5].value || [];
        if (results[6].status === 'fulfilled') currents = results[6].value || [];
    } catch(e) {
        console.error('[IBONARIUM] Fetch phase error:', e);
    }

    // ── Етап 2: Обробка + UI (кожен крок окремо) ──
    var classified = { wildfires: [], volcanoes: [], severeStorms: [], floods: [], landslides: [], tempExtremes: [], other: [] };
    try { classified = classifyEONET(eonetEvents); } catch(e) { console.error('[classifyEONET]', e); }

    var quakesCount = quakes.length;
    var firesCount = classified.wildfires.length;
    var stormsCount = classified.severeStorms.length;
    var floodsCount = classified.floods.length;
    var volcanoesCount = classified.volcanoes.length;
    var avgAqi = aqData.length > 0 ? Math.round(aqData.reduce(function(s, c) { return s + c.pm25; }, 0) / aqData.length) : 0;

    var pulse = calcEarthPulse({ quakesCount: quakesCount, firesCount: firesCount, stormsCount: stormsCount, floodsCount: floodsCount, volcanoesCount: volcanoesCount, kp: spaceWeather.kp, avgAqi: avgAqi });

    try { updatePlanetStatus(pulse); } catch(e) {}
    try { updatePulse(pulse); } catch(e) {}
    try { updateEventCounts({ quakesCount: quakesCount, firesCount: firesCount, stormsCount: stormsCount, floodsCount: floodsCount, volcanoesCount: volcanoesCount }); } catch(e) {}

    try {
        var riskRegions = calcRiskRegions({ quakes: quakes, volcanoEvents: classified.volcanoes, aqData: aqData, avgAqi: avgAqi });
        updateRiskRegionsUI(riskRegions);
    } catch(e) { console.error('[riskRegions]', e); }

    try { updateSpaceWeatherUI(spaceWeather); } catch(e) { console.error('[spaceWeather]', e); }

    try { updateClimateUI({ co2: co2, spaceWeather: spaceWeather }); } catch(e) {}

    try {
        var timeline = buildTimeline({ quakes: quakes, fireEvents: classified.wildfires, stormEvents: classified.severeStorms, floodEvents: classified.floods, volcanoEvents: classified.volcanoes, spaceWeather: spaceWeather });
        updateTimelineUI(timeline);
    } catch(e) { console.error('[timeline]', e); }

    try {
        var summaryData = { quakesCount: quakesCount, firesCount: firesCount, stormsCount: stormsCount, floodsCount: floodsCount, volcanoesCount: volcanoesCount, quakes: quakes, spaceWeather: spaceWeather, aqData: aqData, avgAqi: avgAqi, co2: co2, pulse: pulse };
        setHTML('ai-summary', buildAISummary(summaryData));
    } catch(e) { console.error('[summary]', e); }

    try {
        var preds = buildPredictions({ firesCount: firesCount, quakes: quakes, stormsCount: stormsCount, spaceWeather: spaceWeather });
        updatePredictionsUI(preds);
    } catch(e) { console.error('[predictions]', e); }

    try { updateInfraUI(); } catch(e) {}

    // Міні-графіки
    var totalEvents = firesCount + stormsCount + floodsCount + volcanoesCount + classified.landslides.length + classified.tempExtremes.length;
    try { setText('ch-quakes-val', quakesCount); } catch(e) {}
    try { setText('ch-fires-val', totalEvents); } catch(e) {}
    try { setText('ch-aqi-val', avgAqi); setText('ch-aqi-sub', avgAqi <= 35 ? 'good' : avgAqi <= 55 ? 'помірний' : 'нездоровий'); } catch(e) {}
    try {
        if (spaceWeather.f107) { setText('ch-solar-val', spaceWeather.f107 + ' SFU'); setText('ch-solar-sub', spaceWeather.kp >= 5 ? 'буря' : 'активний'); }
        else { setText('ch-solar-val', 'N/A'); setText('ch-solar-sub', ''); }
    } catch(e) {}
    try { setText('ch-co2-val', co2 ? co2.toFixed(1) : 'N/A'); } catch(e) {}
    try { setText('ch-storm-val', stormsCount + ' / ' + totalEvents); setText('ch-storm-sub', 'штормів / подій'); } catch(e) {}

    pushChart(STATE.charts.quakes, quakesCount);
    pushChart(STATE.charts.fires, totalEvents);
    pushChart(STATE.charts.aqi, avgAqi);
    pushChart(STATE.charts.solar, (spaceWeather.kp || 0) * 10);
    pushChart(STATE.charts.co2, co2 || 0);
    pushChart(STATE.charts.storm, stormsCount);

    // Маркери на карті
    try { updateQuakeMarkers(quakes); } catch(e) {}
    try {
        buildEONETLayers({ fireEvents: classified.wildfires, volcanoEvents: classified.volcanoes, stormEvents: classified.severeStorms, floodEvents: classified.floods });
        buildMarineLayers(marineData, currents);
        ['quakes', 'fires', 'volcanoes', 'storms', 'floods', 'waves', 'salinity'].forEach(function(key) {
            if (STATE.activeStates[key] && STATE.layers[key]) STATE.map.addLayer(STATE.layers[key]);
        });
    } catch(e) { console.error('[map layers]', e); }

    var apiOk = Object.values(STATE.apiStatus).filter(Boolean).length;
    var apiTotal = Object.keys(STATE.apiStatus).length;
    console.log('[IBONARIUM] Done. Pulse=' + pulse + ' Events=' + totalEvents + ' APIs=' + apiOk + '/' + apiTotal);
}