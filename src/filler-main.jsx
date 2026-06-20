import React from 'react';
import ReactDOM from 'react-dom/client';
import FillerSimulator from './pages/FillerSimulator.jsx';

// Standalone PUBLIC entry — mounts ONLY the filler simulator at the root URL.
// Imports NOTHING from App.jsx / firebase / index.css → the build tree-shakes
// to a bundle with zero OPD/firebase code (proven by scripts/verify-filler-bundle.mjs).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FillerSimulator />
  </React.StrictMode>,
);
