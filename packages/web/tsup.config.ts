import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    treeshake: true,
    clean: true,
    sourcemap: true
  },
  {
    entry: { browser: 'src/index.ts' },
    format: ['iife'],
    globalName: 'FlowLensWeb',
    treeshake: true,
    clean: false,
    sourcemap: false,
    minify: true
  }
])
