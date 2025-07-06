# Batata Discord Bot

A sophisticated Discord bot application designed to streamline cross-server item exchange through intelligent, multi-channel interaction workflows with advanced forum-based communication and user engagement features.

## Features

- **Item Exchange System** - ISO request processing with OpenAI categorization
- **Forum Management** - Auto-bumping, post tracking, claim management  
- **Donation Tracking** - Real-time Ko-fi integration with progress bars
- **Moderation Tools** - Exchange oversight, channel management
- **Statistics & Reporting** - User stats, exchange history, donation totals
- **Interactive Web Form** - External form for creating exchange posts
- **Location-based Exchanges** - Neighborhood detection and mapping

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui
- **External APIs**: Discord.js, OpenAI, Imgur, Ko-fi webhooks

## Quick Deploy to Heroku

### 1. Prerequisites
- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed
- Git installed
- Discord Bot Token and Guild ID
- PostgreSQL database (Heroku Postgres recommended)

### 2. Clone and Setup
```bash
git clone <your-repo-url>
cd batata-discord-bot
```

### 3. Deploy to Heroku
```bash
# Login to Heroku
heroku login

# Create Heroku app
heroku create your-app-name

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:mini

# Set environment variables
heroku config:set DISCORD_BOT_TOKEN=your_bot_token
heroku config:set DISCORD_GUILD_ID=your_guild_id
heroku config:set NODE_ENV=production
heroku config:set OPENAI_API_KEY=your_openai_key  # Optional
heroku config:set IMGUR_CLIENT_ID=your_imgur_id   # Optional

# Deploy
git push heroku main

# Run database migrations
heroku run npm run db:push
```

### 4. Bot Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application and bot
3. Copy the bot token to `DISCORD_BOT_TOKEN`
4. Get your Discord server ID for `DISCORD_GUILD_ID`
5. Invite bot to your server with required permissions

## Required Bot Permissions
- Read Messages/View Channels
- Send Messages  
- Read Message History
- Add Reactions
- Embed Links
- Attach Files
- Use Slash Commands
- Manage Messages (for moderation)
- Create Public Threads
- Send Messages in Threads

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Required
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_guild_id  
DATABASE_URL=your_postgresql_url

# Optional but recommended
OPENAI_API_KEY=your_openai_key
IMGUR_CLIENT_ID=your_imgur_client_id

# Production settings
NODE_ENV=production
PORT=5000
```

## Bot Commands

### User Commands
- `/exchange` - Create exchange post via web form
- `/markfulfilled @user` - Mark exchange as completed
- `/mystats` - View your exchange statistics
- `/contactus` - Send message to moderators
- `/help` - Show all available commands

### Donation Commands  
- `/donate` - Show Ko-fi donation link
- `/initgoal amount` - Create donation goal (admin)
- `/resetgoal` - Reset donation progress (admin)

### Admin Commands
- `/exchanges` - View all confirmed exchanges
- `/testautobump` - Test auto-bump system
- `/testkofi` - Test Ko-fi webhook

## Development

### Local Setup
```bash
npm install
cp .env.example .env
# Fill in your environment variables
npm run db:push
npm run dev
```

### Project Structure
```
├── server/           # Backend API and Discord bot
├── client/          # React frontend
├── shared/          # Shared types and schemas  
├── public/          # Static assets
└── dist/           # Built files (auto-generated)
```

## Ko-fi Integration

Set up Ko-fi webhook:
1. Go to Ko-fi Settings → Webhooks
2. Set webhook URL to: `https://your-app.herokuapp.com/kofi`
3. Test with `/testkofi` command

## Support

For issues or questions, use the `/contactus` command in Discord or create a GitHub issue.

## License

MIT License - see LICENSE file for details.