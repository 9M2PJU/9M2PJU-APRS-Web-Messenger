import { generateLoginLine, generateMessagePacket, parsePacket, APRS_CONFIG } from './aprs.js';

// Application State
const state = {
    socket: null,
    callsign: '',
    passcode: '',
    currentContact: 'APRS-IS',
    messages: loadMessages() || {
        'APRS-IS': [
            { source: 'System', content: 'Welcome to APRS Web Messenger. Connect to start messaging!', type: 'received', time: 'Now' }
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
    addContactBtn: document.getElementById('add-contact-btn')
};

// Initialization
function init() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.messageForm.addEventListener('submit', handleSendMessage);
    elements.logoutBtn.addEventListener('click', handleLogout);
    elements.addContactBtn.addEventListener('click', handleAddContact);

    // Check if we have saved credentials
    const savedCall = localStorage.getItem('aprs_callsign');
    const savedPass = localStorage.getItem('aprs_passcode');
    if (savedCall && savedPass) {
        document.getElementById('callsign').value = savedCall;
        document.getElementById('passcode').value = savedPass;
    }

    renderContacts();
    renderMessages();
}

// Event Handlers
async function handleLogin(e) {
    e.preventDefault();
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
    }
    state.socket = null;
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
    e.preventDefault();
    const content = elements.messageInput.value.trim();
    if (!content || !state.socket || state.socket.readyState !== WebSocket.OPEN) return;

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
            console.log('Connected to APRS-IS Gateway');
            const loginLine = generateLoginLine(state.callsign, state.passcode);
            state.socket.send(loginLine);

            elements.loginOverlay.classList.add('hidden');
            elements.dashboard.classList.remove('hidden');
            elements.displayCallsign.textContent = state.callsign;
            elements.connectionStatus.classList.add('online');
        };

        state.socket.onmessage = (event) => {
            const lines = event.data.toString().split('\n');
            lines.forEach(line => {
                if (!line.trim()) return;

                const parsed = parsePacket(line);
                if (parsed && parsed.type === 'message') {
                    addMessageToState(parsed.source, {
                        source: parsed.source,
                        content: parsed.content,
                        type: 'received',
                        time: parsed.timestamp
                    });
                    renderMessages();
                    renderContacts();
                }
                console.log('RECV:', line);
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

// Start
init();
