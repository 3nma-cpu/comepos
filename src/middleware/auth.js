import jwt from 'jsonwebtoken';

const JWT_ISSUER = 'comepos-api';
const JWT_AUDIENCE = 'comepos-client';

// Regex para validar CUID (formato usado por Prisma @default(cuid()))
// CUIDs tienen formato: c + timestamp + random chars, ej: "clxyz123abc456"
const CUID_REGEX = /^c[a-z0-9]{8,}$/i;

/**
 * Verifica si una cadena es un CUID válido.
 */
export function isValidUUID(value) {
  return typeof value === 'string' && CUID_REGEX.test(value);
}

/**
 * Middleware que valida el token JWT en el header Authorization.
 * Verifica issuer y audience para evitar reutilización de tokens
 * entre distintos servicios que compartan el mismo secret.
 */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Middleware que verifica que el usuario tenga permiso para un módulo específico.
 * Soporta uno o múltiples módulos (basta con tener acceso a al menos uno).
 */
export function requirePermission(...modules) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(403).json({ error: 'Sin permisos' });
    }
    const hasPermission = modules.some(m => req.user.permissions.includes(m));
    if (!hasPermission) {
      return res.status(403).json({ error: `Sin acceso al módulo: ${modules.join('/')}` });
    }
    next();
  };
}

/**
 * Middleware que valida que req.params.id sea un UUID v4 válido.
 * Previene consultas a Prisma con IDs malformados que exponen errores de DB.
 */
export function validateUUID(req, res, next) {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  next();
}

const JWT_PORTAL_AUDIENCE = 'comepos-portal';

/**
 * Middleware de autenticación para el portal de funcionarios.
 * Solo acepta tokens con audience 'comepos-portal'.
 * Extrae clientId y cedula a req.portalClient.
 */
export function portalAuthMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_PORTAL_AUDIENCE
    });
    if (decoded.type !== 'portal') {
      return res.status(403).json({ error: 'Token no válido para el portal' });
    }
    req.portalClient = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export { JWT_ISSUER, JWT_AUDIENCE, JWT_PORTAL_AUDIENCE };
