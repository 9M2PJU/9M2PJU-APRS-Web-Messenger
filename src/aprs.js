/**
 * APRS Logic Module
 * Handles packet generation and parsing for the APRS-IS network.
 */

export const APRS_CONFIG = {
    SERVER: 'wss://ametx.com:8888',
    SOFTWARE_NAME: '9M2PJU-WebMessenger',
    VERSION: '1.0.0'
};

/**
 * Generates the login line for APRS-IS.
 * Format: user CALLSIGN-SSID pass PASSCODE vers SoftwareName Version
 */
export function generateLoginLine(callsign, passcode) {
    return `user ${callsign.toUpperCase()} pass ${passcode} vers ${APRS_CONFIG.SOFTWARE_NAME} ${APRS_CONFIG.VERSION}\r\n`;
}

/**
 * Generates an APRS message packet.
 * Format: SOURCE>DEST,PATH::DESTINATION:MESSAGE
 * Note: DESTINATION must be 9 characters, padded with spaces.
 */
export function generateMessagePacket(source, destination, message) {
    const destPadded = destination.toUpperCase().padEnd(9, ' ');
    return `${source.toUpperCase()}>APJUMB,TCPIP*::${destPadded}:${message}\r\n`;
}

/**
 * Parses an incoming APRS-IS line.
 * Currently focuses on extracting messages.
 * Format: SOURCE>DEST,PATH::TARGET:MESSAGE
 */
export function parsePacket(line) {
    if (!line || line.startsWith('#')) return null; // Ignore server comments

    // Look for message packets (indicated by ::)
    const msgMatch = line.match(/^([^>]+)>[^:]+::([^:]+):(.*)$/);
    if (msgMatch) {
        const [, source, target, message] = msgMatch;
        return {
            type: 'message',
            source: source.trim(),
            target: target.trim(),
            content: message.trim(),
            timestamp: new Date().toLocaleTimeString()
        };
    }

    return { type: 'other', raw: line };
}
