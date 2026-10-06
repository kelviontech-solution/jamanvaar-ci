import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production routes /q/ to this app; root /assets/ belongs to Super Admin.
export default defineConfig({
  base: '/q/',
  plugins: [react()],
  server: { port: 5190, strictPort: true },
  preview: { port: 5190 }
});
