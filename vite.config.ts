import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base 를 상대 경로로 두어 하위 경로(GitHub Pages 등)나 file 서버 어디에 올려도 pyodide/ 를 찾는다.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: { target: 'es2022' },
});
