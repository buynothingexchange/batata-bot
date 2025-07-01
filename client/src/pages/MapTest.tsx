import { useState, useEffect, useRef } from "react";

declare global {
  interface Window {
    L: any;
  }
}

export default function MapTest() {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadLeaflet = async () => {
      // Add Leaflet CSS first and wait for it to load
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
        
        link.onload = () => {
          console.log('Leaflet CSS loaded successfully');
          loadLeafletJS();
        };
        link.onerror = () => {
          console.error('Failed to load Leaflet CSS');
          loadLeafletJS();
        };
      } else {
        loadLeafletJS();
      }
      
      function loadLeafletJS() {
        if (!window.L) {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => {
            console.log('Leaflet JS loaded successfully');
            setMapLoaded(true);
          };
          script.onerror = () => {
            console.error('Failed to load Leaflet JS');
          };
          document.head.appendChild(script);
        } else {
          console.log('Leaflet already available');
          setMapLoaded(true);
        }
      }
    };

    loadLeaflet();
  }, []);

  useEffect(() => {
    if (mapLoaded && mapRef.current) {
      setTimeout(() => {
        if (!mapRef.current) return;
        
        try {
          console.log('Initializing test map...');
          
          const map = window.L.map(mapRef.current).setView([43.7, -79.4], 11);

          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);

          const marker = window.L.marker([43.7, -79.4], { draggable: true }).addTo(map);
          
          console.log('Test map initialized successfully');
        } catch (error) {
          console.error('Error initializing test map:', error);
        }
      }, 1000);
    }
  }, [mapLoaded]);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-2xl mb-4">Map Test Page</h1>
      <div 
        ref={mapRef}
        style={{ 
          height: '400px', 
          width: '100%',
          backgroundColor: '#ccc' 
        }}
      >
        {!mapLoaded && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            Loading map...
          </div>
        )}
      </div>
    </div>
  );
}