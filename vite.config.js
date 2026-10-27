import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root:'src',
  base:'./',
  publicDir:resolve('public'),
  build:{ outDir:resolve('dist'), emptyOutDir:true, target:'es2022' },
  server:{ host:'127.0.0.1', port:4173, strictPort:true },
});
