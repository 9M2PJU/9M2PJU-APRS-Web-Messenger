import { generateLoginLine, generateMessagePacket, generatePositionPacket, parsePacket, APRS_CONFIG } from './aprs.js';

// Application State
const state = {
    socket: null,
    callsign: localStorage.getItem('aprs_callsign') || '',
    passcode: localStorage.getItem('aprs_passcode') || '',
    appPassword: localStorage.getItem('aprs_app_password') || '',
    currentContact: 'APRS-IS',
    messages: loadMessages() || {
        'APRS-IS': [
            { source: 'System', content: 'Welcome to APRS Web Messenger. Configure your passcode in Settings to start.', type: 'received', time: 'SYSTEM' }
        ]
    },
    packetsReceived: 0,
    startTime: Date.now(),
    reconnectAt: 0,
    beaconTimer: null,
    lastPos: null,
    gpsWatchId: null,
    symbol: localStorage.getItem('aprs_symbol') || '['
};

function loadMessages() {
    try {
        const saved = localStorage.getItem('aprs_messages');
        return saved ? JSON.parse(saved) : null;
    } catch (e) {
        console.error('Failed to load messages:', e);
        return null;
    }
}

function saveMessages() {
    try {
        localStorage.setItem('aprs_messages', JSON.stringify(state.messages));
    } catch (e) {
        console.error('Failed to save messages:', e);
    }
}

// DOM Elements
const elements = {
    loginOverlay: document.getElementById('login-overlay'),
    loginForm: document.getElementById('login-form'),
    dashboard: document.getElementById('dashboard'),
    displayCallsign: document.getElementById('display-callsign'),
    connectionStatus: document.getElementById('connection-status'),
    contactList: document.getElementById('contact-list'),
    messageContainer: document.getElementById('message-container'),
    messageForm: document.getElementById('message-form'),
    messageInput: document.getElementById('message-input'),
    currentChatName: document.getElementById('current-chat-name'),
    logoutBtn: document.getElementById('logout-btn'),
    addContactBtn: document.getElementById('add-contact-btn'),
    loginError: document.getElementById('login-error'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    saveSettingsBtn: document.getElementById('save-settings'),
    closeSettingsBtn: document.getElementById('close-settings'),
    settingsPasscode: document.getElementById('settings-passcode'),
    settingsAppPassword: document.getElementById('settings-app-password'),
    settingsStatus: document.getElementById('settings-status'),
    settingsInterval: document.getElementById('settings-interval'),
    consoleOutput: document.getElementById('console-output'),
    toggleConsole: document.getElementById('toggle-console'),
    packetConsole: document.getElementById('packet-console'),
    statUptime: document.getElementById('stat-uptime'),
    statPackets: document.getElementById('stat-packets'),
    clearChatBtn: document.getElementById('clear-chat-btn'),
    macroBtns: document.querySelectorAll('.macro-btn'),
    radarInfo: document.getElementById('radar-info'),
    manualGpsBtn: document.getElementById('manual-gps-btn'),
    settingsSymbol: document.getElementById('settings-symbol'),
    sendGpsBtn: document.getElementById('send-gps-btn'),
    toggleContactsBtn: document.getElementById('toggle-contacts'),
    toggleRadarBtn: document.getElementById('toggle-radar'),
    sidebar: document.querySelector('.sidebar'),
    radarSidebar: document.querySelector('.right-panel')
};

// Initialization
function init() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.messageForm.addEventListener('submit', handleSendMessage);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.addContactBtn.addEventListener('click', handleAddContact);
    elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
    elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
    elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
    elements.toggleConsole.addEventListener('click', () => elements.packetConsole.classList.toggle('collapsed'));
    elements.clearChatBtn.addEventListener('click', handleClearChat);

    elements.macroBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.messageInput.value = btn.textContent;
            handleSendMessage({ preventDefault: () => { } });
        });
    });

    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    });

    elements.toggleContactsBtn.addEventListener('click', () => {
        elements.sidebar.classList.toggle('active');
        elements.radarSidebar.classList.remove('active');
    });

    elements.toggleRadarBtn.addEventListener('click', () => {
        elements.radarSidebar.classList.toggle('active');
        elements.sidebar.classList.remove('active');
    });

    if (state.callsign) {
        document.getElementById('callsign').value = state.callsign;
    }

    setInterval(updateStats, 1000);
    startGpsTracking();

    elements.manualGpsBtn.addEventListener('click', handleManualGps);
    elements.sendGpsBtn.addEventListener('click', handleManualGps);

    // Set initial values in settings modal
    elements.settingsSymbol.value = state.symbol;
    elements.settingsStatus.value = localStorage.getItem('aprs_status') || 'Online on 9M2PJU APRS Web Messenger';
    elements.settingsInterval.value = localStorage.getItem('aprs_interval') || 20;
    elements.settingsPasscode.value = state.passcode;

    renderContacts();
    renderMessages();
}

// Event Handlers
async function handleLogin(e) {
    e.preventDefault();
    elements.loginError.textContent = '';
    elements.loginError.classList.add('hidden');

    const callsign = document.getElementById('callsign').value.trim().toUpperCase();
    const password = document.getElementById('password').value.trim();

    if (!callsign || !password) return;

    if (!state.appPassword) {
        state.appPassword = password;
        localStorage.setItem('aprs_app_password', password);
    } else if (password !== state.appPassword) {
        elements.loginError.textContent = 'Invalid Access Password';
        elements.loginError.classList.remove('hidden');
        return;
    }

    state.callsign = callsign;
    localStorage.setItem('aprs_callsign', callsign);

    if (state.passcode) {
        connectWebSocket();
    } else {
        elements.loginOverlay.classList.add('hidden');
        elements.dashboard.classList.remove('hidden');
        elements.settingsModal.classList.remove('hidden');
        elements.displayCallsign.textContent = state.callsign;
    }
}

function handleLogout() {
    if (state.socket) {
        state.socket.close();
    }
    if (state.gpsWatchId) {
        navigator.geolocation.clearWatch(state.gpsWatchId);
        state.gpsWatchId = null;
    }
    elements.dashboard.classList.add('hidden');
    elements.loginOverlay.classList.remove('hidden');
}

function handleAddContact() {
    const contact = prompt('Enter the Callsign-SSID you want to message (e.g. 9M2PJU-10):');
    if (!contact) return;

    const cleanContact = contact.trim().toUpperCase();
    if (cleanContact === state.callsign) {
        alert("You can't message yourself!");
        return;
    }

    if (!state.messages[cleanContact]) {
        state.messages[cleanContact] = [];
    }

    state.currentContact = cleanContact;
    elements.currentChatName.textContent = cleanContact;
    renderContacts();
    renderMessages();
}

function handleSendMessage(e) {
    if (e && e.preventDefault) e.preventDefault();
    const content = elements.messageInput.value.trim();
    if (!content) return;

    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        alert('Cannot send: Not connected to APRS-IS Gateway.');
        return;
    }

    const packet = generateMessagePacket(state.callsign, state.currentContact, content);
    state.socket.send(packet);

    // Update UI
    addMessageToState(state.currentContact, {
        source: state.callsign,
        content: content,
        type: 'sent',
        time: new Date().toLocaleTimeString()
    });

    elements.messageInput.value = '';
    renderMessages();
}

// WebSocket Logic
function connectWebSocket() {
    try {
        state.socket = new WebSocket(APRS_CONFIG.SERVER);

        state.socket.onopen = () => {
            logToConsole('>>> CONNECTED TO APRS-IS');
            const loginLine = generateLoginLine(state.callsign, state.passcode);
            state.socket.send(loginLine);

            // Server-side filtering
            const filterLine = `#filter pv/${state.callsign}*\r\n`;
            state.socket.send(filterLine);
            logToConsole(`>>> FILTER_SET: pv/${state.callsign}`);

            elements.displayCallsign.textContent = state.callsign;
            elements.connectionStatus.classList.add('online');
            startBeaconing();
        };

        state.socket.onmessage = async (event) => {
            let data = event.data;
            if (data instanceof Blob) {
                data = await data.text();
            }

            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;
                logToConsole(line);
                state.packetsReceived++;

                const parsed = parsePacket(line);

                // Handle Login Response
                if (line.startsWith('# logresp')) {
                    if (line.includes('verified')) {
                        logToConsole('>>> LOGIN_VERIFIED');
                        elements.loginOverlay.classList.add('hidden');
                        elements.dashboard.classList.remove('hidden');
                    } else {
                        logToConsole('!!! LOGIN_FAILED');
                        elements.loginError.textContent = 'APRS-IS Failed: ' + line.split(' ').slice(2).join(' ');
                        elements.loginError.classList.remove('hidden');
                        state.socket.close();
                    }
                }

                if (parsed && parsed.type === 'message') {
                    playNotification();
                    addMessageToState(parsed.source, {
                        source: parsed.source,
                        content: parsed.content,
                        type: 'received',
                        time: parsed.timestamp
                    });
                    renderMessages();
                    renderContacts();
                }
            });
        };

        state.socket.onclose = () => {
            console.log('Disconnected from APRS-IS Gateway');
            elements.connectionStatus.classList.remove('online');
            // Auto-reconnect or show error?
        };

        state.socket.onerror = (err) => {
            console.error('WebSocket Error:', err);
            alert('Failed to connect to APRS-IS. Please check your connection or server status.');
        };

    } catch (error) {
        console.error('Connection failed:', error);
    }
}

// UI Rendering Functions
function addMessageToState(contact, msg) {
    if (!state.messages[contact]) {
        state.messages[contact] = [];
    }
    state.messages[contact].push(msg);
    saveMessages();
}

function renderMessages() {
    const msgs = state.messages[state.currentContact] || [];
    elements.messageContainer.innerHTML = '';

    msgs.forEach((msg, index) => {
        const msgEl = document.createElement('div');
        msgEl.className = `message ${msg.type}`;
        msgEl.innerHTML = `
            <div class="msg-bubble">${msg.content}</div>
            <span class="time">${msg.time}</span>
        `;

        // Context menu for deleting message
        msgEl.oncontextmenu = (e) => {
            e.preventDefault();
            if (confirm('Delete this message?')) {
                state.messages[state.currentContact].splice(index, 1);
                saveMessages();
                renderMessages();
            }
        };

        elements.messageContainer.appendChild(msgEl);
    });

    elements.messageContainer.scrollTop = elements.messageContainer.scrollHeight;
}

function renderContacts() {
    const contacts = Object.keys(state.messages);
    elements.contactList.innerHTML = '';

    contacts.forEach(contact => {
        const lastMsg = state.messages[contact][state.messages[contact].length - 1];
        const li = document.createElement('li');
        li.className = `contact ${contact === state.currentContact ? 'active' : ''}`;
        li.dataset.callsign = contact;
        li.innerHTML = `
            <div class="avatar">${contact.substring(0, 2).toUpperCase()}</div>
            <div class="contact-info">
                <span class="name">${contact}</span>
                <span class="last-msg">${lastMsg ? lastMsg.content.substring(0, 20) : '...'}</span>
            </div>
            ${contact !== 'APRS-IS' ? '<button class="delete-contact" title="Delete Contact">×</button>' : ''}
        `;

        li.onclick = (e) => {
            if (e.target.classList.contains('delete-contact')) {
                if (confirm(`Remove ${contact} and all history?`)) {
                    delete state.messages[contact];
                    saveMessages();
                    state.currentContact = 'APRS-IS';
                    renderContacts();
                    renderMessages();
                }
                return;
            }
            state.currentContact = contact;
            elements.currentChatName.textContent = contact;
            renderContacts();
            renderMessages();
        };

        elements.contactList.appendChild(li);
    });
}

// Advanced Features Support
function logToConsole(text) {
    const line = document.createElement('div');
    line.className = 'monitor-line';
    line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    elements.consoleOutput.appendChild(line);
    elements.consoleOutput.scrollTop = elements.consoleOutput.scrollHeight;

    // Keep console limited to 100 lines
    while (elements.consoleOutput.children.length > 100) {
        elements.consoleOutput.removeChild(elements.consoleOutput.firstChild);
    }
}

function updateStats() {
    const diff = Math.floor((Date.now() - state.startTime) / 1000);
    const mins = Math.floor(diff / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    elements.statUptime.textContent = `UP ${mins}:${secs}`;
    elements.statPackets.textContent = `PKT ${state.packetsReceived}`;
}

function handleSaveSettings() {
    state.passcode = elements.settingsPasscode.value.trim();
    const newAppPass = elements.settingsAppPassword.value.trim();
    if (newAppPass) {
        state.appPassword = newAppPass;
        localStorage.setItem('aprs_app_password', newAppPass);
    }

    localStorage.setItem('aprs_passcode', state.passcode);
    localStorage.setItem('aprs_symbol', elements.settingsSymbol.value);
    localStorage.setItem('aprs_status', elements.settingsStatus.value);
    localStorage.setItem('aprs_interval', elements.settingsInterval.value);

    state.symbol = elements.settingsSymbol.value;

    elements.settingsModal.classList.add('hidden');
    alert('Settings applied locally. Restarting beacons...');

    // Restart beaconing with new settings
    startBeaconing();
}

function handleManualGps() {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        alert('Not connected to APRS-IS');
        return;
    }
    if (!state.lastPos) {
        alert('Waiting for GPS lock...');
        return;
    }
    sendBeacon();
    alert('Manual position beacon sent.');
}

function handleClearChat() {
    if (confirm(`Clear all messages for ${state.currentContact}?`)) {
        state.messages[state.currentContact] = [];
        saveMessages();
        renderMessages();
    }
}

function startBeaconing() {
    if (state.beaconTimer) clearInterval(state.beaconTimer);

    // Initial beacon
    sendBeacon();

    const interval = parseInt(elements.settingsInterval.value) || 20;
    state.beaconTimer = setInterval(sendBeacon, interval * 60000);
}

function sendBeacon() {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;

    const comment = elements.settingsStatus.value || 'Online on 9M2PJU APRS Web Messenger';
    let packet;

    if (state.lastPos) {
        packet = generatePositionPacket(state.callsign, state.lastPos.lat, state.lastPos.lon, state.symbol, '/', comment);
        logToConsole(`>>> POSITION_SENT: ${state.lastPos.lat.toFixed(4)}, ${state.lastPos.lon.toFixed(4)} [${state.symbol}]`);
    } else {
        packet = `${state.callsign}>APJUMB,TCPIP*::AIS-ST   :${comment}\r\n`;
        logToConsole('>>> BEACON_SENT (Status Only)');
    }

    state.socket.send(packet);
}

function playNotification() {
    try {
        const audio = new Audio('https://bin.hamradio.my/beep.mp3');
        audio.play().catch(e => console.log('Audio play blocked'));
    } catch (e) { }
}

function startGpsTracking() {
    if ("geolocation" in navigator) {
        state.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                state.lastPos = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
                elements.radarInfo.textContent = `GPS_LOCK: ${state.lastPos.lat.toFixed(4)}, ${state.lastPos.lon.toFixed(4)}`;
                logToConsole(`>>> GPS_UPDATED: ${state.lastPos.lat.toFixed(4)}, ${state.lastPos.lon.toFixed(4)}`);
            },
            (error) => {
                console.error("Geolocation error:", error);
                elements.radarInfo.textContent = "GPS_ERROR: " + error.message;
            },
            { enableHighAccuracy: true }
        );
    } else {
        elements.radarInfo.textContent = "GPS_UNSUPPORTED";
    }
}

// Start
init();

