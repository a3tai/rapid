import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  target: 'node24',
  outDir: 'dist',
});
