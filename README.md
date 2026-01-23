# 9M2PJU APRS Web Messenger

> A premium, glassmorphism-styled web interface for real-time APRS messaging and beaconing.

![License](https://img.shields.io/badge/License-MIT-blue.svg) ![Version](https://img.shields.io/badge/Version-1.2.0-green.svg) ![Status](https://img.shields.io/badge/Status-Active-success.svg)

## Overview

APRS Web Messenger is a modern, responsive web application designed for Amateur Radio operators to connect to the **APRS-IS** network. It features a stunning glassmorphism UI/UX, real-time messaging capabilities with **standard-compliant ACKs**, and an integrated map for beacon transmission.

## Features

- **Real-Time Messaging**: Send and receive APRS messages instantly via APRS-IS with **delivery confirmation**.
- **Mobile Native Experience**: persistent bottom navigation and full-screen layout for mobile.
- **Glassmorphism Design**: sleek, modern interface with transparency and blur effects.
- **Map Beaconing**:  Interact with a Leaflet-powered map to select and transmit your location.
- **Mobile Responsive**:  Fully optimized for both desktop and mobile devices.
- **Raw Packet Terminal**: View the raw APRS packet stream for debugging and transparency.
- **Contact Management**: Easily manage your frequent contacts.
- **Secure Connection**:  Uses WebSocket (SSL) for secure communication with APRS-IS gateways.

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge).
- An Amateur Radio Callsign and a valid **APRS-IS Passcode**.
  - *Don't have a passcode? [Generate one here](https://pass.hamradio.my).*

### Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/9M2PJU-APRS-Web-Messenger.git
    cd 9M2PJU-APRS-Web-Messenger
    ```

2.  **Run Locally**
    Open `index.html` in your browser.
    *Note: For best results with modules, serve via a local server (e.g., Live Server in VS Code or `python3 -m http.server`).*

## Usage

1.  **Login**: Enter your **Callsign** (e.g., 9M2PJU-1) and **Passcode**.
2.  **Messaging**: Select a contact (or add a new one) and start chatting.
3.  **Beaconing**:
    - Click "SEND GPS NOW" to use your device's GPS.
    - Click "Select on Map" to pick a custom location on the map.
4.  **Settings**: Customize your APRS symbol and update your credentials.

## Technology Stack

- **HTML5 & CSS3** (Custom Properties, Flexbox, Grid)
- **Vanilla JavaScript** (ES6 Modules)
- **Leaflet.js** (Map Integation)
- **WebSocket API**

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

---
*73, 9M2PJU*
