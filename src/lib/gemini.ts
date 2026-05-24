import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export type IntentItem = {
  type: 'task' | 'event' | 'diary' | 'task_complete' | 'greeting' | 'off_topic' | 'unknown'
  needs_info?: string[] // campos que faltan para completar la acción
  data: {
    title?: string
    description?: string
    due_date?: string
    event_start?: string
    event_end?: string
    priority?: 'low' | 'medium' | 'high'
    content?: string
    task_keywords?: string[]
    calendar_name?: string | null
    confidence: number
  }
}

export type MessageIntent = {
  items: IntentItem[]
  response: string
}

const SYSTEM_PROMPT = `Eres un asistente de productividad para profesionales de construcción. Eres cordial, cercano y hablas como alguien que entiende el mundo de la obra.

Analizas mensajes de WhatsApp en español y detectas TODAS las acciones que el usuario quiere realizar. Un mensaje puede tener MÚLTIPLES acciones.

TIPOS DE INTENT:
- "task": algo que debe hacer, un pendiente, recordatorio
- "event": cita, reunión, faena, evento con fecha/hora
- "diary": reflexión, relato de lo que hizo, actividad del día
- "task_complete": indica que terminó o completó algo pendiente
- "greeting": saludo, cómo estás, buenos días, etc. — sin acción concreta
- "off_topic": pregunta que no tiene nada que ver con productividad, agenda o construcción
- "unknown": no encaja en ninguna categoría

CAMPOS REQUERIDOS:
- event: SIEMPRE necesita event_start. Si falta fecha u hora, pon "event_start" en needs_info.
- task: solo title. due_date es opcional, NO preguntes por ella.
- diary/greeting/off_topic: no requieren campos de data.

REGLAS DE RESPUESTA:
- Saludos: responde con el saludo apropiado según la hora del día (Buenos días / Buenas tardes / Buenas noches), llama al usuario por su nombre (solo el primer nombre), y pregunta cómo puedes ayudarle. Usa frases naturales de obra: "¿Todo bien en terreno?", "¿En qué te ayudo hoy?", "¿Qué tienes pendiente?".
- Off-topic: di amablemente que no puedes ayudar con eso, y recuérdale en qué sí puedes ayudar (tareas, eventos, bitácora de obra).
- Acciones: confirma brevemente todo lo que se creó. Pregunta SOLO por lo que realmente falta.
- Tono siempre: cercano, directo, sin formalismos excesivos.

Responde SOLO con JSON válido:
{
  "items": [
    {
      "type": "task|event|diary|task_complete|greeting|off_topic|unknown",
      "needs_info": [],
      "data": {
        "title": "título conciso",
        "description": "descripción si aplica",
        "due_date": "YYYY-MM-DD",
        "event_start": "YYYY-MM-DDTHH:MM:SS±HH:MM",
        "event_end": "YYYY-MM-DDTHH:MM:SS±HH:MM",
        "priority": "low|medium|high",
        "content": "contenido para diario",
        "task_keywords": ["palabras clave"],
        "calendar_name": null,
        "confidence": 0.9
      }
    }
  ],
  "response": "Respuesta apropiada según el tipo de mensaje."
}`

export async function analyzeMessage(
  message: string,
  currentDate: string,
  timezone = 'America/Santiago',
  userName = ''
): Promise<MessageIntent> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const utcOffset = getUtcOffset()

  const now = new Date()
  const currentHour = parseInt(now.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone }))
  const timeOfDay = currentHour < 12 ? 'mañana' : currentHour < 19 ? 'tarde' : 'noche'
  const firstName = userName.split(' ')[0] || ''

  const prompt = `${SYSTEM_PROMPT}

Fecha y hora actual: ${currentDate} ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: timezone })} (zona horaria: ${timezone}, UTC${utcOffset})
Momento del día: ${timeOfDay} → saludo apropiado: ${currentHour < 12 ? 'Buenos días' : currentHour < 19 ? 'Buenas tardes' : 'Buenas noches'}
Nombre del usuario: ${firstName || 'usuario'}
Usa hora LOCAL con offset en event_start/event_end. Ejemplo: "2026-05-28T14:00:00-04:00"

Mensaje del usuario: "${message}"

Responde solo con el JSON.`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Respuesta de Gemini no contiene JSON válido')
  return JSON.parse(jsonMatch[0]) as MessageIntent
}

export async function completePendingItems(
  pendingItems: IntentItem[],
  userReply: string,
  currentDate: string,
  timezone = 'America/Santiago'
): Promise<{ completed: IntentItem[]; stillPending: IntentItem[]; response: string }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const utcOffset = getUtcOffset()

  const pendingSummary = pendingItems.map(item =>
    `- "${item.data.title}" (falta: ${item.needs_info?.join(', ')})`
  ).join('\n')

  const prompt = `Tienes eventos pendientes que esperan información del usuario:
${pendingSummary}

El usuario respondió: "${userReply}"

Fecha actual: ${currentDate} (zona horaria: ${timezone}, UTC${utcOffset})

Extrae la información faltante de la respuesta del usuario y completa los items pendientes.
Si la respuesta cubre todos los items pendientes, complétalos todos.
Si solo cubre algunos, completa los que puedas y deja los demás como pendientes.

Responde SOLO con JSON:
{
  "completed": [
    {
      "type": "event",
      "data": {
        "title": "título original",
        "event_start": "YYYY-MM-DDTHH:MM:SS±HH:MM",
        "event_end": "YYYY-MM-DDTHH:MM:SS±HH:MM",
        "confidence": 0.9
      }
    }
  ],
  "still_pending": [],
  "response": "Confirmación de lo agendado. Si quedan pendientes, pregunta solo por ellos."
}`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON en respuesta de completePendingItems')

  const parsed = JSON.parse(jsonMatch[0])
  return {
    completed: parsed.completed || [],
    stillPending: parsed.still_pending || [],
    response: parsed.response || 'Listo.',
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent([
    { inlineData: { data: audioBase64, mimeType } },
    'Transcribe este audio en español. Solo devuelve el texto transcrito, sin comentarios adicionales.',
  ])
  return result.response.text().trim()
}

function getUtcOffset(): string {
  const now = new Date()
  const offsetMinutes = -now.getTimezoneOffset()
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
  const offsetMins = Math.abs(offsetMinutes) % 60
  const sign = offsetMinutes >= 0 ? '+' : '-'
  return `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`
}
