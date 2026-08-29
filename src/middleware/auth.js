import jwt from 'jsonwebtoken';

const JWT_ISSUER = 'comepos-api';
const JWT_AUDIENCE = 'comepos-client';

// Regex para validar UUID v4
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Verifica si una cadena es un UUID v4 válido.
 */
export function isValidUUID(value) {
  return UUID_REGEX.test(value);
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
 */
export function requirePermission(module) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(403).json({ error: 'Sin permisos' });
    }
    if (!req.user.permissions.includes(module)) {
      return res.status(403).json({ error: `Sin acceso al módulo: ${module}` });
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

export { JWT_ISSUER, JWT_AUDIENCE };
