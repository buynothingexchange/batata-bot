// Production entry point for Heroku deployment
// This file avoids importing any Vite dependencies

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
// Import path resolution for production
const isProduction = process.env.NODE_ENV === 'production';
const basePath = isProduction ? './dist' : './server';

const { registerRoutes } = await import(`${basePath}/routes.js`);
const { initializeBot, processKofiDonation } = await import(`${basePath}/discord-bot-fixed.js`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple logging function for production
function log(message, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit", 
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// Track server start time for uptime calculations
const SERVER_START_TIME = new Date();

const app = express();

// Parse JSON with larger limit for image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ko-fi webhook endpoint (must be before other middleware)
app.post('/kofi', async (req, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    
    if (data.verification_token) {
      log(`Ko-fi webhook received: ${data.type} - $${data.amount} from ${data.from_name}`, "kofi");
      
      await processKofiDonation({
        amount: parseFloat(data.amount) * 100, // Convert to cents
        kofiTransactionId: data.kofi_transaction_id,
        message: data.message,
        donorName: data.from_name,
        email: data.email,
        isPublic: data.is_public !== false
      });
      
      log(`Processed Ko-fi donation of $${data.amount} from ${data.from_name}`, "kofi");
    }
    
    res.status(200).send('OK');
  } catch (error) {
    log(`Ko-fi webhook error: ${error}`, "kofi");
    res.status(500).send('Error processing donation');
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Serve static files from dist (production build output)
const staticPath = path.join(__dirname, 'dist');
app.use(express.static(staticPath));

// Catch-all handler: serve index.html for SPA routing
app.get('*', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send(`
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
    }
  });
});

// Error handling middleware
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  console.error('Server error:', err);
});

// Main startup function
async function startServer() {
  try {
    // Initialize Discord bot first
    log("Initializing Discord bot...", "server");
    await initializeBot();
    log("Discord bot initialized successfully", "server");
    
    // Register API routes
    const server = await registerRoutes(app);

    // Start server
    const port = process.env.PORT || 5000;
    server.listen(port, '0.0.0.0', () => {
      log(`serving on port ${port}`);
      log(`Bot dashboard available at http://localhost:${port}`, "server");
    });
  } catch (error) {
    log(`Failed to start server: ${error}`, "server");
    console.error("Server startup error:", error);
    process.exit(1);
  }
}

// Start the server
startServer();