import dotenv from 'dotenv';
dotenv.config(); // Deploy: 2026-05-15T21:39
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import productsRoutes from './routes/products.routes.js';
import providersRoutes from './routes/providers.routes.js';
import purchasesRoutes from './routes/purchases.routes.js';
import salesRoutes from './routes/sales.routes.js';
import reportsRoutes from './routes/reports.routes.js';

import helmet from 'helmet';
import compression from 'compression';

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // 'unsafe-inline' removido — solo necesario para CDNs externos con hash/nonce en producción
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://cdn.sheetjs.com"
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:  ["'self'", "https://fonts.gstatic.com"],
      imgSrc:   ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"]
    }
  }
}));

app.use(compression());

// CORS: en producción solo se permiten orígenes conocidos (sin localhost)
const productionOrigins = [
  process.env.FRONTEND_URL,
  'https://comepos.onrender.com',
  'https://comepos.pages.dev'
].filter(Boolean);

const developmentOrigins = [
  ...productionOrigins,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173'
];

const allowedOrigins = isProduction ? productionOrigins : developmentOrigins;

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (ej: curl, mobile apps, server-to-server)
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Limitar tamaño del payload JSON para prevenir ataques DoS
app.use(express.json({ limit: '1mb' }));

// Serve static files — path relative to src/index.js → ../client
const clientPath = path.join(__dirname, '../client');
app.use(express.static(clientPath));

// SPA fallback — serve index.html for any non-API route (Express 5 compatible)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler global — no exponer stack traces en producción
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const message = isProduction ? 'Error interno del servidor' : (err.message || 'Error interno del servidor');
  res.status(err.status || 500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`🍽️  ComePOS Server corriendo en http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔒 Modo: ${isProduction ? 'PRODUCCIÓN' : 'desarrollo'}`);
});
