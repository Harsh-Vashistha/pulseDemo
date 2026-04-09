# PulseVideo — Video Upload, Sensitivity Processing & Streaming

A full-stack application for uploading videos, processing them for content sensitivity analysis, and streaming them with real-time progress updates.

---

## Architecture Overview

```
PulseAssignment/
├── backend/               # Node.js + Express + MongoDB + Socket.io
│   ├── src/
│   │   ├── config/        # DB connection, Multer config
│   │   ├── middleware/    # JWT auth, RBAC
│   │   ├── models/        # Mongoose: User, Video
│   │   ├── routes/        # auth, videos, admin
│   │   ├── services/      # Sensitivity analysis pipeline
│   │   └── socket/        # Socket.io server
│   ├── tests/             # Jest + Supertest integration tests
│   ├── uploads/           # Local video storage (gitignored)
│   └── server.js          # Entry point
└── frontend/              # React + Vite + Tailwind CSS
    └── src/
        ├── api/           # Axios client
        ├── context/       # AuthContext, SocketContext
        ├── components/    # VideoUpload, VideoCard, VideoPlayer, ProcessingCard, Layout
        └── pages/         # Login, Register, Dashboard, Library, VideoDetail, AdminPanel
```

### Tech Stack

| Layer       | Technology                              |
|-------------|------------------------------------------|
| Backend     | Node.js 20 LTS, Express.js               |
| Database    | MongoDB + Mongoose ODM                   |
| Real-time   | Socket.io 4                              |
| Auth        | JWT (jsonwebtoken) + bcryptjs            |
| File upload | Multer (disk storage, UUID filenames)    |
| Frontend    | React 18, Vite 5                         |
| Styling     | Tailwind CSS 3                           |
| HTTP client | Axios                                    |
| Routing     | React Router v6                          |

---

## Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- MongoDB running locally **or** a MongoDB Atlas connection string

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd PulseAssignment

# Install backend deps
cd backend && npm install

# Install frontend deps
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/pulse_video   # or your Atlas URI
JWT_SECRET=change_me_to_a_long_random_string
JWT_EXPIRES_IN=7d
UPLOAD_DIR=uploads
MAX_FILE_SIZE=524288000   # 500 MB
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 3. Start the Application

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev        # uses nodemon for hot-reload
# or: npm start   # for production
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

> The first registered user is automatically promoted to **Admin**.

---

## User Roles

| Role    | Permissions                                              |
|---------|----------------------------------------------------------|
| Admin   | Full access: user management, all videos, system stats  |
| Editor  | Upload, edit, delete **own** videos                     |
| Viewer  | Read-only access to own assigned videos                 |

---

## API Documentation

Base URL: `http://localhost:5000/api`

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

### Authentication

| Method | Endpoint              | Auth | Description           |
|--------|-----------------------|------|-----------------------|
| POST   | `/auth/register`      | No   | Register new user     |
| POST   | `/auth/login`         | No   | Login, receive token  |
| GET    | `/auth/me`            | Yes  | Get current user      |

**Register request body:**
```json
{ "username": "john", "email": "john@example.com", "password": "secret123" }
```

**Login request body:**
```json
{ "email": "john@example.com", "password": "secret123" }
```

**Response (both):**
```json
{
  "success": true,
  "token": "eyJhbGci...",
  "user": { "id": "...", "username": "john", "email": "...", "role": "editor", "organizationId": "..." }
}
```

---

### Videos

| Method | Endpoint                    | Auth | Role          | Description                        |
|--------|-----------------------------|------|---------------|------------------------------------|
| GET    | `/videos`                   | Yes  | Any           | List videos with filtering         |
| POST   | `/videos/upload`            | Yes  | Editor/Admin  | Upload a video file                |
| GET    | `/videos/:id`               | Yes  | Any           | Get video details                  |
| PATCH  | `/videos/:id`               | Yes  | Editor/Admin  | Update title/description/tags      |
| DELETE | `/videos/:id`               | Yes  | Editor/Admin  | Soft-delete video                  |
| GET    | `/videos/:id/stream`        | Yes  | Any           | Stream video (HTTP range requests) |

**List videos query parameters:**

| Param              | Values                                          |
|--------------------|-------------------------------------------------|
| `status`           | `pending` \| `processing` \| `completed` \| `failed` |
| `sensitivityStatus`| `safe` \| `flagged` \| `unknown`                |
| `search`           | string (searches title, originalName, tags)     |
| `page`             | integer (default: 1)                            |
| `limit`            | integer 1-50 (default: 12)                      |
| `sortBy`           | `createdAt` \| `title` \| `size` (default: createdAt) |
| `sortOrder`        | `asc` \| `desc` (default: desc)                 |

**Upload request** (multipart/form-data):

| Field         | Type   | Required |
|---------------|--------|----------|
| `video`       | File   | Yes      |
| `title`       | string | Yes      |
| `description` | string | No       |
| `tags`        | string | No (comma-separated) |

---

### Admin

| Method | Endpoint                        | Auth | Role  | Description              |
|--------|---------------------------------|------|-------|--------------------------|
| GET    | `/admin/users`                  | Yes  | Admin | List all users           |
| PATCH  | `/admin/users/:id/role`         | Yes  | Admin | Change user role         |
| PATCH  | `/admin/users/:id/status`       | Yes  | Admin | Activate/deactivate user |
| GET    | `/admin/stats`                  | Yes  | Admin | System statistics        |

---

## Real-Time Events (Socket.io)

**Client → Server:**

| Event        | Payload    | Description                               |
|--------------|------------|-------------------------------------------|
| `video:join` | `videoId`  | Subscribe to progress updates for a video |
| `video:leave`| `videoId`  | Unsubscribe from a video room             |

**Server → Client:**

| Event           | Payload                                                    | Description                     |
|-----------------|------------------------------------------------------------|---------------------------------|
| `video:progress`| `{ videoId, progress, stage, label, sensitivityStatus }`  | Progress for a subscribed video |
| `video:update`  | same                                                       | Broadcast to all clients        |

**Processing stages:** `queued` → `validating` → `analyzing` → `classifying` → `finalizing` → `done`

---

## Video Processing Pipeline

1. **Upload Validation** — Multer validates file type (video/\*) and size (≤500 MB)
2. **Secure Storage** — File saved with UUID filename to `uploads/`
3. **Async Processing** — `processVideo()` runs in background via `setImmediate`
4. **Sensitivity Analysis** — Simulates multi-stage AI content screening
5. **Classification** — Tags video as `safe` or `flagged` with a 0–100 score
6. **Real-time Updates** — Each stage emits Socket.io events for live frontend progress

> **Note on sensitivity analysis:** The current implementation uses a heuristic simulation (filename keyword analysis + randomization) to demonstrate the pipeline. In production, replace `src/services/sensitivityAnalysis.js` with calls to a real video AI service (AWS Rekognition, Google Video Intelligence API, etc.).

---

## Running Tests

```bash
cd backend
npm test
```

Tests cover auth registration/login/token validation and video listing/access control using Jest + Supertest against a test MongoDB database.

---

## Design Decisions & Assumptions

1. **Multi-tenant isolation** is implemented via `organizationId` scoped to the user. Non-admin users only see their own videos; admins see everything.

2. **First-user-as-admin** — The first account registered automatically receives the Admin role, enabling easy initial setup without seeding.

3. **Soft delete** — Videos are marked `isDeleted: true` rather than removed from the database, preserving audit history.

4. **Local storage** — Videos are stored on disk in `uploads/`. To switch to S3, replace the Multer `diskStorage` config with `multer-s3`.

5. **Simulated sensitivity analysis** — A real deployment would call an external AI/ML API. The simulated pipeline demonstrates the exact same async flow, Socket.io events, and classification result structure.

6. **Flagged videos are blocked from playback** — The VideoPlayer component displays a warning instead of playing flagged content.

7. **HTTP range requests** — The `/stream` endpoint supports byte-range requests (`Accept-Ranges: bytes`) enabling seeking, buffering, and mobile playback.

---

## Deployment

### Backend (e.g. Railway / Render / Heroku)

1. Set environment variables in the platform dashboard (same as `.env`)
2. Set `MONGODB_URI` to a MongoDB Atlas connection string
3. `npm start`

### Frontend (e.g. Vercel / Netlify)

1. Set `VITE_API_URL` if your backend is not on the same origin
2. Update `vite.config.js` proxy or use absolute URLs in `src/api/index.js`
3. `npm run build` → deploy `dist/`

---

## Security Practices

- Passwords hashed with bcrypt (salt rounds: 12)
- JWT tokens with configurable expiry
- Input validation on all endpoints via `express-validator`
- CORS restricted to frontend origin
- Role-based access enforced on every protected route
- Multi-tenant data isolation at the query level
- File type and size validation before storage
