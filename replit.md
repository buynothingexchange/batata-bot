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

### Fixed `/markfulfilled` Command Issues and Added Workflow Restrictions - July 1, 2025
- ✅ **Fixed "application did not respond" timeout** - added `/markfulfilled` to the command processing list where it was missing
- ✅ **Implemented workflow restrictions** - `/markfulfilled` now redirects users to proper `/updatepost` workflow instead of allowing direct usage
- ✅ **Added user guidance** - command shows clear instructions on how to properly mark posts as fulfilled through the intended workflow
- ✅ **Enhanced security** - prevents potential forum disruptions by ensuring users follow the proper post management process
- ✅ **Immediate interaction acknowledgment** - uses `deferReply()` to prevent Discord timeout errors on all commands

### Replaced "Mark as Claimed" Button with `/markfulfilled` Command - July 1, 2025
- ✅ **Added new `/markfulfilled` slash command** - private alternative to the "Mark as Claimed" button workflow
- ✅ **Discord native user selection** - command uses Discord's built-in user picker for selecting trading partner
- ✅ **Enhanced privacy protection** - all interactions are ephemeral and only visible to the command user
- ✅ **Automatic post management** - directly marks posts as fulfilled, archives threads, and records exchanges
- ✅ **Removed "Mark as Claimed" button** - eliminated from `/updatepost` interface to streamline workflow
- ✅ **Updated help documentation** - added `/markfulfilled` command explanation and usage instructions
- ✅ **Simplified exchange completion** - single command handles the entire fulfillment process without follow-up steps
- ✅ **Smart post selection** - automatically handles single post or shows dropdown for multiple active posts
- ✅ **Fixed command registration issue** - switched from global to guild-specific registration for immediate command availability

### Critical Ephemeral Message Auto-Delete Fix - July 1, 2025
- ✅ **Fixed /exchange command ephemeral auto-delete** - updated command to use sendEphemeralWithAutoDelete function instead of direct reply
- ✅ **Corrected Discord API ephemeral format** - fixed flags format back to ephemeral: true with proper setTimeout deletion
- ✅ **Added comprehensive auto-delete logging** - improved error handling for ephemeral message deletion attempts
- ✅ **Systematic ephemeral message audit** - identified 35+ instances requiring conversion to auto-delete functionality
- ✅ **Enhanced sendEphemeralWithAutoDelete function** - supports both string and object content with 2-minute default timeout

### Critical Location Memory System Fix - July 1, 2025
- ✅ **Fixed form coordinate submission bug** - form values now properly update with remembered location coordinates instead of using defaults
- ✅ **Enhanced location memory consistency** - both form display and Discord forum posts now use identical coordinates and neighborhood names
- ✅ **Added comprehensive debugging** - form submission logs coordinates to verify correct data transmission
- ✅ **Changed "detected location" to "remembered location"** - updated form UI to avoid privacy concerns about tracking

### Enhanced Ephemeral Message Management - July 1, 2025
- ✅ **Extended auto-delete timing** - all ephemeral messages from Batata now disappear after 2 minutes instead of 15 seconds
- ✅ **Improved user experience** - users have more time to read and act on bot responses before they auto-delete
- ✅ **Cleaner Discord channels** - automatic cleanup prevents message accumulation while maintaining usability
- ✅ **System-wide consistency** - all command responses, confirmations, and error messages use uniform 2-minute timeout

### Improved Google Maps Location Display - July 1, 2025
- ✅ **Enhanced Google Maps URL format** - location links now search for neighborhood area instead of showing exact coordinates
- ✅ **Better neighborhood context** - clicking location links shows broader neighborhood view with 15z zoom level
- ✅ **Improved user experience** - users see neighborhood boundaries and surrounding areas instead of precise pin points
- ✅ **Search-based mapping** - URLs use `/search/` format with neighborhood name for better geographic context

### Enhanced Location System with Neighborhood Detection - July 1, 2025
- ✅ **Removed location text field** - form now uses only interactive map for location selection
- ✅ **Added Nominatim reverse geocoding** - automatically detects neighborhood names from coordinates
- ✅ **Enhanced Discord embeds** - location now displays as clickable neighborhood name linking to Google Maps
- ✅ **Simplified location format** - replaced separate location text and map link with single clickable neighborhood link
- ✅ **Improved user experience** - users see exact neighborhood names (e.g., "📍 Christie Pits") instead of raw coordinates
- ✅ **Backend integration** - coordinates required for all form submissions, neighborhood detection happens server-side
- ✅ **Location memory functionality** - localStorage remembers user's last selected map position for future form visits
- ✅ **Dual location display** - neighborhood appears both in plain text above embed and as clickable link within embed

### Form Success Page Implementation - July 1, 2025
- ✅ **Post-submission success page** - form now displays a comprehensive success page after successful submission
- ✅ **Automatic form closure** - form interface is replaced with success page instead of showing a toast notification
- ✅ **Next steps guidance** - users receive clear instructions about auto-follow, post management, and auto-bump features
- ✅ **Visual confirmation** - success page shows submitted post details with user avatar and categorization
- ✅ **Action buttons** - users can create another post or close the tab directly from success page
- ✅ **Enhanced user experience** - eliminates confusion about what happens next after form submission

### Deleted Post Filtering for Update Command - July 1, 2025
- ✅ **Enhanced `/updatepost` command** - now verifies thread existence before displaying in selection list
- ✅ **Automatic deletion detection** - filters out posts deleted by moderators or users from Discord
- ✅ **Thread verification system** - attempts to fetch each thread ID to confirm it still exists
- ✅ **Clean selection interface** - users only see posts they can actually interact with
- ✅ **Error handling** - gracefully handles inaccessible or deleted threads without breaking functionality
- ✅ **Real-time validation** - verification happens each time `/updatepost` is used for current status

### Auto-Bump Testing Command Implementation - July 1, 2025
- ✅ **Implemented `/testautobump` command** - comprehensive testing tool for auto-bump system verification
- ✅ **Added auto-bump status monitoring** - displays system status, check intervals, and bump statistics
- ✅ **Real-time post analysis** - shows posts eligible for bumping with activity details
- ✅ **Force testing option** - `/testautobump force:true` for manual bump testing on sample posts
- ✅ **Database integration** - proper storage methods for `getAllActiveForumPosts()` functionality
- ✅ **Admin permission control** - command restricted to users with Administrator or Manage Guild permissions
- ✅ **Comprehensive feedback** - detailed embed responses showing system health and test results
- ✅ **Test bump functionality** - limited test bumping with visible test messages and automatic cleanup

### Major Code Streamlining and Optimization - July 1, 2025
- ✅ **Removed 5 layers of redundant error handling** - consolidated to single error suppression utility
- ✅ **Eliminated onboarding tour code** - removed all commented tour components, handlers, and state management
- ✅ **Cleaned up backup files** - removed discord-bot.backup.txt, .bak, .broken, and .fixed.js files
- ✅ **Simplified error suppression logic** - reduced from 150+ lines to 30 lines with same functionality
- ✅ **Removed unused imports and states** - cleaned up ExchangeForm component imports and variables
- ✅ **Code reduction summary:** ~300 lines removed, improved maintainability and performance

### Nominatim Reverse Geocoding Integration - July 1, 2025
- ✅ **Added Nominatim reverse geocoding** - integrated free OpenStreetMap geocoding service
- ✅ **Real-time location detection** - automatically displays human-readable location names when users drag map marker
- ✅ **Custom User-Agent compliance** - follows Nominatim usage policy with proper headers
- ✅ **Smart location parsing** - shows neighborhood/suburb and city for concise location display
- ✅ **Visual feedback system** - loading states and error handling for geocoding requests
- ✅ **Initial location display** - automatically shows Toronto location name when map first loads
- ✅ **Enhanced user experience** - users see both coordinates and readable location names in real-time

### Auto-Follow Forum Posts - July 1, 2025
- ✅ **Implemented auto-follow for external form posts** - users automatically follow forum posts created through the authenticated web form
- ✅ **Enhanced Discord workflow auto-follow** - exchange posts created via Discord already had auto-follow, verified working correctly  
- ✅ **Added auto-follow for contact posts** - users now automatically follow their contact-us forum posts (except anonymous posts)
- ✅ **Fixed URL generation for external forms** - corrected domain generation to use proper REPLIT_DOMAINS environment variable
- ✅ **Comprehensive notification system** - users receive Discord notifications when others respond to their posts regardless of creation method
- ✅ **Consistent user experience** - auto-follow works for all forum post types: exchanges, contacts, and external form submissions

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

### Removed PIF Functionality - June 30, 2025
- ✅ **Eliminated all PIF references** - completely removed PIF (Pay It Forward) functionality from codebase
- ✅ **Simplified exchange system** - now focuses only on Request, Trade, and Give exchange types
- ✅ **Updated forum post titles** - removed "PIF" prefixes, now uses clean "Offer:", "Request:", "Trade:" format
- ✅ **Cleaned up bot messages** - updated greeting and help text to remove PIF references
- ✅ **Streamlined code logic** - removed PIF detection and handling from message processing
- ✅ **Updated OpenAI integration** - simplified item extraction to focus on ISO/exchange requests only

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

### Discord Command Registration Pattern
- **Guild-specific commands**: Appear immediately in Discord (recommended for development)
- **Global commands**: Take up to 1 hour to appear in Discord (better for production)
- Current implementation uses guild-specific registration for immediate availability
- If commands don't appear, check registration method in `registerSlashCommands()` function

## Next Steps
- Configure Ko-fi webhook URL in Ko-fi dashboard
- Test donation tracking with real Ko-fi donations
- Monitor donation goal progress and Discord message updates
- Verify webhook payload processing matches Ko-fi's format