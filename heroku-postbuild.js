#!/usr/bin/env node

// Heroku post-build script for production optimization
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting Heroku post-build process...');

try {
  // 1. Build frontend with Vite
  console.log('📦 Building frontend...');
  execSync('npx vite build', { stdio: 'inherit' });
  
  // 2. Build server files for production 
  console.log('⚙️ Building server files...');
  execSync('npx esbuild server/routes.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/routes.js --minify', { stdio: 'inherit' });
  execSync('npx esbuild server/discord-bot-fixed.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/discord-bot-fixed.js --minify', { stdio: 'inherit' });
  execSync('npx esbuild server/storage.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/storage.js --minify', { stdio: 'inherit' });
  execSync('npx esbuild server/db.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/db.js --minify', { stdio: 'inherit' });
  execSync('npx esbuild server/utils.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/utils.js --minify', { stdio: 'inherit' });
  execSync('npx esbuild server/openai-service.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/openai-service.js --minify', { stdio: 'inherit' });

  // 3. Copy shared schema for runtime access
  console.log('📁 Copying shared schema...');
  if (fs.existsSync('shared')) {
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist', { recursive: true });
    }
    fs.cpSync('shared', 'dist/shared', { recursive: true });
  }
  
  // 3. Verify production entry point exists
  console.log('🔧 Verifying production setup...');
  if (!fs.existsSync('server.js')) {
    console.error('❌ Production entry point server.js not found!');
    process.exit(1);
  }
  
  console.log('✅ Heroku post-build completed successfully!');
  console.log('📝 Production server will start with: node server.js');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}