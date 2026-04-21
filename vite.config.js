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
          pretextDemo: resolve(__dirname, 'pretext-demo.html'),
          pretextDemoV2: resolve(__dirname, 'pretext-demo-v2.html'),
          catDemo: resolve(__dirname, 'cat-demo.html'),
          catDemoV2: resolve(__dirname, 'cat-demo-v2.html'),
           artemis: resolve(__dirname, 'artemis.html'),
          skinColor: resolve(__dirname, 'skin-color.html'),
          scrollDemo: resolve(__dirname, 'scroll-demo.html'),
        },
       },
     },
   })