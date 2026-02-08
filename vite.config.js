import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import assetsPlugin from './vite-plugin-assets.js';

export default defineConfig({
  plugins: [react(), assetsPlugin()],
});