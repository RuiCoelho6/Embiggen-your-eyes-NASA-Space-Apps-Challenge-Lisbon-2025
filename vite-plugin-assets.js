import fs from 'fs';
import path from 'path';

export default function assetsPlugin() {
  return {
    name: 'vite-plugin-assets',
    configureServer(server) {
      // API endpoint to get folders from /assets
      server.middlewares.use('/api/datasets', (req, res) => {
        const assetsPath = path.join(process.cwd(), 'assets');
        
        try {
          const folders = fs.readdirSync(assetsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
          
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ datasets: folders }));
          console.log('✓ Returning datasets:', folders);
        } catch (err) {
          console.error('Error reading assets folder:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    }
  };
}