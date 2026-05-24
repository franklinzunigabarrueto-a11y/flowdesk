import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export type MessageIntent = {
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
    confidence: number
  }
  response: string
}

const SYSTEM_PROMPT = `Eres un asistente de productividad personal. Analizas mensajes de WhatsApp en español y detectas si el usuario quiere:

1. CREAR UNA TAREA (type: "task"): Cuando menciona algo que debe hacer, una pendiente, un recordatorio.
2. CREAR UN EVENTO (type: "event"): Cuando menciona una cita, reunión, evento con fecha y hora específica.
3. ANOTAR EN DIARIO (type: "diary"): Cuando cuenta lo que hizo, reflexiones, actividades del día.
4. COMPLETAR UNA TAREA (type: "task_complete"): Cuando indica que terminó, hizo, completó algo que podría ser una tarea pendiente.
5. DESCONOCIDO (type: "unknown"): Si no encaja en ninguna categoría.

Responde SOLO con JSON válido con esta estructura exacta:
{
  "type": "task|event|diary|task_complete|unknown",
  "data": {
    "title": "título conciso si aplica",
    "description": "descripción detallada si aplica",
    "due_date": "YYYY-MM-DD si menciona fecha para tarea",
    "event_start": "YYYY-MM-DDTHH:MM:SS si es evento",
    "event_end": "YYYY-MM-DDTHH:MM:SS si es evento (suma 1h si no especifica fin)",
    "priority": "low|medium|high según urgencia implícita",
    "content": "contenido completo para entrada de diario",
    "task_keywords": ["palabras clave para buscar tarea relacionada si es task_complete"],
    "confidence": 0.0 a 1.0
  },
  "response": "Respuesta amigable en español al usuario confirmando lo que se registró"
}`

export async function analyzeMessage(
  message: string,
  currentDate: string
): Promise<MessageIntent> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const prompt = `${SYSTEM_PROMPT}

Fecha actual: ${currentDate}

Mensaje del usuario: "${message}"

Responde solo con el JSON, sin texto adicional.`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Respuesta de Gemini no contiene JSON válido')

  return JSON.parse(jsonMatch[0]) as MessageIntent
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

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
