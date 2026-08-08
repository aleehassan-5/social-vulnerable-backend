# synergy-backend

> Express.js + Prisma + PostgreSQL backend API for Synergy Social — a full-stack social media platform.

## Tech Stack

- **Runtime:** Node.js + Express.js
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** JWT (access + refresh tokens)
- **Realtime:** Socket.io
- **Queue:** Bull + Redis (optional)
- **Deploy:** Render / Railway

---

## Local Setup

### 1. Clone & install
```bash
git clone https://github.com/YOUR_USERNAME/synergy-backend.git
cd synergy-backend
npm install
```

### 2. Environment variables
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/synergy_social?schema=public"
JWT_SECRET=your_super_secret_jwt_key_32chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_super_secret_refresh_key_32ch
JWT_REFRESH_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
```

### 3. Database setup
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Run
```bash
npm run dev        # development (nodemon)
npm start          # production
```

Server starts at `http://localhost:5000`

---

## API Endpoints

### Auth — `/api/v1/auth`
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/register` | ❌ | Register new user |
| POST | `/login` | ❌ | Login |
| POST | `/logout` | ✅ | Logout |
| POST | `/refresh-token` | ❌ | Refresh JWT |
| GET | `/me` | ✅ | Get current user |

### Users — `/api/v1/users`
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/:username` | ❌ | Get user profile |
| PUT | `/me` | ✅ | Update profile |
| POST | `/:id/follow` | ✅ | Follow user |
| DELETE | `/:id/follow` | ✅ | Unfollow user |
| GET | `/:id/followers` | ❌ | Get followers |
| GET | `/:id/following` | ❌ | Get following |

### Posts — `/api/v1/posts`
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/feed` | ✅ | Get home feed |
| GET | `/explore` | ❌ | Get explore posts |
| POST | `/` | ✅ | Create post |
| DELETE | `/:id` | ✅ | Delete post |

### Notifications — `/api/v1/notifications`
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/` | ✅ | Get all notifications |
| PUT | `/:id/read` | ✅ | Mark one as read |
| PUT | `/read-all` | ✅ | Mark all as read |
| DELETE | `/:id` | ✅ | Delete notification |

### Analytics — `/api/v1/analytics`
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/user/:userId` | ✅ | Get user analytics |
| GET | `/trending` | ❌ | Get trending posts |

### Messages — `/api/v1/messages`
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/conversations` | ✅ | Get all conversations |
| POST | `/conversations` | ✅ | Create conversation |
| GET | `/conversations/:id` | ✅ | Get messages |
| POST | `/conversations/:id` | ✅ | Send message |

### Health Check
```
GET /health
```

---

## Deploy on Render (Free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command:** `node src/server.js`
5. Add Environment Variables (see `.env.example`)
6. Deploy ✅

---

## Related

- **Frontend:** [synergy-frontend](https://github.com/YOUR_USERNAME/synergy-frontend)
