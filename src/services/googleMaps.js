/**
 * Google Maps API Services
 * 
 * NOTE: We use the JavaScript libraries instead of REST APIs to avoid CORS issues.
 * The Places API and Distance Matrix API must be enabled in Google Cloud Console.
 */

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY;

/**
 * Search for places using Google Places JavaScript API (PlacesService)
 * This requires the map instance to be passed in
 * @param {google.maps.Map} map - Google Maps instance
 * @param {string} query - Search query (e.g., "Planet Fitness")
 * @param {Object} location - Current location {lat, lng}
 * @param {number} radius - Search radius in meters (default: 50000 = 50km)
 * @returns {Promise<Array>} Array of place results
 */
// 10 miles in meters = 16093.4 meters
const DEFAULT_SEARCH_RADIUS = 16093;

export const searchPlaces = (map, query, location, radius = DEFAULT_SEARCH_RADIUS) => {
  console.log('[Google Maps] Searching places using Places API (new):', { query, location, radius: `${(radius / 1609.34).toFixed(1)} miles` });
  
  if (!window.google || !window.google.maps) {
    const errorMsg = 'Google Maps JavaScript API is not loaded. Make sure LoadScript has loaded the API.';
    console.error('[Google Maps]', errorMsg);
    throw new Error(errorMsg);
  }

  if (!GOOGLE_PLACES_API_KEY || GOOGLE_PLACES_API_KEY === 'your_google_places_api_key_here') {
    const errorMsg = 'Google Places API key is not configured. Please add VITE_GOOGLE_MAPS_API_KEY to your .env.local file.';
    console.error('[Google Maps]', errorMsg);
    throw new Error(errorMsg);
  }

  // NOTE: As of March 1st, 2025, google.maps.places.PlacesService is not available to new customers.
  // We use the new Places API via google.maps.places.Place.searchByText instead.
  return (async () => {
    try {
      // Ensure the new Places library symbols are available.
      // (LoadScript with libraries=['places'] should already do this; importLibrary is an extra-safe path.)
      const { Place } = await window.google.maps.importLibrary('places');

      const request = {
        textQuery: query,
        // Bias results around the user's/search center.
        locationBias: {
          center: new window.google.maps.LatLng(location.lat, location.lng),
          radius,
        },
        // Request only what we need to keep payload small.
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'rating',
          'userRatingCount',
          'types',
        ],
      };

      console.log('[Google Maps] Place.searchByText request:', request);

      const response = await Place.searchByText(request);
      const places = response?.places || [];

      console.log('[Google Maps] Place.searchByText results count:', places.length);

      const formattedResults = places
        .map((place) => {
          const loc = place.location;
          const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
          const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;

          return {
            place_id: place.id || place.place_id || '',
            name:
              place.displayName?.text ||
              place.displayName ||
              place.name ||
              '',
            formatted_address: place.formattedAddress || '',
            geometry: {
              location: {
                lat: typeof lat === 'number' ? lat : null,
                lng: typeof lng === 'number' ? lng : null,
              },
            },
            rating: place.rating,
            user_ratings_total: place.userRatingCount,
            // Legacy shape used by the UI; best available equivalent is formatted address.
            vicinity: place.formattedAddress || '',
            types: place.types,
          };
        })
        .filter((p) => typeof p.geometry.location.lat === 'number' && typeof p.geometry.location.lng === 'number');

      console.log('[Google Maps] Successfully found', formattedResults.length, 'places');
      return formattedResults;
    } catch (error) {
      console.error('[Google Maps] Places search failed (new Places API):', error);
      throw error;
    }
  })();
};

/**
 * Geocode an address to coordinates using Geocoder
 * @param {string} address - Address to geocode
 * @returns {Promise<{lat: number, lng: number}>}
 */
export const geocodeAddress = (address) => {
  console.log('[Google Maps] Geocoding address:', address);
  
  if (!window.google || !window.google.maps) {
    const errorMsg = 'Google Maps JavaScript API is not loaded.';
    console.error('[Google Maps]', errorMsg);
    throw new Error(errorMsg);
  }

  return new Promise((resolve, reject) => {
    const geocoder = new window.google.maps.Geocoder();
    
    geocoder.geocode({ address }, (results, status) => {
      if (status === window.google.maps.GeocoderStatus.OK && results && results.length > 0) {
        const location = results[0].geometry.location;
        const result = {
          lat: location.lat(),
          lng: location.lng(),
        };
        console.log('[Google Maps] Geocoded to:', result);
        resolve(result);
      } else {
        const errorMsg = `Geocoding error: ${status}`;
        console.error('[Google Maps]', errorMsg);
        reject(new Error(errorMsg));
      }
    });
  });
};

/**
 * Calculate driving distance and duration between two points using DistanceMatrixService
 * @param {Object} origin - {lat, lng}
 * @param {Object} destination - {lat, lng}
 * @returns {Promise<{distance: string, duration: string, distanceValue: number, durationValue: number}>}
 */
export const getDrivingDistance = (origin, destination) => {
  console.log('[Google Maps] Calculating distance:', { origin, destination });
  
  if (!window.google || !window.google.maps) {
    const errorMsg = 'Google Maps JavaScript API is not loaded.';
    console.error('[Google Maps]', errorMsg);
    throw new Error(errorMsg);
  }

  return new Promise((resolve, reject) => {
    const service = new window.google.maps.DistanceMatrixService();
    
    service.getDistanceMatrix(
      {
        origins: [new window.google.maps.LatLng(origin.lat, origin.lng)],
        destinations: [new window.google.maps.LatLng(destination.lat, destination.lng)],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      },
      (response, status) => {
        if (status === window.google.maps.DistanceMatrixStatus.OK) {
          const element = response.rows[0].elements[0];
          if (element.status === window.google.maps.DistanceMatrixElementStatus.OK) {
            const result = {
              distance: element.distance.text,
              duration: element.duration.text,
              distanceValue: element.distance.value, // in meters
              durationValue: element.duration.value, // in seconds
            };
            console.log('[Google Maps] Distance calculated:', result);
            resolve(result);
          } else {
            const errorMsg = `Distance calculation failed: ${element.status}`;
            console.error('[Google Maps]', errorMsg);
            reject(new Error(errorMsg));
          }
        } else {
          const errorMsg = `Distance Matrix API error: ${status}`;
          console.error('[Google Maps]', errorMsg);
          reject(new Error(errorMsg));
        }
      }
    );
  });
};

/**
 * Get multiple driving distances from origin to multiple destinations
 * @param {Object} origin - {lat, lng}
 * @param {Array} destinations - Array of {lat, lng}
 * @returns {Promise<Array>} Array of distance results
 */
export const getMultipleDistances = (origin, destinations) => {
  console.log('[Google Maps] Calculating distances for multiple destinations:', { 
    origin, 
    destinationCount: destinations.length 
  });
  
  if (!window.google || !window.google.maps) {
    const errorMsg = 'Google Maps JavaScript API is not loaded.';
    console.error('[Google Maps]', errorMsg);
    throw new Error(errorMsg);
  }

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here') {
    const errorMsg = 'Google Maps API key is not configured.';
    console.error('[Google Maps]', errorMsg);
    throw new Error(errorMsg);
  }

  return new Promise((resolve, reject) => {
    const service = new window.google.maps.DistanceMatrixService();
    
    const destLatLngs = destinations.map(
      (d) => new window.google.maps.LatLng(d.lat, d.lng)
    );
    
    service.getDistanceMatrix(
      {
        origins: [new window.google.maps.LatLng(origin.lat, origin.lng)],
        destinations: destLatLngs,
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      },
      (response, status) => {
        console.log('[Google Maps] Distance matrix response status:', status);
        
        if (status === window.google.maps.DistanceMatrixStatus.OK) {
          const results = response.rows[0].elements.map((element, index) => ({
            destination: destinations[index],
            distance: element.status === window.google.maps.DistanceMatrixElementStatus.OK 
              ? element.distance.text 
              : 'N/A',
            duration: element.status === window.google.maps.DistanceMatrixElementStatus.OK 
              ? element.duration.text 
              : 'N/A',
            distanceValue: element.status === window.google.maps.DistanceMatrixElementStatus.OK 
              ? element.distance.value 
              : null,
            durationValue: element.status === window.google.maps.DistanceMatrixElementStatus.OK 
              ? element.duration.value 
              : null,
            status: element.status,
          }));
          console.log('[Google Maps] Successfully calculated distances for', results.length, 'destinations');
          resolve(results);
        } else {
          const errorMsg = `Distance Matrix API error: ${status}`;
          console.error('[Google Maps]', errorMsg);
          console.error('[Google Maps] Status details:', {
            status,
            statusNames: {
              INVALID_REQUEST: window.google.maps.DistanceMatrixStatus.INVALID_REQUEST,
              MAX_ELEMENTS_EXCEEDED: window.google.maps.DistanceMatrixStatus.MAX_ELEMENTS_EXCEEDED,
              MAX_DESTINATIONS_EXCEEDED: window.google.maps.DistanceMatrixStatus.MAX_DESTINATIONS_EXCEEDED,
              OVER_QUERY_LIMIT: window.google.maps.DistanceMatrixStatus.OVER_QUERY_LIMIT,
              REQUEST_DENIED: window.google.maps.DistanceMatrixStatus.REQUEST_DENIED,
              UNKNOWN_ERROR: window.google.maps.DistanceMatrixStatus.UNKNOWN_ERROR,
            },
          });
          reject(new Error(errorMsg));
        }
      }
    );
  });
};
