   import { defineConfig } from 'vite'
   import { resolve } from 'path'

   export default defineConfig({
     base: '/my-first-website/',
     build: {
       rollupOptions: {
         input: {
           main: resolve(__dirname, 'index.html'),
           about: resolve(__dirname, 'about.html'),
           projects: resolve(__dirname, 'projects.html'),
           artemis: resolve(__dirname, 'artemis.html'),
           skinColor: resolve(__dirname, 'skin-color.html'),          scrollDemo: resolve(__dirname, 'scroll-demo.html'),         },
       },
     },
   })