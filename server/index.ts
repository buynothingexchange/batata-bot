import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { initializeBot, processKofiDonation } from "./discord-bot-fixed.js";

// Environment-based server setup function
async function setupEnvironmentServer(app: any, server: any) {
  if (process.env.NODE_ENV === 'production') {
    const { setupProduction } = await import("./production.js");
    return setupProduction(app);
  } else {
    const { setupVite } = await import("./vite.js");
    return setupVite(app, server);
  }
}

// Environment-based logging function
function getLogger() {
  return (message: string, source = "express") => {
    const formattedTime = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit", 
      second: "2-digit",
      hour12: true,
    });
    console.log(`${formattedTime} [${source}] ${message}`);
  };
}

const log = getLogger();

// Track server start time for uptime calculations
const SERVER_START_TIME = new Date();

// Process-level uncaught exception handler to prevent crashes
process.on('uncaughtException', (error) => {
  log(`CRITICAL ERROR: Uncaught exception: ${error.message}`, "server");
  console.error("Stack trace:", error.stack);
  
  // We avoid exiting the process here to keep the server running
  // Instead, we'll rely on our health check/monitoring to recover
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Ko-fi webhook endpoint
app.post('/kofi', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    log(`Ko-fi webhook received: ${JSON.stringify(data)}`, "kofi");
    
    if (data && data.type === 'Donation') {
      const donationAmount = Math.round(parseFloat(data.amount) * 100); // Convert to cents
      
      // Process the donation webhook
      await processKofiDonation({
        kofiTransactionId: data.kofi_transaction_id,
        donorName: data.from_name,
        amount: donationAmount,
        message: data.message,
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

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

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

(async () => {
  try {
    // Initialize Discord bot first
    log("Initializing Discord bot...", "server");
    await initializeBot();
    log("Discord bot initialized successfully", "server");
    
    // Register API routes
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // Setup server based on environment - development uses Vite, production serves static files
    await setupEnvironmentServer(app, server);

    // ALWAYS serve the app on port 5000
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
      log(`Bot dashboard available at http://localhost:${port}`, "server");
    });
  } catch (error) {
    log(`Failed to start server: ${error}`, "server");
    console.error("Server startup error:", error);
    process.exit(1);
  }
})();