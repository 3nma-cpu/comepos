import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            output: {
                entryFileNames: `assets/[name].js`,
                chunkFileNames: `assets/[name].js`,
                assetFileNames: `assets/[name].[ext]`
            }
        }
    },
    server: {
        port: 3000,
        open: true,
        proxy: {
            '/api': 'http://localhost:4000'
        }
    }
});
