// Google Places API key — loaded from EXPO_PUBLIC_GOOGLE_PLACES_API_KEY env var
// Set this in your .env file (see .env.example)
export const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';

export const PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
export const DEFAULT_SEARCH_RADIUS = 10000; // 10km in meters
