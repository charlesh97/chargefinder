import { useState, useEffect, useRef } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import '../styles/landing.css';

const GOOGLE_MAPS_LIBRARIES = ['places'];

const LandingPageContent = ({ onSearch }) => {
  const [query, setQuery] = useState('');
  const [locationType, setLocationType] = useState('my-location'); // 'my-location' or 'custom'
  const [customLocation, setCustomLocation] = useState('');
  const customLocationInputRef = useRef(null);
  const placesAutocompleteRef = useRef(null);
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // Load Maps JS so autocomplete works even before MapView mounts.
  const { isLoaded: isMapsLoaded, loadError: mapsLoadError } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: 'beta',
  });

  // Initialize Google Places Autocomplete on a normal <input>.
  // We intentionally avoid <gmp-place-autocomplete> here because its input is encapsulated
  // and it doesn't reliably expose the free-typed value until a prediction is selected.
  useEffect(() => {
    if (locationType !== 'custom') return;
    if (!customLocationInputRef.current) return;
    if (!isMapsLoaded || mapsLoadError) return;

    const initialize = () => {
      if (!window.google?.maps?.places) return false;

      // Create once per "custom" session.
      if (!placesAutocompleteRef.current) {
        const autocomplete = new window.google.maps.places.Autocomplete(
          customLocationInputRef.current,
          {
            fields: ['formatted_address', 'name', 'geometry'],
          }
        );

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const next =
            place?.formatted_address ||
            place?.name ||
            customLocationInputRef.current?.value ||
            '';
          setCustomLocation(String(next));
        });

        placesAutocompleteRef.current = autocomplete;
      }

      return true;
    };

    if (initialize()) return;

    // Wait briefly for Maps JS to be ready (LoadScript should handle this, but be defensive).
    const checkInterval = setInterval(() => {
      if (initialize()) clearInterval(checkInterval);
    }, 100);

    const timeout = setTimeout(() => clearInterval(checkInterval), 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
      // No perfect "destroy" API; clearing listeners is enough.
      if (placesAutocompleteRef.current) {
        try {
          window.google?.maps?.event?.clearInstanceListeners(placesAutocompleteRef.current);
        } catch (e) {
          // ignore
        }
      }
      placesAutocompleteRef.current = null;
    };
  }, [locationType, isMapsLoaded, mapsLoadError]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    // If Maps failed to load, still allow search but warn in console for debugging.
    if (mapsLoadError) {
      console.warn('[LandingPage] Maps load error; autocomplete unavailable:', mapsLoadError);
    }
    if (!isMapsLoaded) {
      console.warn('[LandingPage] Maps not loaded yet; proceeding without autocomplete assist.');
    }

    if (query.trim()) {
      let locationValue = null;
      
      console.log('='.repeat(50));
      console.log('[LandingPage] DEBUG: Form submitted');
      console.log('[LandingPage] locationType:', locationType);
      console.log('[LandingPage] customLocation state:', customLocation);
      console.log('[LandingPage] customLocationInputRef.current:', customLocationInputRef.current);
      
      // If custom location is selected, validate and get the value
      if (locationType === 'custom') {
        locationValue =
          customLocation?.trim() ||
          customLocationInputRef.current?.value?.trim() ||
          '';
      }
      
      const searchData = {
        query: query.trim(),
        locationType: locationType,
        // If custom location type, pass the value (even if empty string) so MapView knows it's custom
        customLocation: locationType === 'custom' ? (locationValue ?? '') : null,
      };
      
      console.log('[LandingPage] Final locationValue:', locationValue);
      console.log('[LandingPage] Final searchData:', searchData);
      console.log('='.repeat(50));
      
      onSearch(searchData);
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-header">
          <h1 className="landing-title">Charge Finder</h1>
          <p className="landing-subtitle">Easily find EV charging close to your destination</p>
        </div>
        <form onSubmit={handleSubmit} className="search-form">
          <div className="search-form-content">
            <span className="search-form-text">Find me</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Groceries"
              className="search-input-textbox"
              autoFocus
            />
            <span className="search-form-text">near</span>
            <div className="location-selector">
              {locationType === 'my-location' ? (
                <select
                  value="my-location"
                  onChange={(e) => setLocationType(e.target.value)}
                  className="search-dropdown"
                >
                  <option value="my-location">My Location</option>
                  <option value="custom">Custom Location</option>
                </select>
              ) : (
                <div className="custom-location-input">
                  <input
                    ref={customLocationInputRef}
                    type="text"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    placeholder="Enter address or location"
                    className="search-input-custom"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setLocationType('my-location')}
                    className="location-switch-button"
                  >
                    Use My Location
                  </button>
                </div>
              )}
            </div>
            <button type="submit" className="search-arrow-button">
              →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const LandingPage = ({ onSearch }) => {
  return <LandingPageContent onSearch={onSearch} />;
};

export default LandingPage;

