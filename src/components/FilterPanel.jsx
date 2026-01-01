import { useState, useEffect } from 'react';
import '../styles/filterPanel.css';

const defaultFilters = {
  operational: false, // false = show all, true = show operational only
  access: 'all',
  cost: 'all',
  speed: 'all',
  connectors: [],
  walkingTime: 5, // Default 5 minutes
  searchRadius: 10, // Default 10 miles
};

const FilterPanel = ({ isOpen, onClose, filters, onFilterChange, connectorOptions = [] }) => {
  const [localFilters, setLocalFilters] = useState(filters || defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(filters || defaultFilters);

  // Update local filters when props change
  useEffect(() => {
    if (filters) {
      setLocalFilters(filters);
      setAppliedFilters(filters);
    }
  }, [filters]);

  // Check if there are pending changes
  const hasPendingChanges = () => {
    return JSON.stringify(localFilters) !== JSON.stringify(appliedFilters);
  };

  // Handle filter changes - keep local until Apply is pressed
  const handleFilterChange = (key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
  };

  // Apply pending changes
  const applyFilters = () => {
    setAppliedFilters(localFilters);
    onFilterChange(localFilters);
  };

  const clearFilters = () => {
    const clearedFilters = { ...defaultFilters };
    setLocalFilters(clearedFilters);
    setAppliedFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  const toggleConnector = (name) => {
    const current = new Set(localFilters.connectors || []);
    if (current.has(name)) current.delete(name);
    else current.add(name);
    handleFilterChange('connectors', Array.from(current));
  };

  return (
    <>
      <div className={`filter-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <div className={`filter-panel ${isOpen ? 'open' : ''}`}>
        <div className="filter-panel-header">
          <h2>Options</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="filter-section">
          <h3>Status</h3>
          <div className="filter-options">
            <label className="filter-option">
              <input
                type="checkbox"
                name="operational"
                checked={!!localFilters.operational}
                onChange={(e) => handleFilterChange('operational', e.target.checked)}
              />
              <span>Show operational only</span>
            </label>
          </div>
        </div>

        <div className="filter-section">
          <h3>Access</h3>
          <div className="filter-options">
            {[
              { key: 'all', label: 'All' },
              { key: 'public', label: 'Public' },
              { key: 'restricted', label: 'Restricted/Key' },
              { key: 'permit', label: 'Permit/Membership' },
              { key: 'parking', label: 'Parking-only' },
              { key: 'private', label: 'Private' },
            ].map((opt) => (
              <label className="filter-option" key={opt.key}>
                <input
                  type="radio"
                  name="access"
                  checked={localFilters.access === opt.key}
                  onChange={() => handleFilterChange('access', opt.key)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <h3>Pricing</h3>
          <div className="filter-options">
            <label className="filter-option">
              <input
                type="radio"
                name="cost"
                checked={localFilters.cost === 'free'}
                onChange={() => handleFilterChange('cost', 'free')}
              />
              <span>Free</span>
            </label>
            <label className="filter-option">
              <input
                type="radio"
                name="cost"
                checked={localFilters.cost === 'paid'}
                onChange={() => handleFilterChange('cost', 'paid')}
              />
              <span>Paid</span>
            </label>
            <label className="filter-option">
              <input
                type="radio"
                name="cost"
                checked={localFilters.cost === 'all'}
                onChange={() => handleFilterChange('cost', 'all')}
              />
              <span>All</span>
            </label>
          </div>
        </div>

        <div className="filter-section">
          <h3>Power / Speed</h3>
          <div className="filter-options">
            <label className="filter-option">
              <input
                type="radio"
                name="speed"
                checked={localFilters.speed === 'level1'}
                onChange={() => handleFilterChange('speed', 'level1')}
              />
              <span>Level 1 (≤3.7kW)</span>
            </label>
            <label className="filter-option">
              <input
                type="radio"
                name="speed"
                checked={localFilters.speed === 'level2'}
                onChange={() => handleFilterChange('speed', 'level2')}
              />
              <span>Level 2 (3.7-22kW)</span>
            </label>
            <label className="filter-option">
              <input
                type="radio"
                name="speed"
                checked={localFilters.speed === 'dc_fast'}
                onChange={() => handleFilterChange('speed', 'dc_fast')}
              />
                <span>DC Fast (>22kW)</span>
            </label>
            <label className="filter-option">
              <input
                type="radio"
                name="speed"
                checked={localFilters.speed === 'all'}
                onChange={() => handleFilterChange('speed', 'all')}
              />
              <span>All</span>
            </label>
          </div>
        </div>

        <div className="filter-section">
          <h3>Connector Types</h3>
          <div className="filter-options column">
            {connectorOptions.length === 0 && <span className="filter-help-text">No connector data yet</span>}
            {connectorOptions.map((name) => (
              <label className="filter-option" key={name}>
                <input
                  type="checkbox"
                  name={`connector-${name}`}
                  checked={localFilters.connectors?.includes(name)}
                  onChange={() => toggleConnector(name)}
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <h3>Search Radius</h3>
          <div className="filter-search-radius">
            <label className="filter-option">
              <span>Search within:</span>
              <span className="radius-value">{localFilters.searchRadius || 10} miles</span>
            </label>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={localFilters.searchRadius || 10}
              onChange={(e) => handleFilterChange('searchRadius', parseInt(e.target.value) || 10)}
              className="radius-slider"
            />
            <div className="slider-labels">
              <span>1 mi</span>
              <span>50 mi</span>
            </div>
            <p className="filter-help-text">Distance from starting location to search for places</p>
          </div>
        </div>

        <div className="filter-section">
          <h3>Walking Time</h3>
          <div className="filter-walking-distance">
            <label className="filter-option">
              <span>Max walking time from location:</span>
              <span className="radius-value">{localFilters.walkingTime || 5} min</span>
            </label>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={localFilters.walkingTime || 5}
              onChange={(e) => handleFilterChange('walkingTime', parseInt(e.target.value) || 5)}
              className="radius-slider"
            />
            <div className="slider-labels">
              <span>1 min</span>
              <span>30 min</span>
            </div>
            <p className="filter-help-text">Only show chargers within this walking time of each location</p>
          </div>
        </div>

        <div className="filter-actions">
          <button 
            className={`apply-filters-button ${hasPendingChanges() ? 'has-changes' : ''}`}
            onClick={applyFilters}
          >
            Apply
          </button>
          <button className="clear-filters-button" onClick={clearFilters}>
            Clear All Filters
          </button>
        </div>
      </div>
    </>
  );
};

export default FilterPanel;

