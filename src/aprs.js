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
