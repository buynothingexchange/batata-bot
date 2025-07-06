# Deployment Guide for GitHub and Heroku

## Step 1: Prepare for GitHub

### Files to Commit
The current project structure is ready for GitHub. The key files are:

✅ **Source Code**: All TypeScript files in `server/`, `client/`, `shared/`
✅ **Configuration**: `package.json`, `tsconfig.json`, `vite.config.ts`, `drizzle.config.ts`
✅ **Environment Template**: `.env.example` 
✅ **Build Config**: `Procfile` for Heroku
✅ **Documentation**: `README.md`

### What NOT to Commit
The `.gitignore` is correctly set up to exclude:
- `node_modules/` (dependencies - installed during build)
- `dist/` (build output - generated during deployment)
- `.env` (secrets - set via Heroku config)

## Step 2: GitHub Setup

```bash
# Initialize git repository
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit: Batata Discord Bot"

# Add GitHub remote
git remote add origin https://github.com/yourusername/batata-discord-bot.git

# Push to GitHub
git push -u origin main
```

## Step 3: Heroku Deployment

### Quick Deploy
```bash
# Install Heroku CLI first: https://devcenter.heroku.com/articles/heroku-cli

# Login to Heroku
heroku login

# Create app
heroku create your-app-name

# Add PostgreSQL database
heroku addons:create heroku-postgresql:mini

# Set required environment variables
heroku config:set DISCORD_BOT_TOKEN=your_bot_token_here
heroku config:set DISCORD_GUILD_ID=your_guild_id_here
heroku config:set NODE_ENV=production

# Optional but recommended
heroku config:set OPENAI_API_KEY=your_openai_key
heroku config:set IMGUR_CLIENT_ID=your_imgur_client_id

# Deploy
git push heroku main

# Setup database schema
heroku run npm run db:push

# View logs
heroku logs --tail
```

### Environment Variables Required

**Required:**
- `DISCORD_BOT_TOKEN` - Get from Discord Developer Portal
- `DISCORD_GUILD_ID` - Your Discord server ID
- `DATABASE_URL` - Auto-set by Heroku Postgres addon

**Optional:**
- `OPENAI_API_KEY` - For enhanced text processing (fallback exists)
- `IMGUR_CLIENT_ID` - For image uploads (default fallback exists)

**Auto-set by Heroku:**
- `PORT` - Heroku sets this automatically
- `NODE_ENV` - Set to "production"

## Step 4: Discord Bot Setup

1. **Create Discord Application**
   - Go to https://discord.com/developers/applications
   - Click "New Application"
   - Give it a name (e.g., "Batata Bot")

2. **Create Bot**
   - Go to "Bot" tab
   - Click "Add Bot"
   - Copy the Token → `DISCORD_BOT_TOKEN`
   - Enable all Privileged Gateway Intents

3. **Get Guild ID**
   - In Discord, enable Developer Mode (Settings → Advanced)
   - Right-click your server → Copy Server ID → `DISCORD_GUILD_ID`

4. **Invite Bot to Server**
   - Go to "OAuth2" → "URL Generator"
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Administrator` (or specific permissions from README)
   - Use generated URL to invite bot

## Step 5: Verify Deployment

After deployment, check:

1. **App Status**: `heroku ps`
2. **Logs**: `heroku logs --tail`
3. **Database**: `heroku run npm run db:push`
4. **Bot Online**: Check Discord server for bot presence
5. **Commands**: Try `/help` in Discord

## Step 6: Set Up Ko-fi (Optional)

1. Go to Ko-fi Settings → Webhooks
2. Set webhook URL: `https://your-app-name.herokuapp.com/kofi`
3. Test with `/testkofi` command in Discord

## Build Process Explanation

Heroku automatically runs:
1. `npm install` - Install dependencies
2. `npm run build` - Build frontend and backend
3. `npm start` - Start production server

The build process:
- **Frontend**: Vite builds React app to `dist/public/`
- **Backend**: esbuild bundles TypeScript server to `dist/index.js`
- **Production**: Serves both from single Express server on port 5000

## Troubleshooting

### Common Issues

**Build Fails:**
```bash
heroku logs --tail
# Check for missing dependencies or build errors
```

**Bot Not Responding:**
- Verify `DISCORD_BOT_TOKEN` is correct
- Check bot has proper permissions in Discord
- Ensure `DISCORD_GUILD_ID` matches your server

**Database Errors:**
```bash
heroku run npm run db:push
# Re-run database schema setup
```

**Environment Variables:**
```bash
heroku config
# Verify all required variables are set
```

### Useful Commands

```bash
# View current config
heroku config

# Update environment variable
heroku config:set VARIABLE_NAME=new_value

# Restart app
heroku restart

# View database info
heroku pg:info

# Access database console
heroku pg:psql
```

## Production Monitoring

- **Heroku Metrics**: Check app dashboard for performance
- **Bot Status**: Use `/testautobump` to verify bot health
- **Logs**: Monitor with `heroku logs --tail`
- **Database**: Monitor with `heroku pg:diagnose`