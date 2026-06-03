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
           figmaVsCode: resolve(__dirname, 'figma-vscode.html'),
          pretextDemo: resolve(__dirname, 'pretext-demo.html'),
          pretextDemoV2: resolve(__dirname, 'pretext-demo-v2.html'),
          catDemo: resolve(__dirname, 'cat-demo.html'),
          catDemoV2: resolve(__dirname, 'cat-demo-v2.html'),
           artemis: resolve(__dirname, 'artemis.html'),
          skinColor: resolve(__dirname, 'skin-color.html'),
          scrollDemo: resolve(__dirname, 'scroll-demo.html'),
            week8: resolve(__dirname, 'week8.html'),
            kat01: resolve(__dirname, 'kat_01.html'),
            seb01: resolve(__dirname, 'seb_01.html'),
            stef01: resolve(__dirname, 'stef_01.html'),
            ferrisWheel: resolve(__dirname, 'ferris-wheel.html'),
            enaDemo: resolve(__dirname, 'ena-demo.html'),
            demo1: resolve(__dirname, 'demo1/index.html'),
        },
       },
     },
   })