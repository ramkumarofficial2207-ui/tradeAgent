import { KiteConnect } from 'kiteconnect';
import 'dotenv/config';

// Initialize Kite Connect
const apiKey = process.env.KITE_API_KEY || '';
const apiSecret = process.env.KITE_API_SECRET || '';

export const kite = new KiteConnect({
    api_key: apiKey
});

let currentAccessToken: string | null = null;

export function getKiteLoginUrl(): string {
    return kite.getLoginURL();
}

/**
 * Validates the request token and generates an access token.
 */
export async function generateKiteSession(requestToken: string): Promise<boolean> {
    try {
        const response = await kite.generateSession(requestToken, apiSecret);
        currentAccessToken = response.access_token;
        kite.setAccessToken(currentAccessToken);
        
        console.log('[KiteConnect] Session generated successfully.');
        return true;
    } catch (e: any) {
        console.error('[KiteConnect] Failed to generate session:', e.message);
        return false;
    }
}

/**
 * Checks if the server already has a valid access token for today.
 */
export function initializeKiteSession(): boolean {
    const accessToken = process.env.KITE_ACCESS_TOKEN?.trim();
    if (accessToken) {
        currentAccessToken = accessToken;
        kite.setAccessToken(accessToken);
        console.log('[KiteConnect] Loaded access token from the server environment.');
        return true;
    }
    console.log('[KiteConnect] No access token configured. OAuth login is required.');
    return false;
}

/**
 * Gets the raw Kite client (must be initialized first)
 */
export function getKiteClient() {
    return kite;
}

export function isKiteAuthenticated(): boolean {
    return currentAccessToken !== null;
}
