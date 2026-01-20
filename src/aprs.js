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
 * Encodes decimal coordinates to APRS format (DDMM.hhN / DDDMM.hhE)
 */
export function encodePosition(lat, lon) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const latAbs = Math.abs(lat);
    const latDeg = Math.floor(latAbs);
    const latMin = ((latAbs - latDeg) * 60).toFixed(2).padStart(5, '0');
    const latPadded = latDeg.toString().padStart(2, '0') + latMin + latDir;

    const lonDir = lon >= 0 ? 'E' : 'W';
    const lonAbs = Math.abs(lon);
    const lonDeg = Math.floor(lonAbs);
    const lonMin = ((lonAbs - lonDeg) * 60).toFixed(2).padStart(5, '0');
    const lonPadded = lonDeg.toString().padStart(3, '0') + lonMin + lonDir;

    return { lat: latPadded, lon: lonPadded };
}

/**
 * Generates an APRS position packet (lat/lon + symbol + comment)
 * Format: SOURCE>APRS,TCPIP*:!LAT/LON[COMMENT
 * ! = No messaging capability (in this specific format)
 * symbolKey = The symbol character (e.g. [ for jogger, > for car)
 * table = / or \ for primary/secondary table
 */
export function generatePositionPacket(source, lat, lon, symbol = '[', table = '/', comment = '') {
    const pos = encodePosition(lat, lon);
    return `${source.toUpperCase()}>APJUMB,TCPIP*:!${pos.lat}${table}${pos.lon}${symbol}${comment}\r\n`;
}
