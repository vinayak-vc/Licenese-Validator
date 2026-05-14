import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const UNSPLASH_RANDOM_URL =
  "https://api.unsplash.com/photos/random?query=space%20wallpaper&orientation=landscape&client_id=15MDKvUVv4HMJ3DzyeRIwxCFvEB70QeNcKzOCX_Puf0";

export function useWallpaper() {
  const location = useLocation();
  const [wallpaperUrl, setWallpaperUrl] = useState('');

  useEffect(() => {
    // Generate a key based on the path, default to 'home'
    const pageKey = location.pathname === '/' ? 'dashboard' : location.pathname.replace(/\//g, '') || 'home';
    
    const dateKey = `admin_wallpaper_date_${pageKey}`;
    const urlKey = `admin_wallpaper_url_${pageKey}`;
    const today = new Date().toISOString().slice(0, 10);
    
    const cachedDate = localStorage.getItem(dateKey);
    const cachedUrl = localStorage.getItem(urlKey);

    if (cachedDate === today && cachedUrl) {
      setWallpaperUrl(cachedUrl);
      return;
    }

    // Fetch new wallpaper if not cached for today
    fetch(UNSPLASH_RANDOM_URL)
      .then(res => {
        if (!res.ok) throw new Error("Unsplash request failed");
        return res.json();
      })
      .then(data => {
        let pickedUrl = data?.urls?.raw || data?.urls?.full || data?.urls?.regular || "";
        if (pickedUrl) {
          // If it's a raw URL, append optimization params for high-res desktop
          if (pickedUrl.includes('images.unsplash.com')) {
            pickedUrl += "&w=2560&q=85&auto=format&fit=crop";
          }
          setWallpaperUrl(pickedUrl);
          localStorage.setItem(dateKey, today);
          localStorage.setItem(urlKey, pickedUrl);
        }
      })
      .catch(err => {
        console.error("Failed to fetch wallpaper:", err);
        // Fallback to old cache if available even if expired
        if (cachedUrl) {
          setWallpaperUrl(cachedUrl);
        }
      });
  }, [location.pathname]);

  return wallpaperUrl;
}
