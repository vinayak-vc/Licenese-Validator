import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useFact() {
  const [fact, setFact] = useState(null);
  const location = useLocation();

  useEffect(() => {
    setFact(null); // Reset for transition feel
    fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en')
      .then(res => {
        if (!res.ok) throw new Error("Fact retrieval failed");
        return res.json();
      })
      .then(data => {
        if (data && data.text) {
          setFact(data.text);
        }
      })
      .catch(err => {
        console.error("UselessFact Error:", err);
        setFact(null);
      });
  }, [location.pathname]);

  return fact;
}
