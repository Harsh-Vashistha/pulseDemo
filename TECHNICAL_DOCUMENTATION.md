# PulseVideo — Technical Documentation

> A thorough explanation of every requirement, how it was implemented, which libraries were used, and **why** each decision was made.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Full-Stack Architecture](#2-full-stack-architecture)
3. [Authentication & Security](#3-authentication--security)
4. [Role-Based Access Control (RBAC)](#4-role-based-access-control-rbac)
5. [Multi-Tenant Architecture](#5-multi-tenant-architecture)
6. [Video Upload System](#6-video-upload-system)
7. [Video Processing Pipeline & Sensitivity Analysis](#7-video-processing-pipeline--sensitivity-analysis)
8. [Real-Time Communication (Socket.io)](#8-real-time-communication-socketio)
9. [Video Streaming Service](#9-video-streaming-service)
10. [Database Design](#10-database-design)
11. [Frontend Architecture](#11-frontend-architecture)
12. [State Management](#12-state-management)
13. [Video Player Implementation](#13-video-player-implementation)
14. [Video Library & Filtering](#14-video-library--filtering)
15. [Admin Panel](#15-admin-panel)
16. [Error Handling Strategy](#16-error-handling-strategy)
17. [Project Structure & Code Organisation](#17-project-structure--code-organisation)
18. [Testing](#18-testing)
19. [Stretch Goals Implemented](#19-stretch-goals-implemented)
20. [Assumptions & Design Decisions](#20-assumptions--design-decisions)
21. [Library Reference](#21-library-reference)

---

## 1. Project Overview

PulseVideo is a full-stack web application that allows users to:

- Register and log in securely
- Upload video files
- Have those videos automatically analysed for sensitive content
- Watch real-time processing progress as the analysis runs
- Stream the finished videos directly in the browser
- Manage their video library with search and filtering

The system enforces **role-based access** (admin / editor / viewer) and **multi-tenant data isolation** so each user only ever sees their own content.

---

## 2. Full-Stack Architecture

### Requirement
> Develop using Node.js + Express + MongoDB (backend) and React + Vite (frontend).

### How it was implemented

```
Browser (React + Vite)
       │
       │  HTTP / REST  (port 5173 → proxied to 5000)
       │  WebSocket (Socket.io)
       ▼
Express.js server  (port 5000)
       │
       ├── REST API routes (/api/auth, /api/videos, /api/admin)
       ├── Socket.io server (same HTTP server, shared port)
       └── MongoDB (Mongoose ODM)
```

**Why this stack?**

| Choice | Reason |
|--------|--------|
| Node.js + Express | Lightweight, event-driven, ideal for I/O-heavy tasks like streaming files and handling WebSocket connections simultaneously |
| MongoDB + Mongoose | Document model fits video metadata (flexible schema, easy to add fields like `sensitivityDetails`). Mongoose adds schema validation, middleware hooks, and type casting |
| React + Vite | React's component model makes the real-time UI straightforward. Vite gives near-instant HMR and fast builds compared to CRA or Webpack |
| Tailwind CSS | Utility-first CSS eliminates the need to write separate stylesheets; the dark theme is built entirely with Tailwind utilities |

### Vite Dev Proxy

`frontend/vite.config.js` configures a proxy so that `/api/*` and `/socket.io/*` requests from the React dev server (port 5173) are forwarded to the Express server (port 5000). This means the frontend never hard-codes `http://localhost:5000` — it just calls `/api/...` and Vite handles routing during development. In production you would point Nginx or a reverse proxy to do the same.

```js
// vite.config.js
server: {
  proxy: {
    '/api': { target: 'http://localhost:5000', changeOrigin: true },
    '/socket.io': { target: 'http://localhost:5000', ws: true }
  }
}
```

---

## 3. Authentication & Security

### Requirement
> Secure API endpoints with JWT-based authentication and proper validation.

### Libraries used
- **`jsonwebtoken`** — signs and verifies JWT tokens
- **`bcryptjs`** — hashes passwords before storing them in MongoDB
- **`express-validator`** — validates and sanitises all incoming request bodies

### How it works

#### Password hashing (`src/models/User.js`)

```js
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // skip if password not changed
  this.password = await bcrypt.hash(this.password, 12); // 12 salt rounds
  next();
});
```

A **Mongoose pre-save hook** runs automatically before any `.save()` call. It uses bcrypt with **12 salt rounds** — this makes brute-force attacks computationally expensive (each guess takes ~300ms on modern hardware). The `isModified` check prevents double-hashing when other fields are updated.

The `password` field has `select: false`, which means Mongoose never returns it in queries unless explicitly requested with `.select('+password')`. This prevents accidental password leakage in API responses.

#### Token generation (`src/routes/auth.js`)

```js
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
});
```

A JWT is signed with the user's MongoDB `_id`. The payload only contains the ID — the full user object is re-fetched from the database on each request. This ensures that if a user is deactivated, the next request will correctly return 401 even with a valid token (the `isActive` check in `protect` middleware catches this).

#### Auth middleware (`src/middleware/auth.js`)

The `protect` middleware runs before any protected route. It:

1. Looks for a `Bearer` token in the `Authorization` header (standard for Axios/fetch API calls)
2. Falls back to `?token=` query parameter — this is needed because the browser's native `<video src="...">` tag cannot send custom headers; it just makes a plain GET request. By accepting the token as a query param on the stream endpoint, we allow the video player to authenticate without any JavaScript workaround.
3. Verifies the token signature with `jwt.verify()`
4. Fetches the user from MongoDB to confirm they still exist and are active
5. Attaches `req.user` for downstream route handlers

#### Input validation

Every route that accepts user input uses `express-validator` chains:

```js
body('email').isEmail().normalizeEmail()
body('password').isLength({ min: 6 })
body('username').trim().isLength({ min: 3, max: 30 })
```

`normalizeEmail()` lowercases and trims the email before it ever reaches the database, preventing duplicate accounts like `User@Example.com` vs `user@example.com`.

#### First-user bootstrap

```js
const userCount = await User.countDocuments();
const assignedRole = userCount === 0 ? 'admin' : (role || 'editor');
```

The very first user to register gets the Admin role automatically. This removes the need for a database seed script or a separate setup step.

---

## 4. Role-Based Access Control (RBAC)

### Requirement
> Implement Viewer / Editor / Admin roles with appropriate permissions at every layer.

### How it works

#### Role hierarchy (`src/middleware/rbac.js`)

```js
const roleHierarchy = { viewer: 1, editor: 2, admin: 3 };
```

Roles are assigned numeric levels. The `requireRole(...roles)` middleware calculates the minimum required level and compares it to the requesting user's level:

```js
const requireRole = (...roles) => (req, res, next) => {
  const userLevel = roleHierarchy[req.user.role] || 0;
  const requiredLevel = Math.min(...roles.map(r => roleHierarchy[r] || 99));
  if (userLevel < requiredLevel) return res.status(403).json({ ... });
  next();
};
```

This lets you write `requireRole('editor', 'admin')` and it works for both. If a third role were added (e.g., `moderator` at level 2.5), it slots in without changing any route code.

#### Enforcement at the route level

| Operation | Minimum role |
|-----------|-------------|
| List own videos | viewer |
| View video detail | viewer |
| Upload video | editor |
| Edit video metadata | editor |
| Delete video | editor |
| Access admin panel | admin |
| Change user roles | admin |
| View all users' videos | admin |

#### Ownership enforcement (non-admin users)

For operations like edit and delete, even an editor is only allowed to touch their own videos:

```js
if (req.user.role !== 'admin' && video.uploadedBy.toString() !== req.user._id.toString()) {
  return res.status(403).json({ message: 'Access denied.' });
}
```

This is a second layer of protection beyond `requireRole` — the role check just verifies *type* of permission, the ownership check verifies *scope*.

#### Admin self-protection

An admin cannot change their own role through the admin panel:

```js
// backend/src/routes/admin.js
if (req.params.id === req.user._id.toString()) {
  return res.status(400).json({ message: 'You cannot change your own role.' });
}
```

This prevents a scenario where the only admin accidentally demotes themselves to viewer, locking everyone out of admin functions.

On the frontend, the admin's own row in the user table shows "Cannot modify own account" and the action controls are hidden entirely — so the UI communicates the constraint clearly before the user even tries.

---

## 5. Multi-Tenant Architecture

### Requirement
> Each user can only access their own videos. Support multiple organisations or user groups.

### How it works

Every user has an `organizationId` field. By default, it is set to the user's own `_id`:

```js
organizationId: {
  type: String,
  default: function () { return this._id.toString(); }
}
```

Every video stores the `organizationId` of its uploader. When listing videos:

```js
// Non-admins only see their own content
if (req.user.role !== 'admin') {
  filter.uploadedBy = req.user._id;
}
```

**Why `organizationId` instead of just `uploadedBy`?**

The `organizationId` field is designed for future scaling. If you wanted to support teams — where multiple users share the same organisation and can see each other's videos — you would:

1. Change the default to a team/org identifier on registration
2. Update the filter to `filter.organizationId = req.user.organizationId`

The field is already stored on every User and Video record, so this upgrade would require only a small code change rather than a database migration. The current implementation uses per-user isolation as a safe default.

---

## 6. Video Upload System

### Requirement
> Video upload with metadata handling, file type/size validation, secure storage.

### Library used: Multer

**Multer** is Express middleware specifically designed for `multipart/form-data` requests (file uploads). It intercepts the raw binary stream before it reaches the route handler.

### Configuration (`src/config/multer.js`)

#### Storage engine

```js
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});
```

`diskStorage` writes files directly to disk, which is necessary for streaming (you need the file to be seekable via byte ranges). The filename uses a **UUID v4** instead of the original name. This is important for three reasons:

1. **Security** — prevents path traversal attacks where a malicious filename like `../../server.js` could overwrite server files
2. **Uniqueness** — two users uploading `myvideo.mp4` will not collide
3. **Privacy** — the original filename is not exposed in the URL; it is only stored in the database

The original filename is preserved in the `originalName` database field so users still see their file's name in the UI.

#### File type validation

```js
const allowedMimeTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 
  'video/x-msvideo', 'video/x-ms-wmv', 'video/webm', 'video/ogg', 'video/3gpp'];

if (allowedMimeTypes.includes(file.mimetype)) {
  cb(null, true);
} else {
  cb(new Error('Invalid file type. Only video files are allowed.'), false);
}
```

The MIME type is checked server-side. Client-side type checking (the `accept="video/*"` on the file input) is a UX convenience only — it can be bypassed with browser developer tools. The server-side check is the authoritative guard.

#### Size limit

```js
limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 524288000 } // 500 MB
```

Configured via environment variable so it can be adjusted per deployment without code changes.

### Upload route flow (`src/routes/videos.js`)

1. `requireRole('editor', 'admin')` — only editors and admins can upload
2. Multer middleware runs — saves file to disk, validates type and size
3. `express-validator` checks — validates `title`, `description`, `tags`
4. Video document created in MongoDB
5. `setImmediate(() => processVideo(...))` — kicks off async analysis without blocking the HTTP response
6. `201 Created` returned immediately — the client doesn't wait for processing

**Why `setImmediate` instead of `await`?**

`setImmediate` defers execution to the next iteration of the event loop, after the current I/O events. This means the HTTP response is sent to the client first, then processing starts. If we `await processVideo()` the client would have to wait ~12 seconds (the sum of all processing delays) for a response, which is terrible UX. Instead, the response is instant and the client tracks progress via Socket.io.

### Frontend upload (`src/components/VideoUpload.jsx`)

The upload component:

- Provides a drag-and-drop zone using native HTML5 `dragover`/`drop` events
- Validates file type and size **before** sending to the server (better UX, catches obvious errors instantly)
- Pre-fills the title field from the filename (stripped of extension)
- Sends a `multipart/form-data` request via Axios with an `onUploadProgress` callback
- Displays a live progress bar during the HTTP upload phase (distinct from the processing phase progress bar shown after upload)

```js
const res = await videoAPI.upload(formData, (progressEvent) => {
  const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
  setUploadProgress(pct);
});
```

The Axios `onUploadProgress` callback fires repeatedly as bytes are sent, giving a smooth 0→100% upload bar.

---

## 7. Video Processing Pipeline & Sensitivity Analysis

### Requirement
> Automated content screening, safe/flagged classification, real-time status updates.

### Design decision: Simulated pipeline

A real-world implementation would call an external AI API such as:
- **AWS Rekognition Video** — frame-level content moderation
- **Google Video Intelligence API** — explicit content detection
- **Azure Content Moderator** — text and image moderation

Integrating such a service requires API keys, billing accounts, and network access to external endpoints. Instead, this project implements a **structurally identical pipeline** with simulated timing and heuristic classification. The architecture — async processing, staged progress, Socket.io events, database updates — is exactly the same. Swapping in a real AI API would only require changing the `analyzeContent()` function; nothing else in the pipeline changes.

### The pipeline (`src/services/sensitivityAnalysis.js`)

```
Upload complete
      │
      ▼
[Stage 1] validating  (1.5s) — "Validating file format"        → 10%
      │
      ▼
[Stage 2] analyzing   (2.5s) — "Extracting video frames"       → 30%
      │
      ▼
[Stage 3] analyzing   (3.0s) — "Running content analysis"      → 55%
      │
      ▼
[Stage 4] classifying (2.0s) — "Classifying content"           → 75%
      │
      ▼
[Stage 5] finalizing  (1.5s) — "Finalizing results"            → 90%
      │
      ▼
analyzeContent() runs
      │
      ▼
MongoDB updated: status=completed, sensitivityStatus, sensitivityScore
Socket.io: { progress: 100, stage: 'done' }
```

After each stage delay:
1. MongoDB is updated with the current stage and progress percentage
2. A Socket.io event is emitted so the frontend progress bar updates live

This means if a user refreshes the page mid-processing, they see the current state from the database — there is no purely in-memory state that would be lost.

### Classification logic (`analyzeContent`)

```js
let score = Math.random() * 40 + 20; // baseline: 20–60

for (const kw of SENSITIVE_KEYWORDS) {
  if (nameLower.includes(kw)) { score += 40; break; }
}
for (const kw of SAFE_KEYWORDS) {
  if (nameLower.includes(kw)) { score -= 20; break; }
}

score = Math.max(0, Math.min(100, score)); // clamp to 0–100
const status = score >= 60 ? 'flagged' : 'safe';
```

A score ≥ 60 is classified as **flagged**. To trigger flagging intentionally during testing, name your file something like `violence_test.mp4`. For guaranteed safe, name it `nature_walk.mp4`.

---

## 8. Real-Time Communication (Socket.io)

### Requirement
> Use Socket.io for live processing progress updates shown in the frontend.

### Library: `socket.io` (server) + `socket.io-client` (frontend)

Socket.io provides bidirectional, event-based communication over WebSocket with automatic fallback to HTTP long-polling. It was chosen over raw WebSocket or Server-Sent Events because:

- It has built-in **rooms** (named groups of sockets), which let us efficiently target progress events at only the clients watching a specific video
- It handles reconnection automatically
- The same `http.Server` instance is shared with Express (no extra port needed)

### Server setup (`src/socket/index.js`)

```js
const server = http.createServer(app); // shared HTTP server
initSocket(server);                    // Socket.io attaches here
```

Socket.io attaches to the same TCP server as Express. HTTP requests go to Express routes; WebSocket upgrade requests go to Socket.io — all on port 5000.

### Room-based targeting

When a user opens a video's detail page, the frontend emits:
```js
socket.emit('video:join', videoId);
```

The server adds that socket to a named room:
```js
socket.join(`video:${videoId}`);
```

When the processing service emits a progress event, it targets that room:
```js
io.to(`video:${videoId}`).emit('video:progress', { videoId, ...data });
```

Only clients in that room receive the event. This is efficient — if 100 users are connected but only one is watching video X, only that one socket receives X's progress events.

Additionally, `io.emit('video:update', ...)` broadcasts to **all** connected clients. This powers the Dashboard, which shows processing cards for all the user's in-progress videos without them needing to navigate to each video individually.

### Frontend Socket context (`src/context/SocketContext.jsx`)

A React Context wraps the socket client so any component can access it without prop drilling:

```js
const { onVideoProgress, onVideoUpdate, joinVideoRoom } = useSocket();
```

The socket is initialised once when the user logs in, and the JWT token is passed in the handshake so the server can optionally identify the socket's owner.

---

## 9. Video Streaming Service

### Requirement
> Enable video playback using HTTP range requests (`Accept-Ranges: bytes`).

### Why range requests?

A browser's `<video>` element does not download an entire video before playing. It requests **chunks** — a range of bytes it needs for the current playback position. This is what allows seeking to any point in a video without downloading the whole file first. If the server does not support range requests, the browser must download everything sequentially and seeking is either broken or very slow.

### Implementation (`src/routes/videos.js — /stream endpoint`)

```js
const range = req.headers.range;

if (range) {
  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  const chunkSize = end - start + 1;

  const fileStream = fs.createReadStream(videoPath, { start, end });

  res.writeHead(206, {                           // 206 Partial Content
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': video.mimetype,
  });

  fileStream.pipe(res);
} else {
  // Full file request (initial load, no range header)
  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': video.mimetype,
    'Accept-Ranges': 'bytes',      // tells browser this endpoint supports ranges
  });
  fs.createReadStream(videoPath).pipe(res);
}
```

`fs.createReadStream(path, { start, end })` reads only the requested byte range from disk — the rest of the file is never loaded into memory. This keeps memory usage constant regardless of file size.

### Authentication for streaming

The stream endpoint is protected by the `protect` middleware. Normally, Axios sends an `Authorization: Bearer <token>` header, but the browser's `<video>` element makes plain GET requests with no way to set custom headers.

**Solution**: The auth middleware also accepts `?token=` as a query parameter:

```js
// auth.js
if (!token && req.query.token) {
  token = req.query.token;
}
```

The frontend appends the token to the stream URL:

```js
// VideoPlayer.jsx
const token = localStorage.getItem('token');
const streamUrl = `/api/videos/${video._id}/stream?token=${token}`;
```

**Security consideration**: Putting a token in a URL means it appears in server logs and browser history. This is an acceptable trade-off for media streaming (this pattern is used by many video platforms). A production hardening step would be to generate short-lived (e.g., 5-minute) signed streaming tokens specifically for this purpose, keeping the main JWT out of URLs.

### Flagged content blocking

If a video's `sensitivityStatus` is `'flagged'`, the player renders a warning message instead of the video element:

```jsx
if (video.sensitivityStatus === 'flagged') {
  return <div>⚠️ Content Flagged — cannot play</div>;
}
```

This is enforced at the UI level. A determined user could still hit the stream API directly — adding a server-side check for `sensitivityStatus` on the stream endpoint would be the production hardening step.

---

## 10. Database Design

### Requirement
> Store video metadata, processing status, and user data in MongoDB.

### User schema

| Field | Type | Purpose |
|-------|------|---------|
| `username` | String | Unique display name (3–30 chars) |
| `email` | String | Unique login identifier (lowercased) |
| `password` | String | bcrypt hash, `select: false` |
| `role` | String enum | `viewer` / `editor` / `admin` |
| `organizationId` | String | Tenant isolation key |
| `isActive` | Boolean | Soft-disable without deletion |
| `createdAt` / `updatedAt` | Date | Auto-managed by `timestamps: true` |

### Video schema

| Field | Type | Purpose |
|-------|------|---------|
| `title` | String | User-provided title |
| `filename` | String | UUID-based disk filename |
| `originalName` | String | Original filename for display |
| `mimetype` | String | e.g. `video/mp4` (used in stream Content-Type header) |
| `size` | Number | File size in bytes |
| `uploadedBy` | ObjectId ref User | Ownership |
| `organizationId` | String | Tenant isolation |
| `status` | String enum | `pending` / `processing` / `completed` / `failed` |
| `processingProgress` | Number (0-100) | Current % for progress bar |
| `processingStage` | String enum | Current named stage |
| `sensitivityStatus` | String enum | `unknown` / `safe` / `flagged` |
| `sensitivityScore` | Number | 0–100 score |
| `sensitivityDetails` | Object | Categories, confidence, timestamp |
| `tags` | [String] | User-defined tags |
| `description` | String | Optional description |
| `isDeleted` | Boolean | Soft delete flag |
| `createdAt` / `updatedAt` | Date | Auto-managed |

### Indexes

```js
videoSchema.index({ uploadedBy: 1, status: 1 });   // list queries
videoSchema.index({ organizationId: 1 });           // tenant filtering
videoSchema.index({ sensitivityStatus: 1 });        // content filtering
```

Compound indexes are chosen to match the most common query patterns — listing a user's videos filtered by status is the most frequent operation, so `{ uploadedBy, status }` is indexed together.

### Soft delete

Videos are marked `isDeleted: true` rather than removed from the collection. This preserves audit history and makes recovery possible. All list queries include `{ isDeleted: false }` in the filter.

---

## 11. Frontend Architecture

### Requirement
> React + Vite, responsive design, upload interface, real-time dashboard, video library, media player.

### File structure

```
src/
├── api/index.js          — All Axios calls, centralised
├── context/
│   ├── AuthContext.jsx   — User session state
│   └── SocketContext.jsx — Socket.io client
├── components/
│   ├── Layout.jsx        — Sidebar + navigation shell
│   ├── VideoUpload.jsx   — Drag-and-drop upload form
│   ├── VideoCard.jsx     — Grid card with status badges
│   ├── ProcessingCard.jsx — Real-time progress card
│   └── VideoPlayer.jsx   — Custom video player
└── pages/
    ├── Login.jsx
    ├── Register.jsx
    ├── Dashboard.jsx     — Overview + processing status
    ├── Library.jsx       — Paginated, filterable grid
    ├── VideoDetail.jsx   — Full detail + player + edit
    └── AdminPanel.jsx    — User management table
```

### Routing (`src/App.jsx`)

React Router v6 is used. Routes are split into:
- **Public routes** (`/login`, `/register`) — redirect to dashboard if already logged in
- **Protected routes** (everything else) — redirect to `/login` if not authenticated
- **Admin-only routes** (`/admin`) — redirect to `/dashboard` if not admin

```jsx
function ProtectedRoute({ children, requireAdmin }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;
  if (requireAdmin && user.role !== 'admin') return <Navigate to="/dashboard" />;
  return children;
}
```

The `loading` state prevents a flash of the login page during the token verification check on initial load.

### API layer (`src/api/index.js`)

All HTTP calls go through a single Axios instance:

```js
const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
```

**Request interceptor** — attaches the JWT token to every request automatically. No component ever manually sets `Authorization` headers.

**Response interceptor** — if any request returns 401 (token expired or invalid), the user is logged out and redirected. This handles token expiry gracefully across the whole app from one place.

---

## 12. State Management

### Requirement
> State Management: Context API or Redux.

### Choice: React Context API

Redux was not used because the application's state is relatively simple:
- Auth state (one user object, token) — managed by `AuthContext`
- Socket connection — managed by `SocketContext`
- Page-level state (videos list, loading, filters) — local `useState` in each page component

Redux adds significant boilerplate (actions, reducers, selectors) that would not be justified for this scope. Context API is built into React and sufficient for global state that changes infrequently (auth, socket).

### AuthContext (`src/context/AuthContext.jsx`)

Provides: `user`, `loading`, `login()`, `register()`, `logout()`, `isAdmin`, `isEditor`

On mount, it reads a saved user from `localStorage` and re-validates the token against the server via `GET /api/auth/me`. If the token is invalid (expired, tampered), the user is logged out. This means the UI always reflects the true server-side state, even after the browser is reopened.

### SocketContext (`src/context/SocketContext.jsx`)

The socket client is created once when the user is authenticated. It exposes helper functions:

- `joinVideoRoom(id)` — tells server to send this socket progress for that video
- `onVideoProgress(callback)` — subscribe to per-video progress events
- `onVideoUpdate(callback)` — subscribe to all video updates (for dashboard)

Components call these directly without knowing anything about the underlying socket implementation.

---

## 13. Video Player Implementation

### Requirement
> Integrated video playback for processed content with responsive design.

### Implementation (`src/components/VideoPlayer.jsx`)

A custom player built on the native HTML5 `<video>` element. The native element handles all decoding, buffering, and range request negotiation with the server. The custom layer adds:

- Play/pause button
- Seekable progress bar (bound to `currentTime` / `duration`)
- Volume slider + mute toggle
- Fullscreen toggle using the Fullscreen API (`element.requestFullscreen()`)
- Time display (`currentTime / duration`)

**Why not use an existing player library (Video.js, Plyr)?**

A custom player keeps the bundle lean and gives full control over styling (dark theme, Tailwind classes). The native `<video>` API provides everything needed here.

### Event bindings

```jsx
<video
  onPlay={() => setPlaying(true)}
  onPause={() => setPlaying(false)}
  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
  onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
  onError={() => setError('Failed to load video.')}
/>
```

These native video events keep the React state in sync with the actual player state. `onLoadedMetadata` fires when the browser has parsed enough of the video to know its duration — this is used to set the seek bar's max value.

The controls overlay uses `group-hover` (Tailwind) to appear only when hovering the player, giving a clean cinema-like experience.

---

## 14. Video Library & Filtering

### Requirement
> Video listing with filtering capabilities. Stretch goal: filter by safety status, metadata, custom categories (tags).

### All stretch goal filters are implemented

The Library page (`src/pages/Library.jsx`) supports:

| Filter | Implementation |
|--------|---------------|
| Full-text search | MongoDB `$regex` on `title`, `originalName`, `tags` |
| Status filter | Exact match on `status` field |
| Sensitivity filter | Exact match on `sensitivityStatus` field |
| Sort by date | `sort({ createdAt: -1 })` |
| Sort by title | `sort({ title: 1 })` |
| Sort by size | `sort({ size: -1 })` |
| Tags | Stored as array on each video, searchable via regex |
| Pagination | `skip()` + `limit()` with page/pages metadata |

### Backend query construction (`src/routes/videos.js`)

```js
const filter = { isDeleted: false };
if (req.user.role !== 'admin') filter.uploadedBy = req.user._id;
if (status) filter.status = status;
if (sensitivityStatus) filter.sensitivityStatus = sensitivityStatus;
if (search) {
  filter.$or = [
    { title: { $regex: search, $options: 'i' } },
    { originalName: { $regex: search, $options: 'i' } },
    { tags: { $in: [new RegExp(search, 'i')] } },
  ];
}
```

All filters compose on the same `filter` object and run in a single MongoDB query. `$options: 'i'` makes the regex case-insensitive.

### Real-time updates in the library

The Library page subscribes to `video:update` events. When a processing video completes, its card in the grid updates in-place without a page refresh:

```js
const cleanup = onVideoUpdate((data) => {
  setVideos(prev => prev.map(v =>
    v._id === data.videoId
      ? { ...v, status: data.stage === 'done' ? 'completed' : v.status, ... }
      : v
  ));
});
```

---

## 15. Admin Panel

### Requirement
> Admin Role: Full system access, user management, system settings, view all users' videos.

### Implementation (`src/pages/AdminPanel.jsx`)

The admin panel shows:

1. **System statistics** — total users, total videos, currently processing, safe count, flagged count (from `GET /api/admin/stats`)
2. **User management table** — every registered user with their role and active status

For each user (except the current admin themselves), the admin can:
- **Change role** — inline `<select>` that calls `PATCH /api/admin/users/:id/role` on change
- **Activate/Deactivate** — toggles `isActive` which effectively blocks that user's token validation

The current admin's own row shows "Cannot modify own account" instead of the controls. This is enforced in both the frontend (hidden controls) and backend (400 error if attempted via API).

---

## 16. Error Handling Strategy

### Requirement
> Comprehensive error management and user feedback.

### Backend

**Global error handler in `src/app.js`:**

```js
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});
```

All unhandled errors fall through to this middleware. In development, the full stack trace is included in the response to aid debugging. In production (`NODE_ENV=production`), the stack is hidden to prevent information leakage.

**Multer errors** are caught inline in the upload route and returned as 400 responses before the global handler sees them:

```js
upload.single('video')(req, res, (err) => {
  if (err) return res.status(400).json({ success: false, message: err.message });
  next();
});
```

**File cleanup on validation failure:**

```js
if (errors.isEmpty() === false) {
  if (req.file) fs.unlinkSync(req.file.path); // remove orphaned upload
  return res.status(400).json({ ... });
}
```

If the title validation fails after Multer has already saved the file to disk, the file is deleted immediately to prevent orphaned uploads accumulating.

### Frontend

- Every API call is wrapped in `try/catch`
- Error messages from the server are displayed in red alert boxes next to the relevant form or action
- The Axios response interceptor handles 401 globally (auto-logout)
- The VideoPlayer shows an error overlay if the video element fires an `error` event

---

## 17. Project Structure & Code Organisation

### Requirement
> Clear separation of concerns, modular architecture, configuration management.

```
backend/
├── server.js              ← Entry point: creates HTTP server, connects DB, inits Socket
├── src/app.js             ← Express app setup (routes, middleware, error handler)
├── src/config/
│   ├── db.js              ← MongoDB connection logic
│   └── multer.js          ← File upload configuration
├── src/middleware/
│   ├── auth.js            ← JWT verification
│   └── rbac.js            ← Role enforcement
├── src/models/
│   ├── User.js            ← User schema + bcrypt hooks
│   └── Video.js           ← Video schema + indexes
├── src/routes/
│   ├── auth.js            ← /api/auth/*
│   ├── videos.js          ← /api/videos/*
│   └── admin.js           ← /api/admin/*
├── src/services/
│   └── sensitivityAnalysis.js  ← Processing pipeline
├── src/socket/
│   └── index.js           ← Socket.io server setup
└── tests/
    ├── auth.test.js
    └── videos.test.js
```

**Why `server.js` is separate from `src/app.js`:**

`app.js` exports a pure Express application with no side effects. `server.js` creates the HTTP server and starts listening. This separation lets the test suite import `app.js` directly and bind it to a test port/database without any port conflicts or real database connections bleeding between test files.

### Configuration management

All environment-specific values live in `.env`:

```
PORT, MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN,
UPLOAD_DIR, MAX_FILE_SIZE, NODE_ENV, FRONTEND_URL
```

`dotenv` loads this file at the very start of `server.js` (`require('dotenv').config()`). No values are hard-coded in the application code.

---

## 18. Testing

### Requirement
> Basic testing implementation for critical functionalities.

### Stack: Jest + Supertest

- **Jest** is the test runner and assertion library
- **Supertest** wraps the Express app and lets you make HTTP requests in tests without starting a real server

### Auth tests (`tests/auth.test.js`)

Covers:
- Successful user registration (201, token returned, first user is admin)
- Duplicate email rejection (409)
- Successful login (200, token returned)
- Wrong password rejection (401)
- Fetching own profile with valid token (200)

### Video tests (`tests/videos.test.js`)

Covers:
- Empty video list returns correctly (200, empty array)
- Unauthenticated list request rejected (401)
- Non-existent video returns 404

Each test file connects to a **separate test database** (`pulse_video_test`, `pulse_video_test_videos`) and drops it after the suite finishes. This keeps tests fully isolated.

---

## 19. Stretch Goals Implemented

| Stretch Goal | Status | Where |
|---|---|---|
| Filter by safety status (safe/flagged) | ✅ Implemented | Library page filter + backend query |
| Filter by upload date | ✅ Implemented | Sort by `createdAt` asc/desc |
| Filter by file size | ✅ Implemented | Sort by `size` desc |
| Custom categories (tags) | ✅ Implemented | Tags field on upload, tag search in library |
| Full-text search | ✅ Implemented | Regex search on title, originalName, tags |
| Caching strategy | ⚠️ Partial | Browser caches static assets via Vite; no server-side cache layer |
| Video compression | ❌ Not implemented | Would require FFmpeg integration |
| CDN integration | ❌ Not implemented | Would require cloud storage (S3 + CloudFront) |

---

## 20. Assumptions & Design Decisions

| Decision | Rationale |
|---|---|
| **Simulated sensitivity analysis** | No external AI API credentials required. The pipeline architecture is production-ready; only `analyzeContent()` would need replacement |
| **Local file storage** | Simplifies setup. Switching to S3 requires only changing the Multer storage engine to `multer-s3` |
| **First user is admin** | Eliminates need for a seed script or out-of-band admin setup |
| **Soft delete** | Preserves audit trail. Videos marked `isDeleted` are filtered out of all queries |
| **Token in stream URL query param** | Required because browser `<video>` cannot send custom headers. Trade-off: token appears in server logs |
| **organizationId defaults to user._id** | Enables per-user isolation today while making team-based multi-tenancy a small future change |
| **Score ≥ 60 = flagged** | Arbitrary threshold for the simulation. A real AI API would return its own confidence scores |
| **Socket.io rooms per video** | Avoids broadcasting progress to every connected client; only interested watchers receive events |
| **Admin cannot modify own account** | Prevents accidental self-lockout |
| **No email verification** | Out of scope for this assignment; would require an SMTP service |

---

## 21. Library Reference

### Backend dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.19 | HTTP server and routing framework |
| `mongoose` | ^8.4 | MongoDB ODM with schema validation, middleware hooks, and type casting |
| `socket.io` | ^4.7 | WebSocket server with room support and fallback transport |
| `multer` | ^1.4.5-lts | Multipart form-data parser and file storage middleware |
| `jsonwebtoken` | ^9.0 | JWT creation (`sign`) and verification (`verify`) |
| `bcryptjs` | ^2.4 | Password hashing (pure JavaScript, no native bindings required) |
| `express-validator` | ^7.1 | Declarative request body validation and sanitisation |
| `uuid` | ^9.0 | UUID v4 generation for unique filenames |
| `dotenv` | ^16.4 | Loads `.env` file into `process.env` |
| `cors` | ^2.8 | Cross-Origin Resource Sharing headers |
| `nodemon` | ^3.1 | Auto-restarts server on file change (dev only) |
| `jest` | ^29.7 | Test runner and assertion library |
| `supertest` | ^7.0 | HTTP assertion library for testing Express apps |

### Frontend dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.3 | UI component library |
| `react-dom` | ^18.3 | React renderer for the browser |
| `react-router-dom` | ^6.23 | Client-side routing with protected route support |
| `socket.io-client` | ^4.7 | WebSocket client that connects to the Socket.io server |
| `axios` | ^1.7 | HTTP client with interceptors for auth token injection and global 401 handling |
| `vite` | ^5.3 | Build tool with HMR, dev proxy, and fast production builds |
| `@vitejs/plugin-react` | ^4.3 | Vite plugin enabling JSX transform and React Fast Refresh |
| `tailwindcss` | ^3.4 | Utility-first CSS framework |
| `autoprefixer` | ^10.4 | PostCSS plugin that adds vendor prefixes automatically |
| `postcss` | ^8.4 | CSS transformation tool (required by Tailwind) |
