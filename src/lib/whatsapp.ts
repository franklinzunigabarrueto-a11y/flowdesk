const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

export async function sendWhatsAppMessage(to: string, message: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN

  const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/\D/g, ''),
      type: 'text',
      text: { body: message },
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Error WhatsApp API: ${JSON.stringify(error)}`)
  }
}

export async function sendWelcomeMessage(to: string, userName: string): Promise<void> {
  const message = `¡Hola ${userName}! 👋 Soy tu asistente de FlowDesk.

Puedo ayudarte a:
✅ *Crear tareas* — "Recordarme llamar al doctor mañana"
📅 *Agendar eventos* — "Reunión con cliente el viernes a las 3pm"
📖 *Anotar en tu diario* — "Hoy terminé el informe mensual"

📌 *Te recomiendo fijar este chat* para tenerlo siempre a mano.

¿Por dónde empezamos?`

  await sendWhatsAppMessage(to, message)
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ data: string; mimeType: string }> {
  const token = process.env.WHATSAPP_TOKEN

  const urlResponse = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const urlData = await urlResponse.json()

  const mediaResponse = await fetch(urlData.url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const buffer = await mediaResponse.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')

  return { data: base64, mimeType: urlData.mime_type }
}
