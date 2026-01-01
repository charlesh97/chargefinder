import { useState } from 'react';
import LandingPage from './components/LandingPage';
import MapView from './components/MapView';
import './styles/global.css';

function App() {
  const [searchData, setSearchData] = useState(null);
  const [currentView, setCurrentView] = useState('landing'); // 'landing' or 'map'

  const handleSearch = (searchInfo) => {
    setSearchData(searchInfo);
    setCurrentView('map');
  };

  const handleBack = () => {
    setCurrentView('landing');
    setSearchData(null);
  };

  return (
    <>
      {currentView === 'landing' ? (
        <LandingPage onSearch={handleSearch} />
      ) : (
        <MapView searchData={searchData} onBack={handleBack} />
      )}
    </>
  );
}

export default App;
