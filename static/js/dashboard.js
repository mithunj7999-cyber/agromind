/**
 * SmartFarm IoT Dashboard - Main Interactive Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    // Global Constants & State
    const API_DATA_URL = '/api/data';
    const API_SETTINGS_URL = '/api/settings';
    let currentSoilThreshold = 400;
    let lastDataTimestamp = null;
    let isNodeMCUConnected = false;
    const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds of no data = offline

    // UI Elements
    const cardTempHumidity = document.getElementById('card-temp-humidity');
    const cardSoilVal = document.getElementById('card-soil-val');
    const cardPump1State = document.getElementById('card-pump-1-state');
    const cardPump2State = document.getElementById('card-pump-2-state');
    const cardRainState = document.getElementById('card-rain-state');
    const rainDetailBadge = document.getElementById('rain-detail-badge');
    const cardReservoirState = document.getElementById('card-reservoir-state');
    const humidityLbl = document.getElementById('humidity-lbl');
    const soilStatusBadge = document.getElementById('soil-status-badge');
    const soilThresholdLbl = document.getElementById('soil-threshold-lbl');
    const reservoirStatusBadge = document.getElementById('reservoir-status-badge');
    const alertsList = document.getElementById('alerts-list');
    const alertsCountBadge = document.getElementById('alerts-count');
    const logsCountBadge = document.getElementById('logs-count');
    const telemetryTableBody = document.getElementById('telemetry-table-body');
    const tankVolTxt = document.getElementById('tank-vol-txt');
    const m1Indicator = document.getElementById('m1-indicator');
    const m2Indicator = document.getElementById('m2-indicator');
    const m1SubLabel = document.getElementById('m1-sub-label');
    const m2SubLabel = document.getElementById('m2-sub-label');
    const nodeMCUStatus = document.getElementById('nodemcu-status');
    const statusIndicatorDot = nodeMCUStatus?.querySelector('.status-indicator-dot');
    const statusText = nodeMCUStatus?.querySelector('.status-text');

    // Settings elements
    const thresholdSlider = document.getElementById('soil-threshold-input');
    const currentThresholdVal = document.getElementById('current-threshold-val');
    const saveThresholdBtn = document.getElementById('save-threshold-btn');

    // Chart Handles
    let trendChart = null;
    let radarChart = null;
    let barChart = null;

    // Synchronize slider UI
    thresholdSlider.addEventListener('input', (e) => {
        currentThresholdVal.textContent = e.target.value;
    });

    // Save slider settings to database
    saveThresholdBtn.addEventListener('click', async () => {
        const val = parseInt(thresholdSlider.value);
        saveThresholdBtn.disabled = true;
        saveThresholdBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        try {
            const response = await fetch(API_SETTINGS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ soil_threshold: val })
            });
            const result = await response.json();
            if (result.status === 'success') {
                currentSoilThreshold = val;
                soilThresholdLbl.textContent = val;
                showNotification('Success', 'Soil moisture limit saved successfully.', 'success');
            } else {
                showNotification('Error', result.message, 'danger');
            }
        } catch (e) {
            console.error('Settings sync failed:', e);
            showNotification('Error', 'Failed to communicate with Flask server.', 'danger');
        } finally {
            saveThresholdBtn.disabled = false;
            saveThresholdBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Threshold Limit';
        }
    });

    // Initialize all Charts
    function initCharts() {
        // --- 1. Trend Area Chart (Main Visual) ---
        const trendOptions = {
            chart: {
                type: 'area',
                height: 350,
                background: 'transparent',
                foreColor: 'hsl(220, 15%, 70%)',
                toolbar: { show: false },
                zoom: { enabled: false },
                animations: {
                    enabled: true,
                    easing: 'easeinout',
                    speed: 800,
                    animateGradually: { enabled: true, delay: 150 },
                    dynamicAnimation: { enabled: true, speed: 350 }
                }
            },
            colors: ['#5F85FF', '#00E5FF', '#00E676'], // Temperature, Humidity, Soil Moisture
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.45,
                    opacityTo: 0.02,
                    stops: [0, 90, 100]
                }
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 3 },
            series: [
                { name: 'Ambient Temp (°C)', data: [] },
                { name: 'Air Humidity (%)', data: [] },
                { name: 'Soil Moisture (ADC)', data: [] }
            ],
            xaxis: {
                categories: [],
                labels: { style: { colors: 'hsl(220, 12%, 60%)', fontFamily: 'Inter' } },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            yaxis: [
                {
                    title: { text: 'Temp & Humidity', style: { color: '#5F85FF', fontFamily: 'Outfit' } },
                    labels: { style: { colors: '#5F85FF' } },
                    min: 0,
                    max: 100
                },
                {
                    opposite: true,
                    title: { text: 'Soil Moisture Value', style: { color: '#00E676', fontFamily: 'Outfit' } },
                    labels: { style: { colors: '#00E676' } },
                    min: 0,
                    max: 1024
                }
            ],
            grid: {
                borderColor: 'hsla(220, 20%, 35%, 0.15)',
                strokeDashArray: 4
            },
            tooltip: {
                theme: 'dark',
                style: { fontSize: '12px', fontFamily: 'Inter' }
            },
            legend: {
                position: 'top',
                horizontalAlign: 'right',
                fontFamily: 'Inter',
                markers: { radius: 6 }
            }
        };
        trendChart = new ApexCharts(document.querySelector("#trend-chart"), trendOptions);
        trendChart.render();

        // --- 2. Diagnostics Radar Chart ---
        const radarOptions = {
            chart: {
                type: 'radar',
                height: 250,
                background: 'transparent',
                foreColor: 'hsl(220, 15%, 70%)',
                toolbar: { show: false }
            },
            colors: ['#00E5FF'],
            series: [{
                name: 'Diagnostic Metric',
                data: [90, 85, 95, 80, 88] // Seed values (will fluctuate subtly)
            }],
            labels: ['Soil Health', 'DHT Stability', 'Signal dBm', 'Water Level', 'Pump Safety'],
            yaxis: { show: false, min: 0, max: 100 },
            stroke: { width: 2, colors: ['#5F85FF'] },
            fill: { opacity: 0.15, colors: ['#5F85FF'] },
            markers: { size: 4, colors: ['#00E5FF'], strokeWidth: 0 },
            grid: { show: false },
            plotOptions: {
                radar: {
                    polygons: {
                        strokeColors: 'hsla(220, 20%, 35%, 0.15)',
                        connectorColors: 'hsla(220, 20%, 35%, 0.15)',
                        fill: { colors: ['transparent'] }
                    }
                }
            }
        };
        radarChart = new ApexCharts(document.querySelector("#radar-chart"), radarOptions);
        radarChart.render();

        // --- 3. Pump Running Profiles Bar Chart ---
        const barOptions = {
            chart: {
                type: 'bar',
                height: 250,
                background: 'transparent',
                foreColor: 'hsl(220, 15%, 70%)',
                toolbar: { show: false }
            },
            colors: ['#5F85FF', '#FFB302'],
            series: [
                { name: 'Reservoir (M1) Hrs', data: [1.2, 0.8, 1.5, 0.4, 2.1, 1.1, 0.5] },
                { name: 'Irrigation (M2) Hrs', data: [2.5, 3.1, 1.8, 0.0, 4.2, 2.9, 3.5] }
            ],
            xaxis: {
                categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                labels: { style: { colors: 'hsl(220, 12%, 60%)' } }
            },
            yaxis: {
                title: { text: 'Running Hours', style: { color: 'hsl(220, 15%, 70%)' } }
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: '55%',
                    borderRadius: 4
                }
            },
            dataLabels: { enabled: false },
            grid: {
                borderColor: 'hsla(220, 20%, 35%, 0.15)',
                strokeDashArray: 4
            },
            tooltip: { theme: 'dark' },
            legend: { position: 'top', fontFamily: 'Inter' }
        };
        barChart = new ApexCharts(document.querySelector("#bar-chart"), barOptions);
        barChart.render();

        // --- 4. Reservoir Tank Level Animation (No longer needed - using HTML animation) ---
        // Tank animation is now controlled via CSS and JavaScript update functions

    }

    // Dynamic alert notifications UI generator helper
    function showNotification(title, message, type = 'success') {
        // Find notification box or dynamically build floating alert
        const notifContainer = document.querySelector('.main-content');
        const notif = document.createElement('div');
        notif.className = `alert-item alert-item-${type}`;
        notif.style.position = 'fixed';
        notif.style.top = '2rem';
        notif.style.right = '2.5rem';
        notif.style.zIndex = '999';
        notif.style.width = '350px';
        notif.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';

        let icon = 'circle-check';
        if (type === 'danger') icon = 'circle-xmark';
        if (type === 'warning') icon = 'triangle-exclamation';
        if (type === 'info') icon = 'circle-info';

        notif.innerHTML = `
            <i class="fa-solid fa-${icon} alert-icon"></i>
            <div class="alert-details">
                <h4>${title}</h4>
                <p>${message}</p>
            </div>
            <div class="alert-time" onclick="this.parentElement.remove()" style="cursor:pointer; font-size:14px; padding:0 5px;">&times;</div>
        `;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 4000);
    }

    // Dynamic Polling Engine
    // Update NodeMCU Connection Status
    function updateConnectionStatus(isConnected) {
        isNodeMCUConnected = isConnected;
        if (nodeMCUStatus && statusIndicatorDot && statusText) {
            if (isConnected) {
                nodeMCUStatus.classList.remove('offline');
                nodeMCUStatus.classList.add('online');
                statusIndicatorDot.classList.remove('offline');
                statusIndicatorDot.classList.add('online');
                statusText.textContent = 'NodeMCU: Online';
            } else {
                nodeMCUStatus.classList.remove('online');
                nodeMCUStatus.classList.add('offline');
                statusIndicatorDot.classList.remove('online');
                statusIndicatorDot.classList.add('offline');
                statusText.textContent = 'NodeMCU: Offline';
            }
        }
    }

    // Check if connection has timed out
    function checkConnectionTimeout() {
        if (lastDataTimestamp) {
            const timeSinceLastData = Date.now() - lastDataTimestamp;
            if (timeSinceLastData > CONNECTION_TIMEOUT_MS) {
                updateConnectionStatus(false);
            }
        }
    }

    // Display offline state with all 0 values
    function displayOfflineState() {
        cardTempHumidity.innerHTML = `<span style="color: var(--color-rose);">0.0°C / 0%</span>`;
        humidityLbl.textContent = '0.0%';
        cardSoilVal.textContent = '0';
        cardRainState.innerHTML = `<span style="color:var(--text-muted);">--- No Data ---</span>`;
        cardReservoirState.innerHTML = `<span style="color:var(--text-muted);">--- No Data ---</span>`;
        cardPump1State.innerHTML = `<span style="color:var(--text-muted);">OFFLINE</span>`;
        cardPump2State.innerHTML = `<span style="color:var(--text-muted);">OFFLINE</span>`;
        
        rainDetailBadge.className = 'status-neutral';
        rainDetailBadge.innerHTML = `<i class="fa-solid fa-wifi-slash"></i> No Connection`;
        
        soilStatusBadge.className = 'status-neutral';
        soilStatusBadge.innerHTML = `<i class="fa-solid fa-wifi-slash"></i> Disconnected`;
        
        reservoirStatusBadge.className = 'status-neutral';
        reservoirStatusBadge.innerHTML = `<i class="fa-solid fa-wifi-slash"></i> Offline`;
        
        m1Indicator.className = 'pump-indicator pump-idle';
        m2Indicator.className = 'pump-indicator pump-idle';
        m1SubLabel.textContent = 'NodeMCU Not Connected';
        m2SubLabel.textContent = 'NodeMCU Not Connected';
        
        // Show offline tank state
        const tankWater = document.getElementById('tank-water');
        const tankIndicator = document.getElementById('tank-indicator-icon');
        if (tankWater && tankIndicator) {
            tankWater.style.height = '0%';
            tankWater.classList.remove('animating');
            tankIndicator.className = 'tank-indicator offline';
            tankIndicator.innerHTML = '<i class="fa-solid fa-wifi-slash"></i>';
            tankVolTxt.textContent = 'Tank Status: No Connection';
        }
        
        // Clear telemetry table
        telemetryTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2rem;">Waiting for NodeMCU connection...</td></tr>';
    }

    async function pollTelemetryData() {
        try {
            const response = await fetch(API_DATA_URL);
            const res = await response.json();
            console.log('API Response:', res);

            if (res.status === 'success' && res.data && res.data.length > 0) {
                lastDataTimestamp = Date.now();
                updateConnectionStatus(true);
                updateDashboard(res.data, res.soilThreshold);
            } else {
                console.error('Invalid API response:', res);
                updateConnectionStatus(false);
            }
        } catch (e) {
            console.error('Telemetry fetch error:', e);
            updateConnectionStatus(false);
        }
    }

    // Update Dashboard UI elements and charts with new telemetry rows
    function updateDashboard(records, threshold) {
        // If NodeMCU is offline, show all 0 values
        if (!isNodeMCUConnected) {
            displayOfflineState();
            return;
        }

        // Sync local thresh limit state variables
        currentSoilThreshold = threshold;
        soilThresholdLbl.textContent = threshold;

        // Sync setting inputs if not focused
        if (document.activeElement !== thresholdSlider) {
            thresholdSlider.value = threshold;
            currentThresholdVal.textContent = threshold;
        }

        const latest = records[records.length - 1];
        logsCountBadge.textContent = `${records.length} Cycles`;

        // --- A. Update Dynamic Top Metrics Cards ---
        // 1. Temperature & Humidity Card
        cardTempHumidity.innerHTML = `${latest.temp.toFixed(1)}°C / <span style="font-size:1.35rem; font-weight:600;">${latest.humidity.toFixed(0)}%</span>`;
        humidityLbl.textContent = `${latest.humidity.toFixed(1)}%`;

        // 2. Soil Moisture Card
        cardSoilVal.textContent = latest.soil;

        // Compute moisture status details
        let soilClass = 'status-neutral';
        let soilText = 'Moisture Normal';
        if (latest.soil < threshold) {
            soilClass = 'status-down';
            soilText = 'Dry (Needs Pump)';
        } else if (latest.soil > threshold + 150) {
            soilClass = 'status-up';
            soilText = 'Wet (Water-Rich)';
        }
        soilStatusBadge.className = soilClass;
        soilStatusBadge.innerHTML = `<i class="fa-solid fa-leaf"></i> ${soilText}`;

        // 3. Rain Sensor Card (was Reservoir Pump card position)
        const rainDetected = parseInt(latest.rain) === 0;
        cardRainState.innerHTML = rainDetected ?
            `<span style="color:var(--color-rose); text-shadow:0 0 12px rgba(255,75,85,0.4);"><i class="fa-solid fa-cloud-showers-heavy"></i> RAINING</span>` :
            `<span style="color:var(--color-emerald); text-shadow:0 0 12px rgba(0,230,118,0.3);"><i class="fa-solid fa-sun"></i> NOT RAINING</span>`;
        rainDetailBadge.className = rainDetected ? 'status-down' : 'status-up';
        rainDetailBadge.innerHTML = rainDetected ?
            `<i class="fa-solid fa-cloud-showers-heavy"></i> Precipitation Active` :
            `<i class="fa-solid fa-sun"></i> Clear Skies`;

        // 4. Reservoir Level Card (was Irrigation Pump card position)
        const tankNotFull = parseInt(latest.float) === 1;
        cardReservoirState.innerHTML = tankNotFull ?
            `<span style="color:var(--color-amber); text-shadow:0 0 10px rgba(255,179,2,0.3);"><i class="fa-solid fa-triangle-exclamation"></i> LOW</span>` :
            `<span style="color:var(--color-emerald); text-shadow:0 0 10px rgba(0,230,118,0.3);"><i class="fa-solid fa-circle-check"></i> FULL</span>`;
        reservoirStatusBadge.className = tankNotFull ? 'status-warning' : 'status-up';
        reservoirStatusBadge.innerHTML = tankNotFull ?
            `<i class="fa-solid fa-triangle-exclamation"></i> Tank: Refilling...` :
            `<i class="fa-solid fa-circle-check"></i> Tank: Level Full`;

        // 5. Reservoir Pump (M1) Side Panel
        // Active-low logic: 0 = ON (Pump running), 1 = OFF (Pump idle)
        const m1State = parseInt(latest.m1) === 0;
        cardPump1State.innerHTML = m1State ?
            `<span style="color:#00E5FF; text-shadow:0 0 10px rgba(0,229,255,0.4);"><i class="fa-solid fa-sync fa-spin"></i> RUNNING</span>` :
            `<span style="color:var(--text-muted);">IDLE</span>`;
        m1Indicator.className = m1State ? 'pump-indicator pump-active' : 'pump-indicator pump-idle';
        m1SubLabel.textContent = m1State ? 'Refilling Reservoir Tank...' : 'Float Sensor Controlled';

        // 6. Irrigation Pump (M2) Side Panel
        // Active-low logic: 0 = ON (Pump running), 1 = OFF (Pump idle)
        const m2State = parseInt(latest.m2) === 0;
        cardPump2State.innerHTML = m2State ?
            `<span style="color:#00E676; text-shadow:0 0 10px rgba(0,230,118,0.4);"><i class="fa-solid fa-sync fa-spin"></i> IRRIGATING</span>` :
            `<span style="color:var(--text-muted);">IDLE</span>`;
        m2Indicator.className = m2State ? 'pump-indicator pump-active' : 'pump-indicator pump-idle';
        m2SubLabel.textContent = m2State ? 'Watering crops actively...' :
            (rainDetected ? 'Rain Override — Pump Locked' : 'Soil Moisture Controlled');

        // --- B. Generate Smart System Alerts ---
        generateAlerts(latest, threshold);

        // --- C. Update Trend Area Chart Series ---
        const times = records.map(r => r.time);
        const temps = records.map(r => r.temp);
        const hums = records.map(r => r.humidity);
        const soils = records.map(r => r.soil);

        trendChart.updateSeries([
            { name: 'Ambient Temp (°C)', data: temps },
            { name: 'Air Humidity (%)', data: hums },
            { name: 'Soil Moisture (ADC)', data: soils }
        ]);
        trendChart.updateOptions({
            xaxis: { categories: times }
        });

        // --- D. Update Tank Level Animation ---
        // Get tank animation elements
        const tankWater = document.getElementById('tank-water');
        const tankIndicator = document.getElementById('tank-indicator-icon');
        
        // Estimate tank water percentage: Float switch triggered = refill state (say 45%), Tank Full = 100%
        let tankPercentage = tankNotFull ? 45 : 100;
        if (m1State) {
            // Refilling in progress, add animation for active feedback
            tankWater.classList.add('animating');
            tankIndicator.className = 'tank-indicator refilling';
            tankIndicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        } else {
            tankWater.classList.remove('animating');
            if (tankNotFull) {
                tankIndicator.className = 'tank-indicator low';
                tankIndicator.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            } else {
                tankIndicator.className = 'tank-indicator full';
                tankIndicator.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            }
        }
        
        // Update water level in tank
        tankWater.style.height = tankPercentage + '%';

        tankVolTxt.textContent = m1State ?
            'Status: Refilling Reservoir' :
            (tankNotFull ? 'Status: Refill Triggered' : 'Status: Optimal Capacity');

        // Fluctuates Radar diagnostics subtly around dynamic signals
        const signalDBm = 85 + Math.floor(Math.sin(new Date().getSeconds() / 10) * 8);
        const soilHealth = latest.soil > 200 ? 92 : 45;
        const dhtHealth = (latest.temp === 0.0 && latest.humidity === 0.0) ? 10 : 96;
        radarChart.updateSeries([{
            name: 'Diagnostic Metric',
            data: [soilHealth, dhtHealth, signalDBm, tankPercentage, 98]
        }]);

        // --- E. Update Live Log Grid Data Table ---
        telemetryTableBody.innerHTML = '';

        // Render last 10 rows in descending order so newest stays on top
        const sliceRows = records.slice(-10).reverse();
        sliceRows.forEach(row => {
            const tr = document.createElement('tr');

            const trM1 = parseInt(row.m1) === 0 ?
                `<span class="status-pill status-pill-on">Active</span>` :
                `<span class="status-pill status-pill-off">Off</span>`;

            const trM2 = parseInt(row.m2) === 0 ?
                `<span class="status-pill status-pill-on">Active</span>` :
                `<span class="status-pill status-pill-off">Off</span>`;

            const trRain = parseInt(row.rain) === 0 ?
                `<span style="color:var(--color-rose); font-weight:600;"><i class="fa-solid fa-cloud-rain"></i> Yes</span>` :
                `<span style="color:var(--text-muted);">No</span>`;

            const trFloat = parseInt(row.float) === 1 ?
                `<span style="color:var(--color-amber); font-weight:600;"><i class="fa-solid fa-circle-exclamation"></i> Low</span>` :
                `<span style="color:var(--color-emerald);"><i class="fa-solid fa-circle-check"></i> Full</span>`;

            tr.innerHTML = `
                <td style="font-weight: 500; color: var(--color-indigo);">${row.timestamp}</td>
                <td>${row.temp.toFixed(1)}°C</td>
                <td>${row.humidity.toFixed(0)}%</td>
                <td style="font-weight: 600;">${row.soil}</td>
                <td>${trRain}</td>
                <td>${trFloat}</td>
                <td>${trM1}</td>
                <td>${trM2}</td>
            `;
            telemetryTableBody.appendChild(tr);
        });
    }

    // Intelligent Smart Farming alerts engine
    function generateAlerts(latest, threshold) {
        const alerts = [];
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // 1. High Temperature Alert
        if (latest.temp > 35) {
            alerts.push({
                type: 'danger',
                title: 'High Thermal Risk Warning',
                desc: `Farm sensor temperature reached ${latest.temp.toFixed(1)}°C. Crop stress hazard.`,
                time: nowStr
            });
        }

        // 2. Dry Ambient Atmosphere Alert
        if (latest.humidity < 30) {
            alerts.push({
                type: 'warning',
                title: 'Low Ambient Air Humidity',
                desc: `Ambient humidity dropped to ${latest.humidity.toFixed(0)}%. Vapor deficit risk.`,
                time: nowStr
            });
        }

        // 3. Dry Soil moisture triggers pump
        if (latest.soil < threshold) {
            if (parseInt(latest.rain) === 0) {
                // Soil dry but raining override active
                alerts.push({
                    type: 'info',
                    title: 'Irrigation Override Triggered',
                    desc: `Moisture low (${latest.soil}), but pump locked off because rain is actively detected.`,
                    time: nowStr
                });
            } else {
                alerts.push({
                    type: 'success',
                    title: 'Automated Irrigation Active',
                    desc: `Moisture below target (${latest.soil} < ${threshold}). Irrigation Pump 2 started.`,
                    time: nowStr
                });
            }
        }

        // 4. Reservoir Refilling state
        if (parseInt(latest.float) === 1) {
            alerts.push({
                type: 'warning',
                title: 'Reservoir Level Low',
                desc: 'Float switch triggered TANK NOT FULL. Reservoir Pump 1 activated.',
                time: nowStr
            });
        }

        // 5. DHT Sensor failure diagnostics
        if (latest.temp === 0.0 && latest.humidity === 0.0) {
            alerts.push({
                type: 'danger',
                title: 'DHT22 Communication Fault',
                desc: 'Warning: Corrupted byte matrix received from DHT element!',
                time: nowStr
            });
        }

        // Render Alerts List
        alertsCountBadge.textContent = alerts.length;
        if (alerts.length === 0) {
            alertsList.innerHTML = `
                <div class="empty-alerts">
                    <i class="fa-solid fa-shield-halved"></i>
                    <p>System operating normally. No alerts triggered.</p>
                </div>
            `;
        } else {
            alertsList.innerHTML = '';
            alerts.forEach(item => {
                const el = document.createElement('div');
                el.className = `alert-item alert-item-${item.type}`;

                let iconClass = 'fa-circle-info';
                if (item.type === 'danger') iconClass = 'fa-triangle-exclamation';
                if (item.type === 'warning') iconClass = 'fa-circle-exclamation';
                if (item.type === 'success') iconClass = 'fa-sprinkler';

                el.innerHTML = `
                    <i class="fa-solid ${iconClass} alert-icon"></i>
                    <div class="alert-details">
                        <h4>${item.title}</h4>
                        <p>${item.desc}</p>
                    </div>
                    <span class="alert-time">${item.time}</span>
                `;
                alertsList.appendChild(el);
            });
        }
    }

    // Startup Init
    initCharts();
    pollTelemetryData();

    // Poll the Flask API endpoint dynamically every 2 seconds to match NodeMCU's rhythms
    setInterval(pollTelemetryData, 2000);
    
    // Check for connection timeout every second
    setInterval(checkConnectionTimeout, 1000);
});
