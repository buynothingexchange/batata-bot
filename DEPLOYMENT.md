# Production Deployment Guide

## 🚀 Heroku Deployment (Recommended)

Your Batata Discord Bot is now **100% production-ready** with all import issues resolved and comprehensive deployment setup completed.

### Quick Deploy Steps

1. **Push to GitHub**:
```bash
git init
git add .
git commit -m "Production-ready Batata Discord Bot v1.0"
git branch -M main
git remote add origin https://github.com/yourusername/batata-discord-bot.git
git push -u origin main
```

2. **Deploy to Heroku**:
```bash
# Create Heroku app
heroku create your-app-name

# Add PostgreSQL database
heroku addons:create heroku-postgresql:mini

# Set required environment variables
heroku config:set DISCORD_BOT_TOKEN=your_bot_token_here
heroku config:set DISCORD_GUILD_ID=your_guild_id_here

# Deploy
git push heroku main

# Setup database schema
heroku run npm run db:push
```

### Environment Variables

**Required**:
- `DISCORD_BOT_TOKEN` - From Discord Developer Portal
- `DISCORD_GUILD_ID` - Your Discord server ID
- `DATABASE_URL` - Auto-set by Heroku PostgreSQL addon

**Optional**:
- `OPENAI_API_KEY` - For enhanced ISO text processing
- `IMGUR_CLIENT_ID` - For image upload functionality

### Production Features

✅ **All 12 Discord commands working**:
- `/exchange` - External form link
- `/help` - Command documentation  
- `/markfulfilled` - Mark posts as completed
- `/mystats` - User statistics
- `/exchanges` - View all exchanges (admin)
- `/contactus` - Create contact posts
- `/contactusanon` - Anonymous contact posts
- `/initgoal` - Create donation goal
- `/resetgoal` - Reset donation progress
- `/donate` - Show Ko-fi link
- `/testkofi` - Test Ko-fi webhook
- `/testautobump` - Test auto-bump system

✅ **Production optimizations**:
- No Vite dependencies in production build
- Minified server code with esbuild
- Efficient module resolution 
- Memory usage optimization
- Health monitoring with reconnection logic

### Ko-fi Integration

Set webhook URL in Ko-fi dashboard:
```
https://your-app-name.herokuapp.com/kofi
```

Test with `/testkofi` command in Discord (admin only).

### Troubleshooting

**Build Failures**:
```bash
heroku logs --tail
```

**Bot Not Responding**:
1. Verify `DISCORD_BOT_TOKEN` is correct
2. Check bot permissions in Discord
3. Ensure `DISCORD_GUILD_ID` matches your server

**Database Issues**:
```bash
heroku run npm run db:push
heroku pg:diagnose  
```

## 🔄 Alternative Deployment Options

### Railway
1. Connect GitHub repository
2. Add environment variables
3. Deploy automatically

### Render
1. Connect GitHub repository  
2. Set build command: `node heroku-postbuild.js`
3. Set start command: `node server.js`
4. Add environment variables

### DigitalOcean App Platform
1. Import from GitHub
2. Configure build and run commands
3. Add environment variables
4. Deploy

## 📊 Monitoring Production

**Health Check**: `https://your-app-name.herokuapp.com/api/bot/status`

**View Logs**: `heroku logs --tail`

**Database Status**: `heroku pg:info`

**Bot Commands**: All commands accessible immediately in Discord

## 🎉 Success Verification

After deployment, verify:

1. **Bot is online** in Discord server
2. **Commands work**: Try `/help` command
3. **Database connected**: Try `/mystats` command  
4. **Web dashboard**: Visit your Heroku app URL
5. **Ko-fi webhook**: Test with `/testkofi` (admin only)

Your Discord bot is now enterprise-ready for production deployment!