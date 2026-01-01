import axios from 'axios';

const OCM_API_KEY = import.meta.env.VITE_OPEN_CHARGE_MAP_API_KEY;
const OCM_BASE_URL = 'https://api.openchargemap.io/v3/poi';

/**
 * Fetch nearby EV chargers using Open Charge Map API
 * @param {Object} location - {lat, lng}
 * @param {number} distance - Search radius in km (default: 2)
 * @param {Object} filters - Filter options {free, speed}
 * @returns {Promise<Array>} Array of charger POIs
 */
export const getNearbyChargers = async (location, distance = 2, filters = {}) => {
  console.log('[Open Charge Map] Fetching chargers:', { location, distance, filters });
  
  try {
    const params = {
      latitude: location.lat,
      longitude: location.lng,
      distance: distance,
      distanceunit: 'KM',
      maxresults: 100,
    };

    if (OCM_API_KEY && OCM_API_KEY !== 'your_open_charge_map_api_key_here') {
      params.key = OCM_API_KEY;
      console.log('[Open Charge Map] Using API key');
    } else {
      console.log('[Open Charge Map] No API key, using public access');
    }

    console.log('[Open Charge Map] Making request to:', OCM_BASE_URL);
    console.log('[Open Charge Map] Request params:', { ...params, key: params.key ? '***' + OCM_API_KEY.slice(-4) : 'none' });
    
    const response = await axios.get(OCM_BASE_URL, { params });

    console.log('[Open Charge Map] Response status:', response.status);
    console.log('[Open Charge Map] Chargers found:', response.data?.length || 0);

    let chargers = response.data || [];

    // Apply filters
    // Basic server-side pre-filtering (client applies richer filters later)
    if (filters.free !== undefined) {
      chargers = chargers.filter((charger) => {
        const usageCost = charger.UsageCost || '';
        const isPayAtLocation = charger.UsageType?.IsPayAtLocation ?? false;
        // Only free if UsageCost explicitly contains "free" AND not pay-at-location
        const isFree =
          usageCost !== null &&
          usageCost !== '' &&
          typeof usageCost === 'string' &&
          usageCost.toLowerCase().includes('free') &&
          !isPayAtLocation;
        return filters.free ? isFree : !isFree;
      });
    }

    if (filters.speed) {
      chargers = chargers.filter((charger) => {
        if (!charger.Connections || charger.Connections.length === 0) return false;

        const maxPower = Math.max(...charger.Connections.map((conn) => conn.PowerKW || 0));

        switch (filters.speed) {
          case 'level1':
            return maxPower <= 3.7;
          case 'level2':
            return maxPower > 3.7 && maxPower <= 22;
          case 'dc_fast':
            return maxPower > 22;
          default:
            return true;
        }
      });
    }

    console.log('[Open Charge Map] Returning', chargers.length, 'chargers');
    return chargers;
  } catch (error) {
    console.error('[Open Charge Map] Error fetching chargers:');
    console.error('[Open Charge Map] Error type:', error.constructor.name);
    console.error('[Open Charge Map] Error message:', error.message);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      console.error('[Open Charge Map] Response status:', status);
      console.error('[Open Charge Map] Response data:', JSON.stringify(data, null, 2));
      
      if (status === 403 || status === 401) {
        const msg = 'Open Charge Map API key is invalid. Please check your API key or continue without it (API works without key but with rate limits).';
        console.error('[Open Charge Map]', msg);
        throw new Error(msg);
      } else {
        const msg = `Open Charge Map API error: ${status} - ${data?.message || 'Please try again later.'}`;
        console.error('[Open Charge Map]', msg);
        throw new Error(msg);
      }
    } else if (error.request) {
      console.error('[Open Charge Map] No response received');
      console.error('[Open Charge Map] Request details:', {
        url: error.config?.url,
        method: error.config?.method
      });
      const msg = 'Network error: Could not reach Open Charge Map API. Please check your internet connection.';
      console.error('[Open Charge Map]', msg);
      throw new Error(msg);
    } else {
      console.error('[Open Charge Map] Request setup error:', error);
      throw new Error(error.message || 'An unexpected error occurred while fetching chargers.');
    }
  }
};

/**
 * Get chargers near multiple locations
 * @param {Array} locations - Array of {lat, lng}
 * @param {number} distance - Search radius in km
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of charger arrays (one per location)
 */
export const getChargersForLocations = async (locations, distance = 5, filters = {}) => {
  try {
    const promises = locations.map((location) =>
      getNearbyChargers(location, distance, filters)
    );
    return await Promise.all(promises);
  } catch (error) {
    console.error('Error fetching chargers for locations:', error);
    throw error;
  }
};

/**
 * Parse charger data to extract useful information
 * @param {Object} charger - Charger POI from API
 * @returns {Object} Parsed charger data
 */
export const parseChargerData = (charger) => {
  const connections = charger.Connections || [];
  const powerValues = connections.map((c) => c.PowerKW || 0).filter(p => p > 0);
  const maxPower = powerValues.length > 0 ? Math.max(...powerValues) : 0;
  const minPower = powerValues.length > 0 ? Math.min(...powerValues) : 0;
  const hasMultiplePowerLevels = powerValues.length > 1 && minPower !== maxPower;

  const derivePowerTier = () => {
    if (maxPower <= 3.7) return { code: 'level1', label: 'Level 1' };
    if (maxPower <= 22) return { code: 'level2', label: 'Level 2' };
    if (maxPower > 22) return { code: 'dc_fast', label: 'DC Fast' };
    return { code: 'unknown', label: 'Unknown' };
  };

  const deriveAccessCategory = () => {
    const usage = charger.UsageType || {};
    const title = (usage.Title || '').toLowerCase();
    if (usage.IsMembershipRequired) return 'permit';
    if (usage.IsAccessKeyRequired) return 'restricted';
    if (title.includes('parking')) return 'parking';
    if (title.includes('public')) return 'public';
    if (title.includes('private')) return 'private';
    if (title.includes('restricted')) return 'restricted';
    return 'unknown';
  };

  const powerTier = derivePowerTier();

  const usageCost = charger.UsageCost || '';
  const isPayAtLocation = charger.UsageType?.IsPayAtLocation ?? false;
  
  // Determine if charger is free:
  // 1. If UsageCost explicitly contains "free", it's free
  // 2. If UsageCost is null/empty, check IsPayAtLocation:
  //    - If IsPayAtLocation is true, it's NOT free (paid)
  //    - If IsPayAtLocation is false/null, default to not free (safer assumption)
  // 3. If UsageCost has a value (and doesn't contain "free"), it's paid
  const isFree =
    usageCost !== null &&
    usageCost !== '' &&
    typeof usageCost === 'string' &&
    usageCost.toLowerCase().includes('free') &&
    !isPayAtLocation; // Explicitly free AND not pay-at-location

  const statusType = charger.StatusType || {};
  const statusTitle = (statusType.Title || '').toLowerCase();
  
  // Check if status title indicates non-operational status
  const isNonOperationalStatus = 
    statusTitle.includes('unavailable') ||
    statusTitle.includes('planned') ||
    statusTitle.includes('removed') ||
    statusTitle.includes('decommissioned');
  
  const connectionOperational = connections.some(
    (c) => c.StatusType && c.StatusType.IsOperational === true
  );
  
  // Determine operational status:
  // 1. If explicitly marked as non-operational in API, use that
  // 2. If status title indicates non-operational, mark as false
  // 3. Otherwise, use API value or connection status, defaulting to null if unknown
  let isOperational;
  if (statusType.IsOperational === false || isNonOperationalStatus) {
    isOperational = false;
  } else if (statusType.IsOperational === true) {
    isOperational = true;
  } else if (connectionOperational) {
    isOperational = true;
  } else {
    isOperational = null; // Unknown status
  }

  const connectorData = connections.map((c) => ({
    type: c.ConnectionType?.Title || 'Unknown',
    power: c.PowerKW || 0,
    level: c.Level?.Title || (c.LevelID ? `Level ${c.LevelID}` : 'Unknown'),
    status: c.StatusType?.Title || null,
    statusIsOperational:
      c.StatusType && c.StatusType.IsOperational !== undefined
        ? c.StatusType.IsOperational
        : null,
  }));

  const hasLiveStatus = connectorData.some((c) => c.status);

  return {
    id: charger.ID,
    name: charger.AddressInfo?.Title || 'Unnamed Charger',
    address: charger.AddressInfo?.AddressLine1 || '',
    location: {
      lat: charger.AddressInfo?.Latitude,
      lng: charger.AddressInfo?.Longitude,
    },
    speed: powerTier.label,
    powerTier: powerTier.code,
    maxPower,
    minPower: hasMultiplePowerLevels ? minPower : null,
    hasMultiplePowerLevels,
    isFree,
    cost: usageCost && usageCost !== '' ? usageCost : (isFree ? 'Free' : (isPayAtLocation ? 'Pay At Location' : 'Paid')),
    status: {
      id: statusType.ID,
      title: statusType.Title || 'Unknown status',
      isOperational: isOperational, // Can be true, false, or null
      lastUpdated: charger.DateLastStatusUpdate || null,
    },
    access: {
      title: charger.UsageType?.Title || 'Unknown access',
      category: deriveAccessCategory(),
      isMembershipRequired: charger.UsageType?.IsMembershipRequired ?? null,
      isPayAtLocation: charger.UsageType?.IsPayAtLocation ?? null,
    },
    numberOfPoints: charger.NumberOfPoints || connectorData.length || null,
    operator: charger.OperatorInfo?.Title || null,
    comments: charger.GeneralComments || '',
    connectors: connectorData,
    availability: {
      hasLiveStatus,
    },
  };
};

