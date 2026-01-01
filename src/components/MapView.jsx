import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GoogleMap, InfoWindow, useJsApiLoader } from '@react-google-maps/api';
import { getCurrentLocation } from '../services/geolocation';
import { searchPlaces, getMultipleDistances, geocodeAddress } from '../services/googleMaps';
import { getChargersForLocations, parseChargerData } from '../services/openChargeMap';
import { calculateDistance, calculateWalkingTime, walkingTimeToDistanceKm } from '../utils/distance';
import FilterPanel from './FilterPanel';
import LocationCard from './LocationCard';
import '../styles/mapView.css';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
const GOOGLE_MAPS_LIBRARIES = ['places'];

const mapContainerStyle = {
  width: '100%',
  height: '100vh',
};

const defaultCenter = {
  lat: 37.7749,
  lng: -122.4194, // San Francisco default
};

const MapView = ({ searchData, onBack }) => {
  const searchQuery = searchData?.query || '';
  const mapsKeyMissing =
    !GOOGLE_MAPS_API_KEY ||
    GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here' ||
    GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here\n';

  const { isLoaded: isMapsLoaded, loadError: mapsLoadError } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
    // Needed for the new Places API (Place.searchByText / importLibrary('places')).
    version: 'beta',
  });

  const [map, setMap] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [places, setPlaces] = useState([]);
  const [chargers, setChargers] = useState([]);
  const [filteredChargers, setFilteredChargers] = useState([]);
  const [distances, setDistances] = useState({});
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedCharger, setSelectedCharger] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [chargerPanelOpen, setChargerPanelOpen] = useState(false);
  const [filters, setFilters] = useState({
    operational: false, // false = show all, true = show operational only
    access: 'all',
    cost: 'all',
    speed: 'all',
    connectors: [],
    walkingTime: 5,
    searchRadius: 10,
  });
  const mapRef = useRef(null);
  const [searchCenter, setSearchCenter] = useState(null);
  const isInitialMount = useRef(true);
  const previousPlacesSignature = useRef('');
  const markersRef = useRef({ user: null, places: new Map(), chargers: new Map() });
  const [markerMode, setMarkerMode] = useState('pending'); // 'pending' | 'advanced' | 'legacy'
  const [isMobile, setIsMobile] = useState(false);
  const [isLocationsSidebarMinimized, setIsLocationsSidebarMinimized] = useState(true);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
      // On mobile, start minimized; on desktop, always expanded
      if (window.innerWidth <= 768) {
        setIsLocationsSidebarMinimized(true);
      } else {
        setIsLocationsSidebarMinimized(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Toggle sidebar minimize/expand
  const toggleLocationsSidebar = useCallback(() => {
    setIsLocationsSidebarMinimized((prev) => !prev);
  }, []);

  // Initialize map
  const onMapLoad = useCallback((mapInstance) => {
    mapRef.current = mapInstance;
    setMap(mapInstance);
  }, []);

  // Load initial data when map is ready

  // Function to load data from a specific location
  const loadDataFromLocation = useCallback(async (centerLocation) => {
    if (!isMapsLoaded || !mapRef.current || !window.google || !window.google.maps || !searchQuery) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // Safety watchdog so the UI never hangs indefinitely if an upstream promise stalls.
    const watchdog = setTimeout(() => {
      console.warn('[MapView] loadDataFromLocation timed out after 15s');
      setError('Taking too long to load results. Please retry or adjust your search.');
      setIsLoading(false);
    }, 15000);

    try {
      // Search for places using PlacesService (requires map instance)
      // Use search radius from filters (default 2 miles)
      const searchRadiusMeters = (filters.searchRadius || 2) * 1609.34; // Convert miles to meters
      const placeResults = await searchPlaces(mapRef.current, searchQuery, centerLocation, searchRadiusMeters);
      
      if (placeResults.length === 0) {
        setError('No locations found. Try a different search or move the map to a different area.');
        setIsLoading(false);
        return;
      }

      // Get distances from center location to each place
      const placeLocations = placeResults.map((p) => ({
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
      }));

      const distanceResults = await getMultipleDistances(centerLocation, placeLocations);
      const distanceMap = {};
      placeResults.forEach((place, index) => {
        distanceMap[place.place_id] = distanceResults[index];
      });
      setDistances(distanceMap);

      // Filter places to only include those within the search radius
      // The Places API may return results outside the radius, so we filter them out
      const placesWithinRadius = placeResults.filter((place) => {
        const distanceValue = distanceMap[place.place_id]?.distanceValue;
        // Keep places that are within the search radius (or if distance calculation failed, keep them)
        return distanceValue === null || distanceValue <= searchRadiusMeters;
      });

      // Check if we have any places within the radius after filtering
      if (placesWithinRadius.length === 0) {
        setError(`No locations found within ${filters.searchRadius || 2} miles. Try increasing the search radius or moving to a different area.`);
        setIsLoading(false);
        return;
      }

      // Sort places by distance (closest first)
      const sortedPlaces = [...placesWithinRadius].sort((a, b) => {
        const distA = distanceMap[a.place_id]?.distanceValue || Infinity;
        const distB = distanceMap[b.place_id]?.distanceValue || Infinity;
        return distA - distB;
      });
      setPlaces(sortedPlaces);

      // Get chargers near each place (within walking time)
      const walkingTimeMinutes = filters.walkingTime || 5;
      const walkingDistanceKm = walkingTimeToDistanceKm(walkingTimeMinutes);
      const apiFilters = {};
      if (filters.cost === 'free') apiFilters.free = true;
      else if (filters.cost === 'paid') apiFilters.free = false;
      if (filters.speed && filters.speed !== 'all') apiFilters.speed = filters.speed;

      const chargerResults = await getChargersForLocations(placeLocations, walkingDistanceKm, apiFilters);
      
      // Combine all chargers and parse them, filtering by walking time
      const allChargers = [];
      chargerResults.forEach((locationChargers, index) => {
        const placeLocation = placeLocations[index];
        const parsedChargers = locationChargers
          .map(parseChargerData)
          .filter((charger) => {
            // Filter chargers within walking time
            const distanceKm = calculateDistance(placeLocation, charger.location);
            return distanceKm <= walkingDistanceKm;
          });
        
        parsedChargers.forEach((charger) => {
          charger.placeId = placeResults[index].place_id;
          charger.distanceFromPlace = calculateDistance(placeLocation, charger.location);
        });
        allChargers.push(...parsedChargers);
      });

      setChargers(allChargers);
      setFilteredChargers(allChargers);

      // Update places with charger counts (only within walking distance)
      const updatedPlaces = sortedPlaces.map((place) => {
        const placeChargers = allChargers.filter((c) => c.placeId === place.place_id);
        return {
          ...place,
          chargerCount: placeChargers.length,
        };
      });
      setPlaces(updatedPlaces);

      // Fit map bounds to show all filtered places, chargers, and center location
      if (mapRef.current && updatedPlaces.length > 0 && window.google && window.google.maps) {
        const bounds = new window.google.maps.LatLngBounds();
        
        // Include the search center location
        bounds.extend(centerLocation);
        
        // Include all filtered places
        updatedPlaces.forEach((place) => {
          bounds.extend({
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
          });
        });
        
        // Include all charger locations (they're already filtered by walking distance)
        allChargers.forEach((charger) => {
          bounds.extend(charger.location);
        });
        
        // Fit bounds to show everything, allowing zoom out as needed
        mapRef.current.fitBounds(bounds, {
          padding: 50, // Add padding around bounds for better visibility
        });
      }
    } catch (err) {
      console.error('='.repeat(50));
      console.error('[MapView] Error loading data:');
      console.error('[MapView] Error type:', err.constructor.name);
      console.error('[MapView] Error message:', err.message);
      console.error('[MapView] Error stack:', err.stack);
      
      if (err.response) {
        console.error('[MapView] Response status:', err.response.status);
        console.error('[MapView] Response data:', JSON.stringify(err.response.data, null, 2));
        console.error('[MapView] Response headers:', err.response.headers);
      } else if (err.request) {
        console.error('[MapView] Request made but no response');
        console.error('[MapView] Request config:', {
          url: err.config?.url,
          method: err.config?.method,
          params: err.config?.params
        });
      }
      console.error('='.repeat(50));
      
      // Show more detailed error message
      let errorMessage = 'An error occurred. Please try again.';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.response) {
        errorMessage = `Network error: ${err.response.status} - ${err.response.data?.error_message || 'Please check your API keys.'}`;
      } else if (err.request) {
        errorMessage = 'Network error: Could not reach the server. Please check your internet connection and API keys.';
      }
      setError(errorMessage);
    } finally {
      clearTimeout(watchdog);
      setIsLoading(false);
    }
  }, [searchQuery, filters.walkingTime, filters.searchRadius, isMapsLoaded]);

  // Initial load - get user location and load data
  useEffect(() => {
    if (mapsKeyMissing) {
      setError('Google Maps API key is not configured. Please add VITE_GOOGLE_MAPS_API_KEY to your .env.local file.');
      setIsLoading(false);
      return;
    }
    if (mapsLoadError) {
      setError(`Failed to load Google Maps JavaScript API. ${mapsLoadError?.message || ''}`.trim());
      setIsLoading(false);
      return;
    }
    if (!searchQuery) {
      setIsLoading(false);
      return;
    }
    if (searchQuery && isMapsLoaded && map && mapRef.current && window.google && window.google.maps) {
      const initializeLocation = async () => {
        try {
          let startLocation;
          
          // Debug: Log what we received
          console.log('[MapView] searchData received:', searchData);
          console.log('[MapView] locationType:', searchData?.locationType);
          console.log('[MapView] customLocation:', searchData?.customLocation);
          
          // Determine starting location based on searchData
          // Check for custom location with strict validation (non-empty trimmed string)
          const customLoc = searchData?.customLocation;
          const hasCustomLocation = searchData?.locationType === 'custom' && 
                                    customLoc !== null && 
                                    customLoc !== undefined &&
                                    typeof customLoc === 'string' &&
                                    customLoc.trim().length > 0;
          
          console.log('[MapView] hasCustomLocation:', hasCustomLocation);
          
          if (hasCustomLocation) {
            // Geocode custom location - NEVER fall back to geolocation
            try {
              const customLocationTrimmed = searchData.customLocation.trim();
              console.log('[MapView] Geocoding custom location:', customLocationTrimmed);
              startLocation = await geocodeAddress(customLocationTrimmed);
              console.log('[MapView] Geocoded custom location successfully:', startLocation);
            } catch (geocodeErr) {
              console.error('[MapView] Geocoding failed:', geocodeErr);
              // If geocoding fails and user provided custom location, use default instead of requesting geolocation
              console.warn('[MapView] Using default location since geocoding failed for custom address');
              startLocation = defaultCenter;
            }
          } else {
            // Only use geolocation if NOT using custom location
            try {
              console.log('[MapView] Requesting user location via geolocation');
              startLocation = await getCurrentLocation();
            } catch (geoErr) {
              // If user denied geolocation, use default location
              console.warn('[MapView] Geolocation denied or failed, using default location:', geoErr);
              startLocation = defaultCenter;
            }
          }
          
          setCurrentLocation(startLocation);
          setSearchCenter(startLocation);
          await loadDataFromLocation(startLocation);
        } catch (err) {
          console.warn('Could not initialize location:', err);
          // Use default location as final fallback
          const defaultLoc = defaultCenter;
          setCurrentLocation(defaultLoc);
          setSearchCenter(defaultLoc);
          await loadDataFromLocation(defaultLoc);
        }
      };
      initializeLocation();
    }
  }, [searchQuery, isMapsLoaded, map, loadDataFromLocation, searchData, mapsKeyMissing, mapsLoadError]);

  // Handle search again button - use current map center (where user has dragged to)
  const handleSearchAgain = useCallback(async () => {
    if (!isMapsLoaded || !mapRef.current || !window.google || !window.google.maps) {
      return;
    }
    
    const center = mapRef.current.getCenter();
    if (center) {
      const centerLocation = {
        lat: center.lat(),
        lng: center.lng(),
      };
      setSearchCenter(centerLocation);
      await loadDataFromLocation(centerLocation);
    }
  }, [isMapsLoaded, loadDataFromLocation]);

  // Reload data when search radius changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isMapsLoaded && searchCenter && map && mapRef.current && window.google && window.google.maps && searchQuery) {
      loadDataFromLocation(searchCenter);
    }
  }, [filters.searchRadius, searchCenter, map, searchQuery, loadDataFromLocation, isMapsLoaded]);

  // Apply filters
  useEffect(() => {
    // Early return if no places or chargers to filter
    if (places.length === 0 || chargers.length === 0) {
      if (chargers.length === 0) {
        setFilteredChargers([]);
      }
      return;
    }

    let filtered = [...chargers];

    if (filters.operational) {
      // Only show chargers that are explicitly operational (exclude false and null)
      filtered = filtered.filter((c) => c.status?.isOperational === true);
    }

    if (filters.access && filters.access !== 'all') {
      filtered = filtered.filter((c) => c.access?.category === filters.access);
    }

    if (filters.cost && filters.cost !== 'all') {
      filtered = filtered.filter((c) => (filters.cost === 'free' ? c.isFree : c.isFree === false));
    }

    if (filters.speed && filters.speed !== 'all') {
      filtered = filtered.filter((c) => c.powerTier === filters.speed);
    }

    if (filters.connectors && filters.connectors.length > 0) {
      filtered = filtered.filter((c) => {
        const types = (c.connectors || []).map((conn) => conn.type);
        // Show chargers that have ANY of the selected connector types (OR logic)
        return filters.connectors.some((sel) => types.includes(sel));
      });
    }

    // Filter by walking time (already filtered when loading, but re-filter if time changed)
    if (filters.walkingTime) {
      const walkingDistanceKm = walkingTimeToDistanceKm(filters.walkingTime);
      filtered = filtered.filter((charger) => {
        const place = places.find((p) => p.place_id === charger.placeId);
        if (!place) return false;
        const distanceKm = calculateDistance(
          { lat: place.geometry.location.lat, lng: place.geometry.location.lng },
          charger.location
        );
        return distanceKm <= walkingDistanceKm;
      });
    }

    setFilteredChargers(filtered);
    
    // Update charger counts for places and maintain sort order by distance
    const updatedPlaces = places.map((place) => {
      const placeChargers = filtered.filter((c) => c.placeId === place.place_id);
      const featuredCharger = [...placeChargers].sort((a, b) => {
        const opA = a.status?.isOperational ? 1 : 0;
        const opB = b.status?.isOperational ? 1 : 0;
        if (opB !== opA) return opB - opA;
        return (b.maxPower || 0) - (a.maxPower || 0);
      })[0];

      return {
        ...place,
        chargerCount: placeChargers.length,
        featuredCharger,
      };
    });
    
    // Re-sort by distance to ensure closest first
    const sortedPlaces = [...updatedPlaces].sort((a, b) => {
      const distA = distances[a.place_id]?.distanceValue || Infinity;
      const distB = distances[b.place_id]?.distanceValue || Infinity;
      return distA - distB;
    });
    
    // Only update places if they actually changed
    // Compare by creating a signature string for each place (ID + chargerCount)
    const newSignature = sortedPlaces.map(p => `${p.place_id}:${p.chargerCount || 0}`).join(',');
    
    // Only update if the signature actually changed from the last update
    if (previousPlacesSignature.current !== newSignature) {
      previousPlacesSignature.current = newSignature;
      setPlaces(sortedPlaces);
    }
  }, [filters, chargers, places, distances]);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  const connectorOptions = useMemo(() => {
    const set = new Set();
    chargers.forEach((c) => {
      c.connectors?.forEach((conn) => {
        if (conn.type) set.add(conn.type);
      });
    });
    return Array.from(set).sort();
  }, [chargers]);

  // Don't auto-select connectors - let user choose which connector types to filter by

  const chargersForSelectedPlace = useMemo(() => {
    if (!selectedPlace) return [];
    return filteredChargers.filter((c) => c.placeId === selectedPlace.place_id);
  }, [filteredChargers, selectedPlace]);

  const getMarkerIcon = (type) => {
    if (!window.google || !window.google.maps) {
      return undefined; // Use default marker if API not loaded
    }
    
    // Custom pin path (teardrop shape - standard Google Maps pin)
    // Path creates a pin with rounded top and pointed bottom
    const pinPath = 'M 12,2 C 8.13,2 5,5.13 5,9 c 0,5.25 7,13 7,13 0,0 7,-7.75 7,-13 0,-3.87 -3.13,-7 -7,-7 z m 0,9.5 c -1.38,0 -2.5,-1.12 -2.5,-2.5 0,-1.38 1.12,-2.5 2.5,-2.5 1.38,0 2.5,1.12 2.5,2.5 0,1.38 -1.12,2.5 -2.5,2.5 z';
    
     if (type === 'place') {
       // Location pin for places (groceries, etc.) - purple pin
       return {
         path: pinPath,
         fillColor: '#9d50bb', // Neon Purple
         fillOpacity: 1,
         strokeColor: '#fff',
         strokeWeight: 2.4, // Slightly thicker stroke for larger pin
         scale: 1.2,
         anchor: new window.google.maps.Point(12, 20), // Anchor at bottom point of pin
       };
     } else if (type === 'charger') {
       // Charging pin for chargers - darker green pin
       return {
         path: pinPath,
         fillColor: '#00cc7a', // Darker, less bright green (was #00ff9f)
         fillOpacity: 1,
         strokeColor: '#fff',
         strokeWeight: 2.4, // Slightly thicker stroke for larger pin
         scale: 1.2,
         anchor: new window.google.maps.Point(12, 20), // Anchor at bottom point of pin
       };
    } else {
      // User location - keep as circle
      return {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#00d2ff', // Neon Blue
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      };
    }
  };

  // Use AdvancedMarkerElement instead of deprecated google.maps.Marker when available.
  useEffect(() => {
    if (!isMapsLoaded || !mapRef.current || !window.google || !window.google.maps) return;

    let cancelled = false;

    const ensureMarkerLibrary = async () => {
      try {
        const lib = await window.google.maps.importLibrary('marker');
        if (cancelled) return null;
        return lib;
      } catch (e) {
        console.warn('[MapView] Advanced markers not available, falling back to legacy markers:', e);
        if (!cancelled) setMarkerMode('legacy');
        return null;
      }
    };

    const updateAdvancedMarkers = async () => {
      const markerLib = await ensureMarkerLibrary();
      if (cancelled || !markerLib) return;

      const { AdvancedMarkerElement, PinElement } = markerLib;
      const mapInstance = mapRef.current;
      const store = markersRef.current;

      if (markerMode !== 'advanced') setMarkerMode('advanced');

      const setMarkerMapNull = (m) => {
        try {
          m.map = null;
        } catch (e) {
          // ignore
        }
      };

      const makeUserContent = () => {
        const el = document.createElement('div');
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.background = '#00d2ff';
        el.style.border = '2px solid #fff';
        el.style.boxShadow = '0 0 12px rgba(0, 210, 255, 0.5)';
        return el;
      };

      const makePin = (type) => {
        const createLightningGlyph = () => {
          // Inline version of `lightning-charge-fill-svgrepo-com.svg` with white fill.
          const svgNS = 'http://www.w3.org/2000/svg';
          const svg = document.createElementNS(svgNS, 'svg');
          svg.setAttribute('viewBox', '0 0 16 16');
          svg.setAttribute('width', '16');
          svg.setAttribute('height', '16');
          svg.style.display = 'block';

          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute(
            'd',
            'M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z'
          );
          path.setAttribute('fill', '#ffffff');
          svg.appendChild(path);
          return svg;
        };

        if (type === 'place') {
          return new PinElement({
            background: '#9d50bb',
            borderColor: '#ffffff',
            glyphColor: '#ffffff',
            scale: 1.1,
          });
        }
        // charger
        return new PinElement({
          background: '#00cc7a',
          borderColor: '#ffffff',
          glyph: createLightningGlyph(),
          scale: 1.1,
        });
      };

      // User marker
      if (currentLocation) {
        if (!store.user) {
          store.user = new AdvancedMarkerElement({
            map: mapInstance,
            position: currentLocation,
            title: 'Your Location',
            content: makeUserContent(),
          });
        } else {
          store.user.position = currentLocation;
          store.user.map = mapInstance;
        }
      } else if (store.user) {
        setMarkerMapNull(store.user);
        store.user = null;
      }

      // Place markers
      const nextPlaceIds = new Set(places.map((p) => p.place_id));
      for (const [id, marker] of store.places.entries()) {
        if (!nextPlaceIds.has(id)) {
          setMarkerMapNull(marker);
          store.places.delete(id);
        }
      }
      for (const place of places) {
        const id = place.place_id;
        const pos = {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        };

        let marker = store.places.get(id);
        if (!marker) {
          const pin = makePin('place');
          marker = new AdvancedMarkerElement({
            map: mapInstance,
            position: pos,
            title: place.name,
            content: pin.element,
          });
          marker.__data = place;
          marker.addListener('click', () => {
            setSelectedPlace(marker.__data);
            setSelectedCharger(null);
            setChargerPanelOpen(true);
          });
          store.places.set(id, marker);
        } else {
          marker.__data = place;
          marker.position = pos;
          marker.title = place.name;
          marker.map = mapInstance;
        }
      }

      // Charger markers
      const chargerKey = (c) => `${c.id}:${c.location?.lat},${c.location?.lng}`;
      const nextChargerKeys = new Set(filteredChargers.map(chargerKey));
      for (const [key, marker] of store.chargers.entries()) {
        if (!nextChargerKeys.has(key)) {
          setMarkerMapNull(marker);
          store.chargers.delete(key);
        }
      }
      for (const charger of filteredChargers) {
        const key = chargerKey(charger);
        let marker = store.chargers.get(key);
        if (!marker) {
          const pin = makePin('charger');
          marker = new AdvancedMarkerElement({
            map: mapInstance,
            position: charger.location,
            title: charger.name,
            content: pin.element,
          });
          marker.__data = charger;
          marker.addListener('click', () => {
            setSelectedCharger(marker.__data);
            setSelectedPlace(null);
          });
          store.chargers.set(key, marker);
        } else {
          marker.__data = charger;
          marker.position = charger.location;
          marker.title = charger.name;
          marker.map = mapInstance;
        }
      }
    };

    updateAdvancedMarkers();

    return () => {
      cancelled = true;
      // Clean up all markers when the map view unmounts
      const store = markersRef.current;
      if (store.user) {
        try {
          store.user.map = null;
        } catch (e) {
          // ignore
        }
        store.user = null;
      }
      for (const m of store.places.values()) {
        try {
          m.map = null;
        } catch (e) {
          // ignore
        }
      }
      for (const m of store.chargers.values()) {
        try {
          m.map = null;
        } catch (e) {
          // ignore
        }
      }
      store.places.clear();
      store.chargers.clear();
    };
  }, [map, currentLocation, places, filteredChargers, markerMode, isMapsLoaded]);

  return (
    <div className="map-view-container">
        <div className="map-header">
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
          <h2 className="map-title">{searchData?.query || searchQuery}</h2>
          <div className="map-header-actions">
            <button
              className="search-again-button"
              onClick={handleSearchAgain}
              disabled={isLoading || !isMapsLoaded}
            >
              Search Again
            </button>
            <button
              className="filter-toggle"
              disabled={!selectedPlace}
              onClick={() => setChargerPanelOpen((open) => !open)}
            >
              Chargers {selectedPlace ? `(${chargersForSelectedPlace.length})` : ''}
            </button>
            <button
              className="filter-toggle"
              onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            >
              Options
            </button>
          </div>
        </div>

        {!error && (!isMapsLoaded || isLoading) && (
          <div className="loading-overlay">
            <div className="loading-spinner">
              <div>Loading...</div>
              <div style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.8 }}>
                Finding charging stations near you
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <h3>Error</h3>
            <p>{error}</p>
            <div className="error-actions">
              <button onClick={onBack}>Go Back</button>
              <button onClick={() => window.location.reload()}>Retry</button>
            </div>
            {error.includes('API key') && (
              <div className="error-help">
                <p><strong>Setup Instructions:</strong></p>
                <ol>
                  <li>Copy <code>.env.example</code> to <code>.env.local</code></li>
                  <li>Add your Google Maps API keys</li>
                  <li>Restart the development server</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {!error && isMapsLoaded && (
          <>
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={currentLocation || defaultCenter}
              zoom={12}
              onLoad={onMapLoad}
              options={{
                mapId: GOOGLE_MAPS_MAP_ID, // Custom Map ID from Google Cloud Console
                disableDefaultUI: false,
                zoomControl: true,
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: true,
                colorScheme: 'dark',
              }}
            >
              {/* Markers are rendered imperatively via AdvancedMarkerElement (see effect above). */}

              {/* Place info window */}
              {selectedPlace && (
                <InfoWindow
                  position={{
                    lat: selectedPlace.geometry.location.lat,
                    lng: selectedPlace.geometry.location.lng,
                  }}
                  options={window.google?.maps ? {
                    pixelOffset: new window.google.maps.Size(0, -40), // Offset upward by 40px to show pin
                  } : undefined}
                  onCloseClick={() => setSelectedPlace(null)}
                >
                  <div className="info-window">
                    <div className="info-window-header">
                      <h3 className="info-window-title">{selectedPlace.name}</h3>
                      <button
                        type="button"
                        className="info-window-close"
                        aria-label="Close"
                        onClick={() => setSelectedPlace(null)}
                      >
                        ×
                      </button>
                    </div>
                    {selectedPlace.vicinity && <p>{selectedPlace.vicinity}</p>}
                    {distances[selectedPlace.place_id] && (
                      <p>
                        <strong>Distance:</strong>{' '}
                        {distances[selectedPlace.place_id].distance} (
                        {distances[selectedPlace.place_id].duration})
                      </p>
                    )}
                    {selectedPlace.chargerCount !== undefined && (
                      <p>
                        <strong>Nearby Chargers:</strong> {selectedPlace.chargerCount}
                      </p>
                    )}
                  </div>
                </InfoWindow>
              )}

              {/* Charger info window */}
              {selectedCharger && (
                <InfoWindow
                  position={selectedCharger.location}
                  options={window.google?.maps ? {
                    pixelOffset: new window.google.maps.Size(0, -40), // Offset upward by 40px to show pin
                  } : undefined}
                  onCloseClick={() => setSelectedCharger(null)}
                >
                  <div className="info-window">
                    <div className="info-window-header">
                      <h3 className="info-window-title">{selectedCharger.name}</h3>
                      <button
                        type="button"
                        className="info-window-close"
                        aria-label="Close"
                        onClick={() => setSelectedCharger(null)}
                      >
                        ×
                      </button>
                    </div>
                    {selectedCharger.address && (
                      <a
                        className="info-window-address"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          selectedCharger.address ||
                            `${selectedCharger.location?.lat},${selectedCharger.location?.lng}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {selectedCharger.address}
                      </a>
                    )}
                    <p>
                      <strong>Status:</strong> {selectedCharger.status?.title || 'Unknown'}
                    </p>
                    <p>
                      <strong>Access:</strong> {selectedCharger.access?.title || 'Unknown'}
                    </p>
                    {selectedCharger.operator && (
                      <p>
                        <strong>Network/Operator:</strong> {selectedCharger.operator}
                      </p>
                    )}
                    <p>
                      <strong>Cost:</strong> {selectedCharger.cost || 'Unknown'}
                    </p>
                    <p>
                      <strong>Power:</strong> {selectedCharger.speed}
                    </p>
                    {selectedCharger.distanceFromPlace !== undefined && (
                      <p>
                        <strong>Walking Time:</strong> {calculateWalkingTime(selectedCharger.distanceFromPlace)}
                      </p>
                    )}
                    {selectedCharger.numberOfPoints && (
                      <p>
                        <strong>Number of Stations:</strong> {selectedCharger.numberOfPoints}
                      </p>
                    )}
                    {selectedCharger.maxPower > 0 && (
                      <p>
                        <strong>Max Power:</strong> {selectedCharger.maxPower}kW
                        {selectedCharger.hasMultiplePowerLevels && selectedCharger.minPower && (
                          <span> (Range: {selectedCharger.minPower}-{selectedCharger.maxPower}kW)</span>
                        )}
                      </p>
                    )}
                    {selectedCharger.connectors?.length > 0 && (
                      <p>
                        <strong>Connectors:</strong>{' '}
                        {selectedCharger.connectors.map((c) => c.type).filter(Boolean).join(', ')}
                      </p>
                    )}
                    <p>
                      <strong>Live status:</strong>{' '}
                      {selectedCharger.availability?.hasLiveStatus ? 'Provided' : 'Not available'}
                    </p>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>

            {/* Location cards sidebar */}
            {places.length > 0 && (
              <>
                {/* Minimized button (mobile only) */}
                {isMobile && isLocationsSidebarMinimized && (
                  <button
                    className="locations-sidebar-minimized"
                    onClick={toggleLocationsSidebar}
                    aria-label="Show locations"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="3" y1="6" x2="21" y2="6"></line>
                      <line x1="3" y1="12" x2="21" y2="12"></line>
                      <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                    {places.length > 0 && (
                      <span className="locations-count-badge">{places.length}</span>
                    )}
                  </button>
                )}

                {/* Full sidebar */}
                {(!isMobile || !isLocationsSidebarMinimized) && (
                  <div className={`locations-sidebar ${isMobile ? 'mobile-expanded' : ''}`}>
                    <div className="locations-sidebar-header">
                      <h3>Locations ({places.length})</h3>
                      {isMobile && (
                        <button
                          className="locations-sidebar-minimize"
                          onClick={toggleLocationsSidebar}
                          aria-label="Minimize locations"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="locations-sidebar-content">
                      {places.map((place) => (
                        <LocationCard
                          key={place.place_id}
                          location={place}
                          distance={
                            distances[place.place_id]
                              ? `${distances[place.place_id].distance} (${distances[place.place_id].duration})`
                              : null
                          }
                          onSelect={(loc) => {
                            setSelectedPlace(loc);
                            setSelectedCharger(null);
                            setChargerPanelOpen(true);
                            if (mapRef.current) {
                              const position = {
                                lat: loc.geometry.location.lat,
                                lng: loc.geometry.location.lng,
                              };
                              mapRef.current.panTo(position);
                              mapRef.current.setZoom(15);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {selectedPlace && chargerPanelOpen && (
              <div className="chargers-sidebar">
                <div className="chargers-header">
                  <div>
                    <p className="chargers-label">Chargers near</p>
                    <h3 className="chargers-title">{selectedPlace.name || selectedPlace.formatted_address}</h3>
                    <p className="chargers-subtitle">
                      {chargersForSelectedPlace.length} charger{chargersForSelectedPlace.length === 1 ? '' : 's'} nearby
                    </p>
                  </div>
                  <button className="chargers-close" onClick={() => setChargerPanelOpen(false)}>
                    ×
                  </button>
                </div>

                <div className="chargers-list">
                  {chargersForSelectedPlace.length === 0 && (
                    <p className="chargers-empty">No chargers within walking distance for this location.</p>
                  )}

                  {chargersForSelectedPlace.map((charger) => {
                    const connectorNames = (charger.connectors || []).map((c) => c.type).filter(Boolean);
                    const walking = charger.distanceFromPlace
                      ? calculateWalkingTime(charger.distanceFromPlace)
                      : null;
                    return (
                      <div
                        key={`${charger.id}-${charger.location?.lat}-${charger.location?.lng}`}
                        className="charger-card"
                        onClick={() => {
                          setSelectedCharger(charger);
                          setSelectedPlace((prev) => prev);
                          if (mapRef.current && charger.location) {
                            mapRef.current.panTo(charger.location);
                            mapRef.current.setZoom(15);
                          }
                        }}
                      >
                        <div className="charger-card-header">
                          <div>
                            <h4 className="charger-name">{charger.name}</h4>
                            {walking && <span className="charger-distance">Walking: {walking}</span>}
                          </div>
                          <span className={`status-badge ${charger.status?.isOperational ? 'status-ok' : 'status-warn'}`}>
                            {charger.status?.title || 'Status unknown'}
                          </span>
                        </div>
                        <div className="charger-meta-row">
                          <span className="meta-chip">Access: {charger.access?.title || 'Unknown'}</span>
                          <span className="meta-chip">Cost: {charger.cost || 'Unknown'}</span>
                        </div>
                        <div className="charger-meta-row">
                          <span className="meta-chip">
                            Power: {charger.speed || 'Unknown'}
                            {charger.maxPower ? ` • ${charger.maxPower}kW` : ''}
                          </span>
                          {charger.numberOfPoints && (
                            <span className="meta-chip">{charger.numberOfPoints} point{charger.numberOfPoints === 1 ? '' : 's'}</span>
                          )}
                        </div>
                        {connectorNames.length > 0 && (
                          <div className="connector-row">
                            <span className="connector-label">Connectors:</span>
                            <div className="connector-tags">
                              {connectorNames.map((name) => (
                                <span className="connector-tag" key={name}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="location-footnotes">
                          <span>
                            {charger.status?.lastUpdated
                              ? `Updated ${new Date(charger.status.lastUpdated).toLocaleDateString()}`
                              : 'No recent update'}
                          </span>
                          <span>
                            {charger.availability?.hasLiveStatus
                              ? 'Live status provided'
                              : 'Real-time status not available'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <FilterPanel
          isOpen={filterPanelOpen}
          onClose={() => setFilterPanelOpen(false)}
          filters={filters}
          onFilterChange={handleFilterChange}
          connectorOptions={connectorOptions}
        />
      </div>
  );
};

export default MapView;

