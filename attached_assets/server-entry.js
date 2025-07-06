// Copy this file as: server.js
// Main server entry point for Batata Discord Bot

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from the client build directory
app.use(express.static(path.join(__dirname, 'client/dist')));

// Start the Discord bot
async function startBot() {
  try {
    const { initializeBot } = require('./server/discord-bot-fixed');
    await initializeBot();
    console.log('Discord bot initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Discord bot:', error);
  }
}

// Register API routes
async function setupRoutes() {
  try {
    const { registerRoutes } = require('./server/routes');
    await registerRoutes(app);
    console.log('API routes registered successfully');
  } catch (error) {
    console.error('Failed to register routes:', error);
  }
}

// Handle client-side routing (for React Router)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    // Initialize database and bot
    await startBot();
    await setupRoutes();
    
    // Start HTTP server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Bot dashboard available at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
startServer();