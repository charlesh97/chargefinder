/**
 * Get user's current location using browser geolocation API
 * @returns {Promise<{lat: number, lng: number}>}
 */
export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        console.log('[Geolocation] Got location:', location);
        console.log('[Geolocation] Accuracy:', position.coords.accuracy, 'meters');
        resolve(location);
      },
      (error) => {
        console.error('[Geolocation] Error:', error);
        console.error('[Geolocation] Error code:', error.code);
        console.error('[Geolocation] Error message:', error.message);
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
};

