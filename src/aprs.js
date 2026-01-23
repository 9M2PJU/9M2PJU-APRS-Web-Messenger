/**
 * APRS Logic Module
 * Handles packet generation and parsing for the APRS-IS network.
 */

export const APRS_CONFIG = {
    SERVER: 'wss://ametx.com:8888',
    SOFTWARE_NAME: '9M2PJU-Web-APRS-Messenger',
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
 * Generates a random 5-character alphanumeric ID for APRS messages.
 */
export function generateMessageId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

/**
 * Generates an APRS message packet.
 * Format: SOURCE>DEST,PATH::DESTINATION:MESSAGE{ID
 * Note: DESTINATION must be 9 characters, padded with spaces.
 */
export function generateMessagePacket(source, destination, message, msgId = null) {
    const destPadded = destination.toUpperCase().padEnd(9, ' ');
    const idPart = msgId ? `{${msgId}` : '';
    // Limit message length if needed, but for now just append
    return `${source.toUpperCase()}>APJUMB,TCPIP*::${destPadded}:${message}${idPart}\r\n`;
}

/**
 * Generates an APRS ACK packet.
 * Format: SOURCE>DEST,PATH::DESTINATION:ackID
 */
export function generateAckPacket(source, destination, ackId) {
    const destPadded = destination.toUpperCase().padEnd(9, ' ');
    return `${source.toUpperCase()}>APJUMB,TCPIP*::${destPadded}:ack${ackId}\r\n`;
}

/**
 * Parses an incoming APRS-IS line.
 * Handles Messages (::) and extracts ID if present.
 */
export function parsePacket(line) {
    if (!line || line.startsWith('#')) return null;

    // Look for message packets (indicated by ::)
    // Regex breakdown:
    // ^([^>]+)     : Source
    // >[^:]+::     : Path separator and "::"
    // ([^:]+)      : Target (Destination)
    // :(.*)$       : Message Content

    // Note: This simple regex might need refinement for complex paths, but is standard for APRS-IS msgs
    const msgMatch = line.match(/^([^>]+)>[^:]+::([^:]+):(.*)$/);
    if (msgMatch) {
        const [, source, target, rawContent] = msgMatch;
        let content = rawContent.trim();
        let msgId = null;
        let isAck = false;

        // Check for ACK
        if (content.startsWith('ack') && content.length <= 8) {
            isAck = true;
            msgId = content.substring(3);
        } else {
            // Check for Message ID at end ({xxxxx)
            const idMatch = content.match(/\{([A-Z0-9]{1,5})$/);
            if (idMatch) {
                msgId = idMatch[1];
                // Strip ID from content for display
                content = content.substring(0, idMatch.index);
            }
        }

        return {
            type: isAck ? 'ack' : 'message',
            source: source.trim(),
            target: target.trim(),
            content: content,
            msgId: msgId, // The ID to ACK (if message) or the ID being ACKed (if type is ack)
            timestamp: new Date().toLocaleTimeString()
        };
    }

    return { type: 'other', raw: line };
}

/**
 * Encodes coordinates into APRS DDMM.hh format.
 * Latitude: DDMM.hhN (2+2.2 chars + Dir)
 * Longitude: DDDMM.hhW (3+2.2 chars + Dir)
 */
function encodePosition(lat, lon) {
    const format = (val, isLat) => {
        const absVal = Math.abs(val);
        const deg = Math.floor(absVal);
        const min = (absVal - deg) * 60;

        // Pad degrees: 2 digits for Lat, 3 for Lon
        const degStr = deg.toString().padStart(isLat ? 2 : 3, '0');
        // Pad minutes: "08.50"
        const minStr = min.toFixed(2).padStart(5, '0');

        const dir = isLat
            ? (val >= 0 ? 'N' : 'S')
            : (val >= 0 ? 'E' : 'W');

        return `${degStr}${minStr}${dir}`;
    };
    return {
        lat: format(lat, true),
        lon: format(lon, false)
    };
}

/**
 * Generates an APRS position packet (Beacon).
 * Format: SOURCE>APJUMB,TCPIP*:!LAT(Table)LON(Symbol)COMMENT
 * Example: 9M2PJU>...>...!0310.50N/10140.20E>My Beacon
 */
export function generatePositionPacket(source, lat, lon, symbolCode = '/>', comment = '') {
    const pos = encodePosition(lat, lon);
    const table = symbolCode.charAt(0);
    const symbol = symbolCode.charAt(1);
    return `${source.toUpperCase()}>APJUMB,TCPIP*:!${pos.lat}${table}${pos.lon}${symbol}${comment}\r\n`;
}
