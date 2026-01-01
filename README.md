# ChargeFinder

A web application that cross-references Google Maps search results with nearby EV chargers from Open Charge Map, helping EV owners find destinations with convenient charging options.

## Features

- 🔍 Search for any location type (gyms, groceries, restaurants, etc.)
- 📍 Automatic geolocation or manual location input
- 🔌 Real-time EV charger proximity data
- 🎛️ Filterable charger results (free/paid, charging speed)
- 🗺️ Interactive map with driving distances
- 🎨 Clean, minimal UI with matte color scheme

## Technology Stack

- **Frontend**: React 18+ with Vite
- **Maps**: Google Maps JavaScript API (with custom Map ID for styling)
- **EV Data**: Open Charge Map API
- **Deployment**: Firebase Hosting

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Get API Keys

You'll need the following API keys:

1. **Google Maps JavaScript API**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable "Maps JavaScript API", "Places API", and "Distance Matrix API"
   - Create credentials and copy your API key

2. **Open Charge Map API** (optional, but recommended)
   - Register at [Open Charge Map](https://openchargemap.org/)
   - Get your API key from your account settings

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory of the project:

```bash
touch .env.local
```

Edit `.env.local` and add your API keys. Here's the complete list of environment variables:

#### Required Variables

```env
# Google Maps API Key (Required)
# Get this from Google Cloud Console after enabling Maps JavaScript API, Places API, and Distance Matrix API
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

#### Optional Variables

```env
# Google Places API Key (Optional)
# If not provided, will fall back to VITE_GOOGLE_MAPS_API_KEY
# You can use the same key for both if you prefer
VITE_GOOGLE_MAPS_API_KEY=your_google_places_api_key_here

# Google Maps Map ID (Optional)
# Used for custom map styling. Get this from Google Cloud Console > Maps > Map Styles
VITE_GOOGLE_MAPS_MAP_ID=your_map_id_here

# Open Charge Map API Key (Optional, but recommended)
# Register at https://openchargemap.org/ to get higher rate limits
VITE_OPEN_CHARGE_MAP_API_KEY=your_open_charge_map_api_key_here
```

#### Complete Example

Here's a complete `.env.local` example with all variables:

```env
VITE_GOOGLE_MAPS_API_KEY=AIzaSyExample123456789
VITE_GOOGLE_MAPS_API_KEY=AIzaSyExample123456789
VITE_GOOGLE_MAPS_MAP_ID=718ed42d62df3f2dc4e6ba9e
VITE_OPEN_CHARGE_MAP_API_KEY=your_ocm_key_here
```

**Important Notes:**
- The `.env.local` file is git-ignored and will not be committed to the repository
- You must restart the development server after changing environment variables
- For detailed Google Maps API setup instructions, see [API_SETUP.md](./API_SETUP.md)
- Make sure billing is enabled in Google Cloud Console (required even for free tier)

### 4. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 5. Build for Production

```bash
npm run build
```

## Deployment to Firebase

### 1. Install Firebase CLI

```bash
npm install -g firebase-tools
```

### 2. Login to Firebase

```bash
firebase login
```

### 3. Initialize Firebase (if not already done)

```bash
firebase init hosting
```

- Select "Use an existing project" or create a new one
- Set public directory to `dist`
- Configure as single-page app: **Yes**
- Set up automatic builds: **No** (or Yes if using GitHub Actions)

### 4. Deploy

```bash
npm run build
firebase deploy
```

## Usage

1. Enter a search query on the landing page (e.g., "Planet Fitness", "Whole Foods", "coffee shops")
2. Click "Go" to search
3. View results on the interactive map showing:
   - Your current location
   - All matching locations
   - Nearby EV chargers for each location
4. Use the filter panel to filter chargers by:
   - **Pricing**: Free, Paid, or All
   - **Speed**: Level 1, Level 2, DC Fast, or All
5. Click on markers to see detailed information
6. View location cards in the sidebar with distances and charger counts

## Project Structure

```
chargefinder/
├── public/
├── src/
│   ├── components/
│   │   ├── LandingPage.jsx
│   │   ├── MapView.jsx
│   │   ├── FilterPanel.jsx
│   │   └── LocationCard.jsx
│   ├── services/
│   │   ├── googleMaps.js
│   │   ├── openChargeMap.js
│   │   └── geolocation.js
│   ├── utils/
│   │   └── distance.js
│   ├── styles/
│   │   ├── global.css
│   │   ├── landing.css
│   │   ├── mapView.css
│   │   ├── filterPanel.css
│   │   └── locationCard.css
│   ├── App.jsx
│   └── main.jsx
├── firebase.json
├── .env.example
└── package.json
```

## API Rate Limits

Be aware of API rate limits:

- **Google Maps APIs**: Free tier includes $200/month credit
- **Open Charge Map**: Free tier is generous but has rate limits

## License

MIT
