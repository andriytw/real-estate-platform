import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Restore custom styles (animations, scrollbar, base styles)
import App from '../App';

console.log('🚀 Starting app entry point...');

// Simple Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null, errorInfo: React.ErrorInfo | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("🚨 ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '2rem', 
          color: '#ef4444', 
          backgroundColor: '#0D0F11', 
          minHeight: '100vh',
          fontFamily: 'monospace'
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            ⚠️ Something went wrong
          </h1>
          <div style={{ padding: '1rem', backgroundColor: '#1C1F24', borderRadius: '0.5rem', border: '1px solid #374151' }}>
            <h2 style={{ color: '#f87171', marginBottom: '0.5rem' }}>{this.state.error?.toString()}</h2>
            <details style={{ marginTop: '1rem' }}>
              <summary style={{ cursor: 'pointer', color: '#9ca3af' }}>Show Error Stack</summary>
              <pre style={{ marginTop: '0.5rem', overflowX: 'auto', fontSize: '0.875rem', color: '#d1d5db' }}>
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{ 
              marginTop: '1.5rem', 
              padding: '0.5rem 1rem', 
              backgroundColor: '#10b981', 
              color: 'white', 
              border: 'none', 
              borderRadius: '0.25rem', 
              cursor: 'pointer' 
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('❌ Could not find root element');
  // Create root element if missing (last resort)
  const newRoot = document.createElement('div');
  newRoot.id = 'root';
  document.body.appendChild(newRoot);
  console.warn('⚠️ Created missing root element');
}

const targetRoot = document.getElementById('root') as HTMLElement;

try {
  const root = ReactDOM.createRoot(targetRoot);
  console.log('✅ React root created, rendering app...');
  
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  
  console.log('✅ Render command issued');
} catch (error) {
  console.error('❌ Fatal Error during root render:', error);
  targetRoot.innerHTML = `
    <div style="padding: 20px; color: white; background: #0D0F11;">
      <h1 style="color: red;">Fatal Error</h1>
      <p>${error instanceof Error ? error.message : String(error)}</p>
    </div>
  `;
}
