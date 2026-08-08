const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler.middleware');

const app = express();

// ✅ Required when running behind Render's reverse proxy
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  /\.vercel\.app$/,
  /localhost:\d+/,
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowed = allowedOrigins.some((o) =>
        typeof o === 'string' ? o === origin : o.test(origin)
      );

      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
  })
);

app.use(compression());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

app.use('/api', globalLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

const uploadsPath = path.join(process.cwd(), 'uploads');

app.use(
  '/uploads',
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(uploadsPath)
);

console.log(`📁 Serving static files from: ${uploadsPath}`);

app.get('/debug/uploads', (req, res) => {
  const fs = require('fs');

  if (fs.existsSync(uploadsPath)) {
    const files = fs.readdirSync(uploadsPath);

    res.json({
      success: true,
      path: uploadsPath,
      files,
      count: files.length,
    });
  } else {
    res.json({
      success: false,
      path: uploadsPath,
      message: 'Uploads directory does not exist',
    });
  }
});

app.use('/api/v1', routes);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date(),
    env: process.env.NODE_ENV,
    version: '1.0.0',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.url}`,
  });
});

app.use(errorHandler);

module.exports = app;
