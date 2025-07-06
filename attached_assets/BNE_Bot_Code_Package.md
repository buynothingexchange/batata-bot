# Batata Discord Bot - Complete Code Package

This package contains all the essential code files needed to replicate the Batata Discord bot functionality in a new project.

## Core Features
- Exchange request processing with web forms
- Ko-fi donation tracking with progress bars
- Forum post management with auto-bumping
- Location-based exchanges with interactive maps
- Streamlined `/markfulfilled` workflow
- Comprehensive slash commands (12 total)
- Optional OpenAI integration for text processing

## Required Dependencies

### package.json dependencies:
```json
{
  "dependencies": {
    "@neondatabase/serverless": "^0.9.0",
    "@radix-ui/react-accordion": "^1.1.2",
    "@radix-ui/react-alert-dialog": "^1.0.5",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-checkbox": "^1.0.4",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-popover": "^1.0.7",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-separator": "^1.0.3",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-toast": "^1.1.5",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@hookform/resolvers": "^3.3.4",
    "@tanstack/react-query": "^5.28.6",
    "axios": "^1.6.8",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "cmdk": "^1.0.0",
    "cors": "^2.8.5",
    "date-fns": "^3.6.0",
    "discord.js": "^14.14.1",
    "drizzle-kit": "^0.20.14",
    "drizzle-orm": "^0.30.8",
    "drizzle-zod": "^0.5.1",
    "express": "^4.19.2",
    "express-session": "^1.18.0",
    "form-data": "^4.0.0",
    "framer-motion": "^11.0.24",
    "input-otp": "^1.2.4",
    "lucide-react": "^0.368.0",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.28.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.51.2",
    "react-icons": "^5.0.1",
    "tailwind-merge": "^2.2.2",
    "tailwindcss": "^3.4.3",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5.4.3",
    "vaul": "^0.9.0",
    "wouter": "^3.1.0",
    "ws": "^8.16.0",
    "zod": "^3.22.4",
    "zod-validation-error": "^3.0.3"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.18.0",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.12.7",
    "@types/react": "^18.2.79",
    "@types/react-dom": "^18.2.23",
    "@types/ws": "^8.5.10",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tsx": "^4.7.2",
    "vite": "^5.2.8"
  }
}
```

## Environment Variables Required

```bash
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_GUILD_ID=your_discord_guild_id_here

# Database Configuration
DATABASE_URL=your_postgresql_database_url_here

# Optional - OpenAI for enhanced text processing
OPENAI_API_KEY=your_openai_api_key_here

# Optional - Imgur for image uploads
IMGUR_CLIENT_ID=your_imgur_client_id_here

# Replit Domain (auto-configured in Replit)
REPLIT_DOMAINS=your_domain_here
```

## File Structure

```
project-root/
├── server/
│   ├── discord-bot-fixed.ts      # Main Discord bot logic
│   ├── db.ts                     # Database connection
│   ├── storage.ts                # Data storage interface
│   ├── routes.ts                 # API routes
│   ├── openai-service.ts         # OpenAI integration (optional)
│   └── index.ts                  # Server entry point
├── shared/
│   └── schema.ts                 # Database schema definitions
├── client/
│   └── src/
│       └── pages/
│           └── ExchangeForm.tsx  # Web form for exchanges
├── drizzle.config.ts             # Database configuration
├── package.json                  # Dependencies
└── server.js                     # Main server file
```

## Key Configuration Notes

### Discord Bot Permissions Required:
- Read Messages/View Channels
- Send Messages
- Read Message History
- Add Reactions
- Embed Links
- Attach Files
- Use Slash Commands
- Manage Messages (for post management)
- Create Public Threads
- Send Messages in Threads

### Database Setup:
The bot uses PostgreSQL with Drizzle ORM. Main tables:
- users, logs, botConfig
- allowedChannels, isoRequests
- forumPosts, confirmedExchanges
- donationGoals, donations

### Slash Commands (12 total):
1. `/exchange` - Create exchange request via web form
2. `/help` - Show bot help and commands
3. `/markfulfilled` - Mark exchange as completed
4. `/mystats` - Show user statistics
5. `/exchanges` - Show confirmed exchanges (admin)
6. `/contactus` - Contact moderators
7. `/contactusanon` - Anonymous contact
8. `/initgoal` - Initialize donation goal
9. `/resetgoal` - Reset donation progress
10. `/donate` - Show donation link
11. `/testkofi` - Test Ko-fi integration
12. `/testautobump` - Test auto-bump system

## Optional Features

### OpenAI Integration:
- Only used for processing "ISO" text messages
- Has fallback parsing if API key not provided
- Can be completely removed to eliminate costs

### Ko-fi Donation Tracking:
- Webhook endpoint: `/kofi`
- Real-time progress bars
- Multi-channel goal tracking

### Auto-Bump System:
- Automatically bumps inactive forum posts
- Configurable intervals
- Admin testing commands

## Installation Instructions

1. **Set up Discord Bot:**
   - Create application at https://discord.com/developers/applications
   - Create bot and get token
   - Enable required intents: Guilds, Guild Messages, Message Content

2. **Set up Database:**
   - Create PostgreSQL database
   - Run `npm run db:push` to create schema

3. **Configure Environment:**
   - Set all required environment variables
   - Optional: Configure OpenAI and Imgur API keys

4. **Deploy Files:**
   - Copy all code files to your project
   - Install dependencies with `npm install`
   - Start server with `npm run dev`

5. **Discord Setup:**
   - Invite bot to server with required permissions
   - Commands will auto-register on bot startup

## Usage Notes

- **Primary workflow:** Users use `/exchange` command → web form → auto-posted to Discord
- **Legacy support:** Direct "ISO" text messages still processed (with OpenAI)
- **Privacy:** All bot interactions are ephemeral (auto-delete after 2 minutes)
- **Location system:** Interactive maps with neighborhood detection
- **Form authentication:** Token-based security for web forms

## Support & Customization

The bot is highly modular - you can:
- Remove OpenAI integration to eliminate API costs
- Customize channel names and categories
- Modify form fields and validation
- Adjust auto-bump intervals
- Add new slash commands

All core functionality works without OpenAI. The structured web form workflow is the recommended approach for new exchanges.

## Complete File Listing

Here are all the files included in this package:

### Core Bot Files:
- `discord-bot-main.ts` → Copy as `server/discord-bot-fixed.ts`
- `database-schema.ts` → Copy as `shared/schema.ts`
- `storage-interface.ts` → Copy as `server/storage.ts`
- `database-config.ts` → Copy as `server/db.ts`
- `server-routes.ts` → Copy as `server/routes.ts`
- `openai-service.ts` → Copy as `server/openai-service.ts`

### Frontend Files:
- `exchange-form-component.tsx` → Copy as `client/src/pages/ExchangeForm.tsx`

### Configuration Files:
- `drizzle-config.ts` → Copy as `drizzle.config.ts`
- `server-entry.js` → Copy as `server.js`
- `package-json.json` → Use for dependencies

## Quick Setup Guide

1. **Create new project structure:**
   ```
   your-bot-project/
   ├── server/
   ├── shared/
   ├── client/src/pages/
   └── [config files]
   ```

2. **Copy all files** from this package to their respective locations

3. **Install dependencies** using the provided package.json

4. **Set environment variables:**
   - `DISCORD_BOT_TOKEN` (required)
   - `DATABASE_URL` (required)
   - `OPENAI_API_KEY` (optional)
   - `IMGUR_CLIENT_ID` (optional)

5. **Initialize database:**
   ```bash
   npm run db:push
   ```

6. **Start the bot:**
   ```bash
   npm run dev
   ```

The bot will automatically register slash commands and be ready for use!