import { generateLoginLine, generateMessagePacket, generatePositionPacket, parsePacket, APRS_CONFIG } from './aprs.js';

// APRS Symbols Map (Common Subset)
const APRS_SYMBOLS = [
    { code: '/>', name: 'Car', char: '>', table: '/' },
    { code: '/[', name: 'Jogger', char: '[', table: '/' },
    { code: '/b', name: 'Bike', char: 'b', table: '/' },
    { code: '/-', name: 'House', char: '-', table: '/' },
    { code: '/v', name: 'Van', char: 'v', table: '/' },
    { code: '/k', name: 'Truck', char: 'k', table: '/' },
    { code: '/j', name: 'Jeep', char: 'j', table: '/' },
    { code: '/s', name: 'Boat', char: 's', table: '/' },
    { code: '/Y', name: 'Yacht', char: 'Y', table: '/' },
    { code: '/O', name: 'Balloon', char: 'O', table: '/' },
    { code: '/#', name: 'Digi', char: '#', table: '/' },
    { code: '/=', name: 'Rail', char: '=', table: '/' },
    { code: '/<', name: 'Motorcycle', char: '<', table: '/' },
    { code: '/;', name: 'Camp', char: ';', table: '/' },
    { code: '/.', name: 'X-Ray', char: '.', table: '/' }
];

// Application State
const state = {
    socket: null,
    callsign: '',
    passcode: '',
    currentContact: 'APRS-IS',
    symbol: localStorage.getItem('aprs_symbol') || '/>', // Default Car
    beaconInterval: parseInt(localStorage.getItem('aprs_beacon_interval')) || 20, // Default 20 mins
    beaconTimer: null,
    beaconComment: localStorage.getItem('aprs_beacon_comment') || '9M2PJU Web APRS Messenger beacon',
    messagesSent: parseInt(localStorage.getItem('aprs_msgs_sent')) || 0,
    messagesReceived: parseInt(localStorage.getItem('aprs_msgs_received')) || 0,

    messages: loadMessages() || {
        'APRS-IS': [
            { source: 'System', content: 'Welcome to 9M2PJU Web APRS Messenger. Connect to start messaging!', type: 'received', time: 'Now' }
        ]
    }
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
    // Settings
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettings: document.getElementById('close-settings'),
    saveSettings: document.getElementById('save-settings'),
    settingsPasscode: document.getElementById('settings-passcode'),
    settingsSymbol: document.getElementById('settings-symbol'),
    settingsBeaconInterval: document.getElementById('settings-beacon-interval'),
    customSymbolInput: document.getElementById('custom-symbol-input'),
    beaconCommentInput: document.getElementById('beacon-comment-input'),
    symbolGrid: document.getElementById('symbol-grid'),
    currentSymbolDisplay: document.getElementById('current-symbol-display'),
    currentSymbolName: document.getElementById('current-symbol-name'),
    // Radar
    manualGpsBtn: document.getElementById('manual-gps-btn'),
    radarStatus: document.querySelector('.radar-status'),
    deleteChatBtn: document.getElementById('delete-chat-btn'),
    // Terminal
    terminalFooter: document.getElementById('terminal-footer'),
    terminalOutput: document.getElementById('terminal-output'),
    toggleTerminal: document.getElementById('toggle-terminal'),
    terminalContent: document.getElementById('terminal-content'),
    // Mobile
    showTerminalBtn: document.getElementById('show-terminal-btn'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    mobileRadarBtn: document.getElementById('mobile-radar-btn'),
    // Telemetry
    msgSentCount: document.getElementById('msg-sent-count'),
    msgReceivedCount: document.getElementById('msg-received-count'),
    toastContainer: document.getElementById('toast-container')
};

// Initialization
function init() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.messageForm.addEventListener('submit', handleSendMessage);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.addContactBtn.addEventListener('click', handleAddContact);

    // Settings
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.closeSettings.addEventListener('click', closeSettings);
    elements.saveSettings.addEventListener('click', handleSaveSettings);
    elements.manualGpsBtn.addEventListener('click', handleManualGps);
    elements.deleteChatBtn.addEventListener('click', handleDeleteChat);

    // Terminal Toggle
    elements.toggleTerminal.addEventListener('click', () => {
        elements.terminalContent.classList.toggle('hidden');
        document.body.classList.toggle('terminal-open');
        const icon = elements.toggleTerminal.querySelector('.terminal-toggle-icon');
        icon.style.transform = elements.terminalContent.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    // Mobile Toggles (Legacy - hidden in CSS)
    elements.showTerminalBtn.addEventListener('click', () => {
        elements.terminalFooter.classList.toggle('hidden');
    });
    // elements.mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    // elements.mobileRadarBtn.addEventListener('click', toggleMobileRadar);

    // Mobile Bottom Nav Logic
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = btn.dataset.tab;
            switchMobileTab(tab);
        });
    });

    document.getElementById('mobile-settings-btn').addEventListener('click', openSettings);

    // Map Events
    document.getElementById('map-select-btn').addEventListener('click', openMapModal);
    document.getElementById('close-map').addEventListener('click', closeMapModal);
    document.getElementById('confirm-location-btn').addEventListener('click', sendMapBeacon);

    // Enter key to send
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    });

    // Check if we have saved credentials
    const savedCall = localStorage.getItem('aprs_callsign');
    const savedPass = localStorage.getItem('aprs_passcode');
    if (savedCall && savedPass) {
        document.getElementById('callsign').value = savedCall;
        document.getElementById('passcode').value = savedPass;
    }

    // Default Terminal Closed
    // elements.terminalContent.classList.remove('hidden');
    // document.body.classList.add('terminal-open');
    // elements.toggleTerminal.querySelector('.terminal-toggle-icon').style.transform = 'rotate(180deg)';

    renderContacts();
    renderMessages();
    startBeaconTimer();
    updateTelemetry();
    switchMobileTab('chat');
}

// Map Logic
let map = null;
let currentMarker = null;
let selectedCoords = null;

function openMapModal() {
    document.getElementById('map-modal').classList.remove('hidden');

    if (!map) {
        // Initialize Map
        map = L.map('map').setView([3.1390, 101.6869], 10); // Default to KL

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        map.on('click', onMapClick);
    }

    // Invalidate size to ensure it renders correctly after being hidden
    setTimeout(() => {
        map.invalidateSize();
    }, 100);
}

function closeMapModal() {
    document.getElementById('map-modal').classList.add('hidden');
}

function onMapClick(e) {
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    currentMarker = L.marker(e.latlng).addTo(map);
    selectedCoords = e.latlng;

    document.getElementById('selected-coords').textContent =
        `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
    document.getElementById('confirm-location-btn').disabled = false;
}

function sendMapBeacon() {
    if (!selectedCoords) return;

    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        alert('Connect to APRS-IS first!');
        return;
    }

    const coords = {
        latitude: selectedCoords.lat,
        longitude: selectedCoords.lng
    };

    sendBeacon(coords);
    closeMapModal();
}

// Event Handlers
async function handleLogin(e) {
    e.preventDefault();
    elements.loginError.textContent = '';
    elements.loginError.classList.add('hidden');

    const callsign = document.getElementById('callsign').value.trim().toUpperCase();
    const passcode = document.getElementById('passcode').value.trim();

    if (!callsign || !passcode) return;

    state.callsign = callsign;
    state.passcode = passcode;

    // Save credentials
    localStorage.setItem('aprs_callsign', callsign);
    localStorage.setItem('aprs_passcode', passcode);

    connectWebSocket();
}

function handleLogout() {
    if (state.socket) {
        state.socket.close();
        state.socket = null;
    }
    elements.dashboard.classList.add('hidden');
    elements.loginOverlay.classList.remove('hidden');
    elements.connectionStatus.classList.remove('online');
}

// Cleanup on window close
window.addEventListener('beforeunload', () => {
    if (state.socket) {
        state.socket.close();
    }
});

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
        alert('Cannot send: Not connected to APRS-IS.');
        return;
    }

    const packet = generateMessagePacket(state.callsign, state.currentContact, content);
    // Send to APRS-IS
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(packet);
        logPacket(packet, 'send');

        // Update Telemetry
        state.messagesSent++;
        localStorage.setItem('aprs_msgs_sent', state.messagesSent);
        updateTelemetry();

        // Add to local state
        addMessageToState(state.currentContact, {
            source: state.callsign,
            content: content,
            type: 'sent',
            time: new Date().toLocaleTimeString()
        });

        elements.messageInput.value = '';
        renderMessages();
    }
}

// WebSocket Logic
function connectWebSocket() {
    try {
        state.socket = new WebSocket(APRS_CONFIG.SERVER);

        state.socket.onopen = () => {
            console.log('Connected to APRS-IS Gateway');
            logPacket('Connected to APRS-IS Gateway', 'system');

            const loginLine = generateLoginLine(state.callsign, state.passcode);
            state.socket.send(loginLine);
            logPacket(loginLine, 'send');

            // elements.loginOverlay.classList.add('hidden');
            // elements.dashboard.classList.remove('hidden');
            elements.displayCallsign.textContent = state.callsign;
            elements.connectionStatus.classList.add('online');
        };

        state.socket.onmessage = async (event) => {
            let data = event.data;
            if (data instanceof Blob) {
                data = await data.text();
            }

            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;

                const parsed = parsePacket(line);

                // Handle Login Response
                // Handle Login Response
                if (line.startsWith('# logresp')) {
                    if (line.includes(' verified') && !line.includes('unverified')) {
                        console.log('Login Verified');
                        elements.loginError.textContent = '';
                        elements.loginError.classList.add('hidden');
                        elements.loginOverlay.classList.add('hidden');
                        elements.dashboard.classList.remove('hidden');
                    } else {
                        console.error('Login Failed:', line);
                        elements.loginError.textContent = 'Login Failed: ' + line.split(' ').slice(2).join(' ');
                        elements.loginError.classList.remove('hidden');
                        state.socket.close();
                        alert('Login failed: ' + line); // Explicit user feedback
                    }
                }

                if (parsed && parsed.type === 'message') {
                    addMessageToState(parsed.source, {
                        source: parsed.source,
                        content: parsed.content,
                        type: 'received',
                        time: parsed.timestamp
                    });
                    state.messagesReceived++;
                    localStorage.setItem('aprs_msgs_received', state.messagesReceived);
                    updateTelemetry();
                    showToast(`New message from ${parsed.source}`, 'info');
                    renderMessages();
                    renderContacts();
                }
                console.log('RECV:', line);
                logPacket(line, 'recv');
            });
        };

        state.socket.onclose = () => {
            console.log('Disconnected from APRS-IS Gateway');
            logPacket('Disconnected from APRS-IS Gateway', 'system');
            elements.connectionStatus.classList.remove('online');

            // Only alert if we were expecting to be connected
            if (!elements.loginOverlay.classList.contains('hidden')) {
                // If we are still on the login screen, it's a failed connection attempt
                // But usually onerror catches the initial fail. 
                // This catches immediate disconnects after open.
            }
        };

        state.socket.onerror = (err) => {
            console.error('WebSocket Error:', err);
            alert('Unable to connect to APRS-IS Server (wss://ametx.com:8888). Check your internet or firewall.');
            elements.connectionStatus.classList.remove('online');
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

    msgs.forEach(msg => {
        const msgEl = document.createElement('div');
        msgEl.className = `message ${msg.type}`;
        msgEl.innerHTML = `
            <div class="msg-bubble">${msg.content}</div>
            <span class="time">${msg.time}</span>
        `;
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
                <span class="last-msg">${lastMsg ? lastMsg.content.substring(0, 30) : ''}</span>
            </div>
        `;

        li.onclick = () => {
            state.currentContact = contact;
            elements.currentChatName.textContent = contact;
            renderContacts();
            renderMessages();
        };

        elements.contactList.appendChild(li);
    });
}

// Settings Logic
function openSettings() {
    elements.settingsPasscode.value = state.passcode || localStorage.getItem('aprs_passcode') || '';
    elements.settingsBeaconInterval.value = state.beaconInterval;
    elements.customSymbolInput.value = state.symbol;
    elements.beaconCommentInput.value = state.beaconComment;
    renderSymbolGrid();
    elements.settingsModal.classList.remove('hidden');
}

function closeSettings() {
    elements.settingsModal.classList.add('hidden');
}

function handleSaveSettings() {
    const newPass = elements.settingsPasscode.value.trim();
    if (newPass) {
        state.passcode = newPass;
        localStorage.setItem('aprs_passcode', newPass);
    }

    // Check custom symbol input first, fall back to grid selection
    const customSymbol = elements.customSymbolInput.value.trim();
    if (customSymbol && customSymbol.length === 2) {
        state.symbol = customSymbol;
        elements.settingsSymbol.value = customSymbol;
    } else {
        const newSymbol = elements.settingsSymbol.value;
        state.symbol = newSymbol;
    }
    localStorage.setItem('aprs_symbol', state.symbol);

    // Save beacon comment
    const newComment = elements.beaconCommentInput.value.trim();
    if (newComment) {
        state.beaconComment = newComment;
        localStorage.setItem('aprs_beacon_comment', newComment);
    }

    const newInterval = parseInt(elements.settingsBeaconInterval.value);
    if (newInterval && newInterval > 0) {
        state.beaconInterval = newInterval;
        localStorage.setItem('aprs_beacon_interval', newInterval);
        startBeaconTimer();
    }

    closeSettings();
    showToast('Settings Saved Successfully!', 'success');
}

function renderSymbolGrid() {
    elements.symbolGrid.innerHTML = '';
    APRS_SYMBOLS.forEach(sym => {
        const el = document.createElement('div');
        el.className = `symbol-item ${state.symbol === sym.code ? 'selected' : ''}`;
        el.innerHTML = `
            <span class="symbol-char">${sym.code}</span>
            <span class="symbol-name">${sym.name}</span>
        `;
        el.onclick = () => selectSymbol(sym, el);
        elements.symbolGrid.appendChild(el);
    });
}

function selectSymbol(sym, el) {
    state.symbol = sym.code;
    elements.settingsSymbol.value = sym.code;
    elements.customSymbolInput.value = sym.code;
    elements.currentSymbolDisplay.textContent = sym.code;
    elements.currentSymbolName.textContent = sym.name;

    // Visual selection update
    document.querySelectorAll('.symbol-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
}

function handleDeleteChat() {
    const contact = state.currentContact;
    if (contact === 'APRS-IS') {
        showToast("You cannot delete the system channel.", 'error');
        return;
    }

    if (confirm(`Delete conversation with ${contact}? This cannot be undone.`)) {
        delete state.messages[contact];
        saveMessages();

        // Reset to system channel or first available
        state.currentContact = 'APRS-IS';
        elements.currentChatName.textContent = 'APRS-IS';

        renderContacts();
        renderMessages();
    }
}

function startBeaconTimer() {
    if (state.beaconTimer) {
        clearInterval(state.beaconTimer);
    }

    console.log(`Starting Beacon Timer: ${state.beaconInterval} mins`);

    state.beaconTimer = setInterval(() => {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
            console.log('Skipping auto-beacon: Not connected');
            return;
        }

        // Use last known selectedCoords or try to get GPS
        if (selectedCoords) {
            const coords = {
                latitude: selectedCoords.lat,
                longitude: selectedCoords.lng
            };
            sendBeacon(coords);
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    sendBeacon(pos.coords);
                },
                (err) => {
                    console.error('Auto-beacon GPS failed:', err);
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        }
    }, state.beaconInterval * 60 * 1000);
}

// GPS Logic
function handleManualGps() {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        showToast('Connect to APRS-IS first!', 'error');
        return;
    }

    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by this browser.', 'error');
        return;
    }

    elements.manualGpsBtn.textContent = 'Acquiring...';
    elements.radarStatus.textContent = 'ACQUIRING GPS...';

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            sendBeacon(pos.coords);
            elements.manualGpsBtn.textContent = 'SEND GPS NOW';
        },
        (err) => {
            console.error('GPS Error:', err);
            showToast('Failed to get location: ' + err.message, 'error');
            elements.manualGpsBtn.textContent = 'SEND GPS NOW';
            elements.radarStatus.textContent = 'GPS ERROR';
        },
        { enableHighAccuracy: true }
    );
}

function sendBeacon(coords) {
    try {
        const packet = generatePositionPacket(
            state.callsign,
            coords.latitude,
            coords.longitude,
            state.symbol,
            state.beaconComment
        );
        state.socket.send(packet);
        logPacket(packet, 'send');
        console.log('BEACON SENT:', packet);

        elements.radarStatus.textContent = `LAST BEACON: ${new Date().toLocaleTimeString()}`;
        elements.radarStatus.style.color = 'var(--success-green)';
    } catch (e) {
        console.error('Beacon encoding failed:', e);
        alert('Failed to encode beacon position.');
    }
}

function switchMobileTab(tabName) {
    // Update Nav Icons
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update View Visibility
    const views = {
        'chat': document.querySelector('.chat-area'),
        'contacts': document.querySelector('.sidebar'),
        'radar': document.querySelector('.radar-sidebar')
    };

    Object.keys(views).forEach(key => {
        if (key === tabName) {
            views[key].classList.add('active-tab');
        } else {
            views[key].classList.remove('active-tab');
        }
    });
}
// Legacy toggles removed/replaced


function logPacket(msg, type = 'system') {
    const div = document.createElement('div');
    div.className = `log-line ${type}`;
    div.textContent = msg.trim();
    elements.terminalOutput.appendChild(div);
    elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
}

// Toast Notification System
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.onclick = () => toast.remove();

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Update Telemetry Display
function updateTelemetry() {
    elements.msgSentCount.textContent = state.messagesSent;
    elements.msgReceivedCount.textContent = state.messagesReceived;
}

// Start
init();
