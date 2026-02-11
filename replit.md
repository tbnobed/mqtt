# Boat GPS Tracker

## Overview
Real-time boat GPS tracking system that receives position data from fishing boats via MQTT and displays them on a live interactive map. Built for fishing competition broadcast control rooms.

## Architecture
- **Frontend**: React + TypeScript + Leaflet.js map with dark CARTO tiles
- **Backend**: Express.js with Socket.io for real-time updates
- **Database**: PostgreSQL for boat positions and metadata
- **MQTT**: Connects to broker at 98.191.147.191:1883 (topics: msh/US/#, msh/2/#)

## Key Files
- `shared/schema.ts` - Database schema (boats, boat_positions tables)
- `server/mqtt.ts` - MQTT subscriber, parses position/nodeinfo messages
- `server/routes.ts` - REST API + Socket.io setup + DB table creation
- `server/storage.ts` - Database storage layer with Drizzle ORM
- `client/src/pages/Dashboard.tsx` - Main dashboard with map and sidebar (live view)
- `client/src/pages/History.tsx` - Historical track playback by date
- `client/src/components/BoatMap.tsx` - Leaflet map with boat markers and tracks
- `client/src/components/BoatInfoPanel.tsx` - Selected boat detail panel
- `client/src/components/BoatList.tsx` - Sidebar boat list
- `client/src/components/StatusBar.tsx` - Connection status indicators
- `client/src/hooks/use-boats.ts` - Socket.io hook for real-time boat data
- `client/src/lib/socket.ts` - Socket.io client singleton
- `client/src/lib/types.ts` - TypeScript types and utility functions

## API Endpoints
- `GET /api/boats` - All boats with latest positions (includes logoUrl field)
- `GET /api/boats/:id` - Single boat with 50-position track history
- `GET /api/xpression` - Simplified JSON for Xpression broadcast graphics (Boats > BoatName > data)
- `GET /api/history/dates` - Available dates with position data (array of YYYY-MM-DD strings)
- `GET /api/history?date=YYYY-MM-DD` - All boat tracks for a specific day
- `POST /api/boats/:id/logo` - Upload team logo (multipart form, field: "logo", max 2MB, png/jpg/gif/webp)
- `DELETE /api/boats/:id/logo` - Remove team logo

## MQTT Message Format
- Position messages: `{ type: "position", sender: "!id", payload: { latitude_i, longitude_i, altitude, sats_in_view, time } }`
- NodeInfo messages: `{ type: "nodeinfo", sender: "!id", payload: { longname, shortname, hardware } }` (lowercase field names from Meshtastic)
- Coordinates are integers divided by 10,000,000 to get decimal degrees

## Recent Changes
- 2026-02-11: Added broadcast overlay (/overlay) - full-screen map synced from Dashboard via BroadcastChannel for broadcast output
- 2026-02-11: Added History page (/history) for viewing boat tracks by date with date picker and colored track lines
- 2026-02-11: Updated /api/xpression to use Boats > BoatName > data structure for Xpression compatibility
- 2026-02-09: Added msh/2/# topic subscription (Boat 2 publishes to msh/2/ not msh/US/)
- 2026-02-09: Fixed nodeinfo parser for lowercase field names (longname/shortname from Meshtastic)
- 2026-02-09: Initial build - full GPS tracking system with MQTT, Socket.io, Leaflet map
