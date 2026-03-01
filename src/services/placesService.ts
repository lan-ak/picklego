import { Coordinates } from '../types';
import { GOOGLE_PLACES_API_KEY, PLACES_BASE_URL, DEFAULT_SEARCH_RADIUS } from './constants';

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  coords?: Coordinates;
}

export interface PlaceDetails extends PlaceResult {
  coords: Coordinates;
  phoneNumber?: string;
  rating?: number;
}

interface AutocompleteResponse {
  predictions: Array<{
    place_id: string;
    description: string;
    structured_formatting: {
      main_text: string;
      secondary_text: string;
    };
  }>;
  status: string;
}

interface PlaceDetailsResponse {
  result: {
    place_id: string;
    name: string;
    formatted_address: string;
    geometry: {
      location: { lat: number; lng: number };
    };
    formatted_phone_number?: string;
    rating?: number;
  };
  status: string;
}

interface NearbySearchResponse {
  results: Array<{
    place_id: string;
    name: string;
    vicinity: string;
    geometry: {
      location: { lat: number; lng: number };
    };
    rating?: number;
  }>;
  status: string;
}

export async function searchPlaces(
  query: string,
  location?: Coordinates
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    input: query,
    key: GOOGLE_PLACES_API_KEY,
  });

  if (location) {
    params.append('location', `${location.latitude},${location.longitude}`);
    params.append('radius', String(DEFAULT_SEARCH_RADIUS));
  }

  const response = await fetch(
    `${PLACES_BASE_URL}/autocomplete/json?${params.toString()}`
  );
  const data: AutocompleteResponse = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places Autocomplete failed: ${data.status}`);
  }

  return (data.predictions || []).map((p) => ({
    placeId: p.place_id,
    name: p.structured_formatting.main_text,
    address: p.description,
  }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'place_id,name,formatted_address,geometry,formatted_phone_number,rating',
    key: GOOGLE_PLACES_API_KEY,
  });

  const response = await fetch(
    `${PLACES_BASE_URL}/details/json?${params.toString()}`
  );
  const data: PlaceDetailsResponse = await response.json();

  if (data.status !== 'OK') {
    throw new Error(`Place Details failed: ${data.status}`);
  }

  const r = data.result;
  return {
    placeId: r.place_id,
    name: r.name,
    address: r.formatted_address,
    coords: {
      latitude: r.geometry.location.lat,
      longitude: r.geometry.location.lng,
    },
    phoneNumber: r.formatted_phone_number,
    rating: r.rating,
  };
}

export async function searchNearbyCourts(
  location: Coordinates,
  radius: number = DEFAULT_SEARCH_RADIUS
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    location: `${location.latitude},${location.longitude}`,
    radius: String(radius),
    keyword: 'pickleball court',
    key: GOOGLE_PLACES_API_KEY,
  });

  const response = await fetch(
    `${PLACES_BASE_URL}/nearbysearch/json?${params.toString()}`
  );
  const data: NearbySearchResponse = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Nearby Search failed: ${data.status}`);
  }

  return (data.results || []).map((r) => ({
    placeId: r.place_id,
    name: r.name,
    address: r.vicinity,
    coords: {
      latitude: r.geometry.location.lat,
      longitude: r.geometry.location.lng,
    },
  }));
}
