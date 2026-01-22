import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Wails v3 shim plugin - injects compatibility shim before any scripts
const wailsShimPlugin = (): Plugin => ({
  name: 'wails-shim',
  transformIndexHtml(html) {
    // Inject the shim in the <head> before any scripts
    const shim = `
    <script>
      // Wails v3 compatibility shim - must run before runtime
      window._wails = window._wails || {};
      window._wails.dispatchWailsEvent = window._wails.dispatchWailsEvent || function(e) {};
      window._wails.invoke = window._wails.invoke || function() { return Promise.resolve(); };
    </script>`;
    return html.replace('<head>', '<head>' + shim);
  },
});

export default defineConfig({
  plugins: [wailsShimPlugin(), react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@bindings': resolve(__dirname, 'bindings'),
    },
  },
  define: {
    // Always true for desktop app - this frontend is only used in Wails
    __IS_WAILS_BUILD__: 'true',
  },
  server: {
    port: 9245,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
