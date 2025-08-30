// Username of someone who is currently live
import { TikTokLiveConnection, WebcastEvent,SignConfig  } from 'tiktok-live-connector';
import { emitter } from '../Emitter';
// Store active TikTok live connections
const CurrentLiveMap = new Map<string, TikTokLiveConnection>();
SignConfig.apiKey = '854cb33a3a8711f090fa6edfeb500713854cb33d3a8711f090fa6edfeb500713'; // An API key created at https://www.eulerstream.com
// Export available TikTok events
export const TiktokEventsArray = Object.values(WebcastEvent) as (typeof WebcastEvent[keyof typeof WebcastEvent])[];
/**
 * Creates a new TikTok live connection
 * @param tiktokUsername The username to connect to
 * @returns TikTokLiveConnection instance
 */
async function createLive(tiktokUsername: string): Promise<TikTokLiveConnection> {
    try {
        const connection = new TikTokLiveConnection(tiktokUsername);
        const state = await connection.connect();
        console.info(`Connected to roomId ${state.roomId}`);
        emitter.emit('tiktok:connected', {
            tiktokUsername,
            roomId: state.roomId,
            state
        })
        TiktokEventsArray.forEach(event => {
            connection.on(event as WebcastEvent, (data: any) => {
                emitter.emit('tiktok:event', {
                    tiktokUsername,
                    event,
                    eventType: event,
                    data
                })
            })
        })
        return connection;
    } catch (err) {
        console.error('Failed to connect:', err);
        emitter.emit('tiktok:disconnected', {
            tiktokUsername,
            state: 'DISCONNECTED',
        })
        throw err;
    }
}

/**
 * Gets an existing live connection for a username
 * @param tiktokUsername The username to look up
 * @returns The live connection if it exists, undefined otherwise
 */
export function getLive(tiktokUsername: string): TikTokLiveConnection | undefined {
    return CurrentLiveMap.get(tiktokUsername);
}

/**
 * Creates a new live connection if one doesn't exist
 * @param tiktokUsername The username to connect to
 * @returns Promise that resolves when connection is established
 */
export async function createLiveIfNotExist(tiktokUsername: string): Promise<void> {
    if (!CurrentLiveMap.has(tiktokUsername)) {
        const connection = await createLive(tiktokUsername);
        CurrentLiveMap.set(tiktokUsername, connection);
    }
}

/**
 * Disconnects and removes a live connection
 * @param tiktokUsername The username to disconnect
 */
export function disconnectLive(tiktokUsername: string): void {
    const connection = getLive(tiktokUsername);
    if (connection) {
        connection.disconnect();
        CurrentLiveMap.delete(tiktokUsername);
        emitter.emit('tiktok:disconnected', {
            tiktokUsername,
            roomId: connection.roomId,
        })
        TiktokEventsArray.forEach(event => {
            connection.off(event as WebcastEvent, (data: any) => {
                emitter.emit('tiktok:event', {
                    tiktokUsername,
                    event,
                    data
                })
            })
        })
    }
}

// Export functions as a single object
export const TiktokFunctions = {
    createLiveIfNotExist,
    disconnectLive,
    getLive,
} as const;
