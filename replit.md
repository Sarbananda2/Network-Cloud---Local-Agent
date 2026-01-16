# NetworkCloud Web Application

## Overview

NetworkCloud is a read-only web application for viewing and monitoring network devices. It provides authenticated users with a dashboard to view registered devices, their status (online/offline/away), Wi-Fi IP addresses, and availability timestamps. The application is strictly a display interface—it does not detect network changes, trigger IP fetching, or mutate device state.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Animations**: Framer Motion for page transitions and hover effects
- **Build Tool**: Vite with custom Replit plugins for development

The frontend follows a component-based architecture with:
- Pages in `client/src/pages/` (Login, DeviceList, DeviceDetail)
- Reusable UI components in `client/src/components/ui/` (shadcn/ui)
- Custom hooks in `client/src/hooks/` for auth and data fetching
- Protected routes that redirect unauthenticated users to login

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful JSON API under `/api/*` routes
- **Authentication**: Replit Auth via OpenID Connect with Passport.js
- **Session Management**: PostgreSQL-backed sessions via `connect-pg-simple`

The backend is intentionally minimal—it only serves device data and handles authentication. All device state mutations happen externally (via a local agent not part of this codebase).

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Tables**:
  - `users` - User accounts from Replit Auth
  - `sessions` - Session storage for authentication
  - `devices` - Device registry with name, status, timestamps
  - `device_network_states` - IP addresses and network state per device

### API Contract
Defined in `shared/routes.ts` using Zod schemas:
- `GET /api/auth/user` - Current authenticated user
- `GET /api/devices` - List user's devices
- `GET /api/devices/:id` - Single device details
- `GET /api/devices/:id/network-state` - Device network information
- `DELETE /api/account` - Permanently delete user account and all associated data

### Key Constraints
The web app must never:
- Detect network changes
- Trigger IP fetching
- Mutate device state
- Communicate with local agents
- Contain OS-level logic

## External Dependencies

### Database
- **PostgreSQL**: Required for data persistence
- **Connection**: Via `DATABASE_URL` environment variable
- **ORM**: Drizzle with `drizzle-kit` for migrations (`npm run db:push`)

### Authentication
- **Replit Auth**: OpenID Connect provider (Google and Email/magic link only)
- **HTML-based Redirects**: Auth flows use HTML pages with titles instead of HTTP 302 redirects to prevent URL flashes in browser tabs
- **Auth Endpoints**:
  - `/api/login-start` - HTML page that redirects to `/api/login` (shows "NetworkCloud" in tab)
  - `/api/login` - Initiates OIDC authentication
  - `/api/callback` - Processes auth response with HTML redirect to `/`
  - `/api/logout` - Ends session with HTML redirect to OIDC end-session URL
- **Required Environment Variables**:
  - `ISSUER_URL` (defaults to `https://replit.com/oidc`)
  - `REPL_ID` (automatically set by Replit)
  - `SESSION_SECRET` (for session encryption)
  - `DATABASE_URL` (for session storage)

### Third-Party Libraries
- **UI**: Radix UI primitives, shadcn/ui components, Lucide icons
- **Data**: TanStack React Query, Zod for validation
- **Dates**: date-fns for timestamp formatting
- **Styling**: Tailwind CSS, class-variance-authority, clsx, tailwind-merge
- **Typography**: Google Sans Flex (primary, for modern browsers), Roboto (fallback)