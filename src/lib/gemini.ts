import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export type IntentItem = {
  type: 'task' | 'event' | 'diary' | 'task_complete' | 'unknown'
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

const SYSTEM_PROMPT = `Eres un asistente de productividad para profesionales de construcción. Analizas mensajes de WhatsApp en español y detectas TODAS las acciones que el usuario quiere realizar.

Un solo mensaje puede contener MÚLTIPLES acciones (varias tareas, varios eventos, etc.). Debes detectarlas TODAS.

Para cada acción, determina:
- "task": algo que debe hacer, un pendiente, recordatorio
- "event": cita, reunión, faena, evento con fecha/hora
- "diary": reflexión, relato de lo que hizo, actividad del día
- "task_complete": indica que terminó o completó algo pendiente
- "unknown": no encaja en ninguna categoría

REGLAS CLAVE:
- NUNCA preguntes si quieres hacer algo. Si el usuario lo menciona, créalo directamente.
- Si el mensaje menciona 2 eventos, retorna 2 items de tipo event.
- Si mezcla evento y tarea, retorna ambos.
- La respuesta debe confirmar TODO lo que se registró, de forma breve y clara.

Responde SOLO con JSON válido con esta estructura exacta:
{
  "items": [
    {
      "type": "task|event|diary|task_complete|unknown",
      "data": {
        "title": "título conciso",
        "description": "descripción si aplica",
        "due_date": "YYYY-MM-DD si menciona fecha para tarea",
        "event_start": "YYYY-MM-DDTHH:MM:SS±HH:MM si es evento",
        "event_end": "YYYY-MM-DDTHH:MM:SS±HH:MM si es evento (suma 1h si no especifica fin)",
        "priority": "low|medium|high según urgencia",
        "content": "contenido para entrada de diario",
        "task_keywords": ["palabras clave para buscar tarea relacionada si es task_complete"],
        "calendar_name": "nombre del calendario si el usuario lo especifica, null si no",
        "confidence": 0.0
      }
    }
  ],
  "response": "Confirmación breve en español de TODO lo que se registró. Usa emojis. Sin preguntas."
}`

export async function analyzeMessage(
  message: string,
  currentDate: string,
  timezone = 'America/Santiago'
): Promise<MessageIntent> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const now = new Date()
  const offsetMinutes = -now.getTimezoneOffset()
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
  const offsetMins = Math.abs(offsetMinutes) % 60
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const utcOffset = `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`

  const prompt = `${SYSTEM_PROMPT}

Fecha y hora actual: ${currentDate} (zona horaria: ${timezone}, UTC${utcOffset})
IMPORTANTE: Usa la hora LOCAL del usuario con el offset en event_start y event_end. Ejemplo: "2026-05-28T14:00:00-04:00"

Mensaje del usuario: "${message}"

Responde solo con el JSON, sin texto adicional.`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Respuesta de Gemini no contiene JSON válido')

  return JSON.parse(jsonMatch[0]) as MessageIntent
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const result = await model.generateContent([
    {
      inlineData: {
        data: audioBase64,
        mimeType,
      },
    },
    'Transcribe este audio en español. Solo devuelve el texto transcrito, sin comentarios adicionales.',
  ])

  return result.response.text().trim()
}
