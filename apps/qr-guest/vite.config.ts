import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The customer app is a plain web app served at the site root, so /q/<token> works on any host.
export default defineConfig({
  plugins: [react()],
  server: { port: 5190, strictPort: true },
  preview: { port: 5190 }
});
