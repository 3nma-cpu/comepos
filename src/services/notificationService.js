// ============================================
// Notification Service — SMS & WhatsApp Gateway
// ============================================

/**
 * Normaliza números de teléfono para Paraguay (+595) o estándar internacional
 * Acepta: '992034940', '0992034940', '+595992034940', '+595 0992...', etc.
 * Retorna siempre formato estándar sin '+', ej: '595992034940'
 */
export function normalizePhoneNumber(rawPhone) {
  if (!rawPhone) return '';
  let cleaned = String(rawPhone).replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.startsWith('5950')) {
    cleaned = '595' + cleaned.slice(4);
  }
  if (!cleaned.startsWith('595')) {
    cleaned = '595' + cleaned;
  }
  return cleaned;
}

/**
 * Formato visual internacional con prefijo (+595 992 034 940)
 */
export function formatParaguayPhone(rawPhone) {
  const norm = normalizePhoneNumber(rawPhone);
  if (!norm) return '';
  if (norm.startsWith('595') && norm.length >= 12) {
    return `+${norm.slice(0, 3)} ${norm.slice(3, 6)} ${norm.slice(6, 9)} ${norm.slice(9)}`;
  }
  return '+' + norm;
}

/**
 * Genera el enlace directo a WhatsApp con el mensaje pre-cargado
 */
export function generateWhatsAppLink(phone, message) {
  const normalized = normalizePhoneNumber(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Envía o prepara un PIN provisorio por SMS o WhatsApp
 */
export async function sendProvisionalPin({ phone, name, pin }) {
  const normalizedPhone = normalizePhoneNumber(phone);
  const message = `Hola ${name || 'Funcionario'}, tu PIN provisorio para ingresar a Mi Consumo (Comedor TTA) es: *${pin}*.\n\nAl ingresar deberás definir tu PIN personal de 4 dígitos.`;
  const waLink = generateWhatsAppLink(phone, message);

  // Registro en logs del servidor
  console.log(`📱 [NotificationService] PIN provisorio para ${name} (${phone} -> ${normalizedPhone}): ${pin}`);

  let apiSent = false;
  let provider = 'manual_wa';

  // 1. Si existe configuración de API de WhatsApp (ej: Evolution API, Baileys, o Webhook)
  if (process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_KEY) {
    try {
      const response = await fetch(process.env.WHATSAPP_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.WHATSAPP_API_KEY,
          'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`
        },
        body: JSON.stringify({
          number: normalizedPhone,
          text: message,
          message: message
        })
      });
      if (response.ok) {
        apiSent = true;
        provider = 'whatsapp_api';
        console.log(`✅ [NotificationService] Mensaje WhatsApp enviado automáticamente a ${normalizedPhone}`);
      }
    } catch (err) {
      console.warn(`⚠️ [NotificationService] Error enviando por WhatsApp API:`, err.message);
    }
  }

  // 2. Si existe configuración de Twilio SMS
  if (!apiSent && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', '+' + normalizedPhone);
      params.append('From', process.env.TWILIO_PHONE_NUMBER);
      params.append('Body', `Comedor TTA: Tu PIN provisorio es ${pin}. Deberas cambiarlo al ingresar.`);

      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });
      if (response.ok) {
        apiSent = true;
        provider = 'twilio_sms';
        console.log(`✅ [NotificationService] SMS Twilio enviado automáticamente a ${normalizedPhone}`);
      }
    } catch (err) {
      console.warn(`⚠️ [NotificationService] Error enviando por Twilio SMS:`, err.message);
    }
  }

  return {
    success: true,
    phone: normalizedPhone,
    phoneMasked: '***' + phone.slice(-4),
    apiSent,
    provider,
    waLink,
    message
  };
}
