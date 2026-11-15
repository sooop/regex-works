import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/** 번들된 JS·CSS 와 파비콘을 index.html 하나에 인라인하고 별도 파일은 내보내지 않는다 */
function inlineSingleFile(): Plugin {
  return {
    name: 'inline-single-file',
    enforce: 'post',
    generateBundle(_o, bundle) {
      const htmlKey = Object.keys(bundle).find((k) => k.endsWith('.html'));
      const html = htmlKey && bundle[htmlKey];
      if (!html || html.type !== 'asset') return;
      let src = String(html.source);
      const take = (href: string) => {
        const key = href.replace(/^\.?\//, '');
        const f = bundle[key];
        if (!f) return null;
        delete bundle[key];
        return f.type === 'chunk' ? f.code : String(f.source);
      };
      src = src.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (m, href) => {
        const css = take(href);
        return css == null ? m : `<style>${css}</style>`;
      });
      src = src.replace(/<script\b[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (m, href) => {
        const js = take(href);
        return js == null ? m : `<script type="module">${js.replace(/<\/script/gi, '<\/script')}</script>`;
      });
      const svg = readFileSync('public/favicon.svg');
      src = src.replace(/(<link rel="icon"[^>]*href=")[^"]+(")/, `$1data:image/svg+xml;base64,${svg.toString('base64')}$2`);
      html.source = src;
    },
  };
}

// base 를 상대 경로로 두어 하위 경로(GitHub Pages 등)나 file 서버 어디에 올려도 pyodide/ 를 찾는다.
// `vite build --mode single` 은 dist-single/index.html 한 파일만 만든다(pyodide/ 는 포함하지 않는다).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [svelte(), ...(single ? [inlineSingleFile()] : [])],
    publicDir: single ? false : 'public',
    build: {
      target: 'es2022',
      ...(single ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false, modulePreload: false, rollupOptions: { output: { inlineDynamicImports: true } } } : {}),
    },
  };
});
