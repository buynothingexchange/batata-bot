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
  
  // 2. Build backend with esbuild
  console.log('⚙️ Building backend...');
  execSync('npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --minify', { stdio: 'inherit' });
  
  // 3. Copy any necessary static files
  console.log('📁 Copying static assets...');
  
  // Copy shared schema for runtime access
  if (fs.existsSync('shared')) {
    fs.cpSync('shared', 'dist/shared', { recursive: true });
  }
  
  // 4. Optimize for production
  console.log('🔧 Production optimizations...');
  
  // Create a simple health check endpoint file
  const healthCheck = `
export function getServerHealth() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
}`;
  
  fs.writeFileSync('dist/health.js', healthCheck);
  
  console.log('✅ Heroku post-build completed successfully!');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}