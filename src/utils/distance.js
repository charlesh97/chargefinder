/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Object} coord1 - {lat, lng}
 * @param {Object} coord2 - {lat, lng}
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (coord1, coord2) => {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLon = toRad(coord2.lng - coord1.lng);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number} Radians
 */
const toRad = (degrees) => {
  return (degrees * Math.PI) / 180;
};

/**
 * Format distance for display
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} Formatted distance
 */
export const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
};

/**
 * Calculate walking time from distance
 * Assumes average walking speed of 3.1 mph (5 km/h or 83.33 m/min)
 * @param {number} distanceKm - Distance in kilometers
 * @returns {string} Formatted walking time (e.g., "5 min", "1.2 hrs")
 */
export const calculateWalkingTime = (distanceKm) => {
  const distanceMiles = distanceKm * 0.621371; // Convert km to miles
  const walkingSpeedMph = 3.1; // Average walking speed
  const minutes = (distanceMiles / walkingSpeedMph) * 60;
  
  if (minutes < 1) {
    return '< 1 min';
  } else if (minutes < 60) {
    return `${Math.round(minutes)} min`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    if (remainingMinutes === 0) {
      return `${hours} hr${hours > 1 ? 's' : ''}`;
    }
    return `${hours} hr ${remainingMinutes} min`;
  }
};

/**
 * Convert walking time (minutes) to distance in kilometers
 * Assumes average walking speed of 3.1 mph
 * @param {number} minutes - Walking time in minutes
 * @returns {number} Distance in kilometers
 */
export const walkingTimeToDistanceKm = (minutes) => {
  const walkingSpeedMph = 3.1; // Average walking speed
  const distanceMiles = (minutes / 60) * walkingSpeedMph;
  return distanceMiles * 1.60934; // Convert miles to km
};

