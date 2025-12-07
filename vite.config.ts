import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 5173,
        host: true, // Listen on all addresses
        strictPort: false,
        hmr: {
          clientPort: 5173,
        },
        cors: true,
        allowedHosts: ['all', 'localhost', '127.0.0.1'],
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      },
      envPrefix: ['VITE_', 'NEXT_PUBLIC_'], // Allow both VITE_ and NEXT_PUBLIC_ prefixes
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'esbuild',
        rollupOptions: {
          output: {
            manualChunks: {
              'react-vendor': ['react', 'react-dom'],
              'icons': ['lucide-react'],
            }
          }
        }
      },
      preview: {
        port: 5173,
        host: true,
      }
    };
});
