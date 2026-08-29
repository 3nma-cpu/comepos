import rateLimit from 'express-rate-limit';

/**
 * Rate limiter para el endpoint de autenticación.
 * Máx. 10 intentos por IP cada 15 minutos.
 * Previene ataques de fuerza bruta contra contraseñas.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,  // Retorna RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: {
    error: 'Demasiados intentos de inicio de sesión. Por favor intentá de nuevo en 15 minutos.'
  },
  skipSuccessfulRequests: true // No cuenta los logins exitosos contra el límite
});

/**
 * Rate limiter genérico para endpoints sensibles (no-auth).
 * Máx. 200 requests por IP por minuto.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Demasiadas solicitudes. Por favor esperá un momento antes de continuar.'
  }
});
