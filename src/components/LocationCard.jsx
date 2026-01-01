import '../styles/locationCard.css';

const LocationCard = ({ location, distance, onSelect }) => {
  return (
    <div className="location-card" onClick={() => onSelect && onSelect(location)}>
      <div className="location-card-header">
        <h3 className="location-name">{location.name}</h3>
        {distance && <span className="location-distance">{distance}</span>}
      </div>

      {(location.formatted_address || location.vicinity) && (
        <p className="location-address">{location.formatted_address || location.vicinity}</p>
      )}

      {location.chargerCount !== undefined && (
        <div className="location-chargers">
          <span className="charger-count">
            {location.chargerCount} charger{location.chargerCount !== 1 ? 's' : ''} nearby
          </span>
        </div>
      )}
    </div>
  );
};

export default LocationCard;

