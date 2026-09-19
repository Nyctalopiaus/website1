import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexHtml = path.join(__dirname, 'index.html');

const template = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📷</text></svg>" />
    <link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png" />
    <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
    <link rel="manifest" href="./manifest.json" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#f59e0b" />
    <meta name="description" content="AI-graded photography and editing curriculum — 90 assignments across 9 categories, with camera briefs you can pull up in the field." />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Photo Journey" />
    <title>Photo Journey - Art School Photography Coach</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
  </head>
  <body class="min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
    <script src="./register-sw.js"></script>
  </body>
</html>
`;

fs.writeFileSync(indexHtml, template, 'utf8');
console.log('✓ Restored source index.html for Vite compilation.');
