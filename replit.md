# Boat GPS Tracker

## Overview
Real-time boat GPS tracking system that receives position data from fishing boats via MQTT and displays them on a live interactive map. Built for fishing competition broadcast control rooms.

## Architecture
- **Frontend**: React + TypeScript + Leaflet.js map with dark CARTO tiles
- **Backend**: Express.js with Socket.io for real-time updates
- **Database**: PostgreSQL for boat positions and metadata
- **MQTT**: Connects to broker at 98.191.147.191:1883 (topics: msh/US/#, msh/2/#, boats/#)

## Authentication
- Password-based auth with bcrypt hashing, express-session with PostgreSQL session store (connect-pg-simple)
- Two roles: **Admin** (full access, delete boats, manage users) and **User** (read-only map access)
- Default admin account created on first startup: username=admin, password=admin
- `/api/xpression` endpoint is open (no auth) for broadcast graphics integration
- Session cookies: HttpOnly, 7-day expiry, SameSite=lax

## Key Files
- `shared/schema.ts` - Database schema (boats, boat_positions, users tables)
- `server/mqtt.ts` - MQTT subscriber, parses position/nodeinfo messages
- `server/routes.ts` - REST API + Socket.io + auth endpoints + DB table creation
- `server/storage.ts` - Database storage layer with Drizzle ORM + user management
- `client/src/pages/Dashboard.tsx` - Main dashboard with map and sidebar (live view)
- `client/src/pages/History.tsx` - Historical track playback by date
- `client/src/pages/Login.tsx` - Login page
- `client/src/pages/Admin.tsx` - Admin user management page
- `client/src/hooks/use-auth.ts` - Auth state hook (login/logout/role checking)
- `client/src/components/BoatMap.tsx` - Leaflet map with boat markers and tracks
- `client/src/components/BoatInfoPanel.tsx` - Selected boat detail panel
- `client/src/components/BoatList.tsx` - Sidebar boat list (delete button admin-only)
- `client/src/components/StatusBar.tsx` - Connection status indicators
- `client/src/hooks/use-boats.ts` - Socket.io hook for real-time boat data
- `client/src/lib/socket.ts` - Socket.io client singleton
- `client/src/lib/types.ts` - TypeScript types and utility functions

## API Endpoints
### Auth (no middleware)
- `POST /api/auth/login` - Login with username/password, returns user object
- `POST /api/auth/logout` - Destroy session
- `GET /api/auth/me` - Current user info (401 if not authenticated)
### Auth (admin only)
- `GET /api/auth/users` - List all users
- `POST /api/auth/users` - Create user { username, password, role }
- `DELETE /api/auth/users/:id` - Delete user
- `PATCH /api/auth/users/:id/role` - Change user role { role }
### Boats (requireAuth)
- `GET /api/boats` - All boats with latest positions (includes logoUrl field)
- `GET /api/boats/:id` - Single boat with 50-position track history
- `GET /api/history/dates` - Available dates with position data
- `GET /api/history?date=YYYY-MM-DD` - All boat tracks for a specific day
- `POST /api/boats/:id/logo` - Upload team logo (requireAuth)
### Boats (admin only)
- `DELETE /api/boats/:id` - Delete a boat and its positions
- `DELETE /api/boats/:id/logo` - Remove team logo
### Public
- `GET /api/xpression` - Simplified JSON for Xpression broadcast graphics (no auth)

## MQTT Message Format
- Position messages (msh/US/#, msh/2/#): `{ type: "position", sender: "!id", payload: { latitude_i, longitude_i, altitude, sats_in_view, time } }`
- NodeInfo messages (msh/US/#, msh/2/#): `{ type: "nodeinfo", sender: "!id", payload: { longname, shortname, hardware } }` (lowercase field names from Meshtastic)
- Custom firmware (boats/{boatId}): `{ id, name, lat, lon, alt, spd, crs, pitch, roll, yaw, sats, hdop, time, bat }` - all fields optional, lat/lon in decimal degrees
- Coordinates are integers divided by 10,000,000 to get decimal degrees

## Recent Changes
- 2026-02-20: Added password-based authentication with Admin and User roles using bcrypt and express-session
- 2026-02-20: Protected all routes with auth middleware; Admin can delete boats and manage users, User has read-only map access
- 2026-02-20: Created Login page with auth guard; default admin account (admin/admin) created on first startup
- 2026-02-20: Added Admin page (/admin) for user management (create, delete, change role)
- 2026-02-20: Added boats/# MQTT topic for custom firmware with pitch, roll, battery_level, battery_voltage, and boat name
- 2026-02-20: Added pitch, roll, batteryLevel, batteryVoltage columns to boats table and API responses
- 2026-02-20: BoatInfoPanel displays pitch, roll, and battery data when available
- 2026-02-11: Added broadcast overlay (/overlay) - full-screen map synced from Dashboard via BroadcastChannel for broadcast output
- 2026-02-11: Added History page (/history) for viewing boat tracks by date with date picker and colored track lines
- 2026-02-11: Updated /api/xpression to use Boats > BoatName > data structure for Xpression compatibility
- 2026-02-09: Added msh/2/# topic subscription (Boat 2 publishes to msh/2/ not msh/US/)
- 2026-02-09: Fixed nodeinfo parser for lowercase field names (longname/shortname from Meshtastic)
- 2026-02-09: Initial build - full GPS tracking system with MQTT, Socket.io, Leaflet map
