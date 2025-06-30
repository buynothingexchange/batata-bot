# Batata Discord Bot Project

## Overview
A sophisticated Discord bot application designed to streamline cross-server item exchange through intelligent, multi-channel interaction workflows with advanced forum-based communication and user engagement features.

**Core Technologies:**
- TypeScript implementation  
- Advanced Discord API integration
- Dynamic forum post management
- Ephemeral interaction handling
- Flexible item exchange mechanisms with real-time tracking
- Ko-fi donation tracking with webhook integration

## Recent Changes (Latest Updates)

### Interactive Map Location Selection - June 30, 2025
- ✅ **Added OpenStreetMap integration** - interactive map with draggable marker on exchange form
- ✅ **2km radius visualization** - green circle shows approximate coverage area around selected location
- ✅ **Dynamic coordinate capture** - latitude/longitude automatically saved as marker is moved
- ✅ **Clickable Google Maps links in forum posts** - "view location" text links to Google Maps for precise location viewing
- ✅ **Enhanced location information** - forum posts now include both text location and clickable map links
- ✅ **Form validation updates** - backend properly handles lat/lng coordinates from map selections
- ✅ **User-friendly location display** - replaced coordinate numbers with "view location" clickable text
- ✅ **Improved forum post formatting** - streamlined content layout to reduce crowding in thumbnails
- ✅ **Enhanced image display** - removed size constraints to allow Discord's native image handling
- ✅ **Cleaner location links** - simplified map links with map pin emoji for better readability
- ✅ **Added username field to form** - users can now specify their Discord username/display name
- ✅ **Restored proper embed format** - forum posts now use Discord embeds with user attribution and organized fields
- ✅ **Enhanced user identification** - forum posts clearly show who submitted the exchange request
- ✅ **Improved visual organization** - embeds display category, type, and contact information in clean field layout

### Enhanced Forum Post Format and Image Size - June 30, 2025
- ✅ **Restructured forum post content layout** - category now appears first in post content
- ✅ **Separated item description from exchange type** - cleaner presentation of information
- ✅ **Changed "Give" display to "Offer"** - more user-friendly terminology while preserving tags
- ✅ **Made forum post images bigger** - increased image dimensions to 600x600 pixels for better visibility
- ✅ **Maintained tag system integrity** - Discord tags remain unchanged for proper categorization

### Fixed "/exchange" Command Discord Integration - June 30, 2025
- ✅ **Fixed "Unknown Integration" error** - corrected interaction reply format from flags to ephemeral property
- ✅ **Added proper error handling** - enhanced error catching and fallback responses
- ✅ **Improved bot restart process** - automatic command re-registration after fixes
- ✅ **Enhanced logging** - better debugging for slash command processing
- ✅ **Validated command functionality** - /exchange command now properly responds with form URL
- ✅ **Switched to global command registration** - fixed command visibility issues by using Discord global commands
- ✅ **Fixed command iteration errors** - resolved TypeScript iteration issues in command registration
- ✅ **Enhanced command logging** - added detailed command registration feedback for debugging

### Dark Theme with Green Accents - June 30, 2025
- ✅ **Updated theme configuration** - changed from light to dark mode with green primary color
- ✅ **Enhanced form styling** - black background with dark gray card container
- ✅ **Green accent highlights** - title, required fields, and submit button use green color scheme
- ✅ **Improved readability** - light gray text on dark backgrounds for better contrast
- ✅ **Visual consistency** - cohesive dark theme across entire exchange form interface

### Mandatory Image Upload for "Give" Exchange Type - June 30, 2025
- ✅ **Added dynamic image validation** - images now required when exchange type is "Give"
- ✅ **Real-time form validation** - image requirement updates immediately when exchange type changes
- ✅ **Enhanced user feedback** - form label shows "(Required)" or "(Optional)" based on exchange type
- ✅ **Informational text** - explains why image is required for giving items
- ✅ **Manual validation override** - prevents form submission without image for "Give" type
- ✅ **Fixed missing image upload endpoint** - added `/api/upload-image` with proper Imgur integration

### Ko-fi Donation Tracking Integration - June 30, 2025
- ✅ **Added donation database schema** with `donationGoals` and `donations` tables
- ✅ **Implemented Ko-fi webhook endpoint** at `/kofi` for real-time donation processing
- ✅ **Added 4 new slash commands:**
  - `/initgoal` - Create donation progress tracker with goal amount
  - `/resetgoal` - Reset donation total to $0 (admin only)
  - `/donate` - Show Ko-fi donation link with clickable button
  - `/testkofi` - Test Ko-fi webhook functionality (admin only)
- ✅ **Real-time progress updates** with visual progress bars
- ✅ **Automatic goal tracking** across multiple Discord channels
- ✅ **Admin permissions** for sensitive donation commands

### Progress Bar Visual Enhancement - June 30, 2025
- ✅ **Enhanced progress bar design** with colorful visual indicators
- ✅ **Green squares (🟩)** for filled progress portions  
- ✅ **White squares (⬜)** for empty progress portions
- ✅ **Visually accurate proportions** - consistent emoji widths for precise percentage representation
- ✅ **Fixed multiple progress tracker issue** - system now maintains single active goal per guild
- ✅ **Added comprehensive debugging logs** for donation goal tracking

### Ephemeral Responses in Donate Channels - June 30, 2025
- ✅ **All donation command responses ephemeral in donate channels** - `/initgoal`, `/donate`, `/resetgoal`, `/testkofi`
- ✅ **Automatic channel detection** - commands check if channel name contains "donat"
- ✅ **Non-donate channels show public responses** - preserves normal behavior outside donate channels
- ✅ **Enhanced user experience** - reduces clutter in donation channels while maintaining visibility elsewhere

### Avatar Format Updates - June 30, 2025
- ✅ **Changed all user avatar URLs** from animated GIF to static PNG format
- ✅ **Updated contact form submissions** to use PNG avatars
- ✅ **Updated stats display** to use PNG avatars  
- ✅ **Updated forum post embeds** to use PNG avatars

### External Form Integration - June 30, 2025
- ✅ **Updated `/exchange` command** - now provides direct link to external form instead of interactive workflow
- ✅ **Ephemeral form URL responses** - `/exchange` command shows form link only to user who requested it
- ✅ **Configurable form URL** - Uses `EXCHANGE_FORM_URL` environment variable for flexible form server configuration
- ✅ **Added `/api/new-post` endpoint** for external form submissions
- ✅ **Created `createForumPost` function** to handle external data and create Discord forum posts
- ✅ **Full integration with image upload server** - accepts title, description, category, type, image_url, location
- ✅ **Automatic forum posting** with proper formatting, embeds, and database storage
- ✅ **Dynamic Discord forum tag discovery** - automatically maps form categories/types to Discord tag IDs
- ✅ **Smart tag matching** - matches form values to existing forum tags using intelligent name matching
- ✅ **Automatic tag application** - forum posts created with correct category and type tags applied

### Previous Updates
- ✅ **Selective auto-deletion** of ephemeral messages (15 seconds for workflow commands, persistent for informational commands)
- ✅ **Confirmed exchanges tracking** system with /exchanges command for moderators
- ✅ **Exchange tracking** automatically records trades when users mark posts as fulfilled

## Project Architecture

### Database Schema
- **Users, Logs, Bot Config** - Core bot management
- **Allowed Channels** - Channel permission management
- **ISO Requests** - Item request tracking
- **Forum Posts** - Forum post management with auto-bumping
- **Confirmed Exchanges** - Trade completion tracking
- **Donation Goals** - Ko-fi donation progress tracking
- **Donations** - Individual donation records

### API Endpoints
- **Discord Bot Commands** - Slash commands for user interactions
- **Ko-fi Webhook** - `/kofi` endpoint for donation processing
- **Management API** - Bot status, configuration, and logs

### Key Features
1. **Item Exchange System** - ISO request processing with OpenAI categorization
2. **Forum Management** - Auto-bumping, post tracking, claim management
3. **Donation Tracking** - Real-time Ko-fi integration with progress bars
4. **Moderation Tools** - Exchange oversight, channel management
5. **Statistics & Reporting** - User stats, exchange history, donation totals

## User Preferences
- **Communication Style:** Clear, technical explanations with step-by-step processes
- **Code Style:** TypeScript with comprehensive error handling
- **Priority:** Maintain existing exchange functionality while adding donation features
- **Testing:** Use real webhook testing for Ko-fi integration

## Technical Notes
- Ko-fi webhook URL: `https://your-repl-domain.replit.dev/kofi`
- Donation amounts stored in cents for precision
- Progress bars use visual blocks (█) for clear representation
- Admin permissions required for donation reset and testing commands
- All avatar URLs converted to PNG format for consistency

## Next Steps
- Configure Ko-fi webhook URL in Ko-fi dashboard
- Test donation tracking with real Ko-fi donations
- Monitor donation goal progress and Discord message updates
- Verify webhook payload processing matches Ko-fi's format