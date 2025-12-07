import React from 'react';
import ReactDOM from 'react-dom/client';
// REMOVED: import './index.css'; -- We use CDN now to avoid build issues
import App from '../App';

console.log('🚀 Starting app...');

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('❌ Could not find root element');
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
  console.log('✅ App rendered');
} catch (error) {
  console.error('❌ Error rendering app:', error);
}
