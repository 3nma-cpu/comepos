import dotenv from 'dotenv';
dotenv.config();
// Deploy trigger: 2026-05-14 20:15
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

// import helmet from 'helmet'; // Temporally disabled for debugging
import compression from 'compression';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
// app.use(helmet(...)); // Temporally disabled
app.use(compression());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://comepos.onrender.com',
  'https://comepos.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin (no origin header) or allowed origins
    if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || origin === 'null') {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(null, true); // Allow for now to debug, but ideally we match correctly
    }
  },
  credentials: true
}));
app.use(express.json());

// Serve static files from client directory
// Serve static files
const publicPath = path.join(process.cwd(), 'client');
app.use(express.static(publicPath));

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

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`🍽️  ComePOS Server corriendo en http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
