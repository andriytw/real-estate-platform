import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Import global styles
import App from './App';

console.log('🚀 Starting app...');

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('❌ Could not find root element');
  throw new Error("Could not find root element to mount to");
}

console.log('✅ Root element found');

try {
  const root = ReactDOM.createRoot(rootElement);
  console.log('✅ React root created');
  
  root.render(
    // Disabled StrictMode temporarily to avoid double-invocations in dev
    // <React.StrictMode>
      <App />
    // </React.StrictMode>
  );
  
  console.log('✅ App rendered');
} catch (error) {
  console.error('❌ Error rendering app:', error);
  rootElement.innerHTML = `
    <div style="padding: 20px; color: white; background: #1f2937;">
      <h1 style="color: red;">Error loading app</h1>
      <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
      <p>Check console for details</p>
    </div>
  `;
}
