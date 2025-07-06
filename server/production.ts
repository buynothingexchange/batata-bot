import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit", 
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  // Serve static files from dist/public in production
  const staticPath = path.resolve(process.cwd(), 'dist', 'public');
  
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    log(`Serving static files from ${staticPath}`, "production");
  } else {
    log("Static files directory not found, creating fallback", "production");
    // Create basic index.html fallback if needed
    app.get('*', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Batata Discord Bot</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <div id="root">
              <h1>Batata Discord Bot</h1>
              <p>Bot is running in production mode.</p>
              <p>API endpoints available at /api/*</p>
            </div>
          </body>
        </html>
      `);
    });
  }
}

export async function setupProduction(app: Express) {
  log("Setting up production server", "production");
  serveStatic(app);
}