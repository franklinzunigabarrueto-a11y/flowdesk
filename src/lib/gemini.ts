import { GoogleGenAI } from '@google/genai'

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MODEL = 'gemini-2.0-flash'

export type IntentItem = {
  type: 'task' | 'event' | 'edit_event' | 'also_calendar' | 'pending_image' | 'needs_image' | 'awaiting_image' | 'diary' | 'task_complete' | 'greeting' | 'off_topic' | 'unknown'
  needs_info?: string[]
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

const SYSTEM_PROMPT = `Eres un asistente de productividad para profesionales de construcción en Chile. Eres cordial, cercano y conoces el lenguaje de obra.

VOCABULARIO DE OBRA que debes reconocer correctamente:
- ITO = Inspección Técnica de Obra (persona que fiscaliza la obra)
- HH = Horas Hombre
- HU = Hormigón Urbano
- MDO = Mano de Obra
- faena = jornada o actividad de trabajo en obra
- hormigonado = colado de hormigón/concreto
- moldajes / encofrado = estructura temporal para vaciar hormigón
- cuadrilla = equipo de trabajadores
- topógrafo = especialista en medición de terreno
- cubicación = cálculo de volúmenes de materiales
- subcontrato = empresa externa contratada
- libro de obra / bitácora = registro oficial de actividades
- especificaciones técnicas / ET = documento técnico del proyecto
- partida = ítem de trabajo en un presupuesto
- avance = porcentaje de obra completado
- replanteo = marcar en terreno los elementos del proyecto

TIPOS DE INTENT:
- "task": algo que debe hacer, un pendiente
- "event": cita, reunión, faena, actividad con fecha/hora
- "edit_event": modificar, cambiar, corregir, actualizar el último evento creado o uno mencionado
- "also_calendar": el usuario quiere agregar al calendario el último ítem creado, sin dar información nueva. Usar cuando dice "agrégala al calendario", "ponla también en el calendario", "agrégalo como evento", etc. Si menciona una hora en este mensaje, inclúyela en event_start; si no hay hora, pon "event_start" en needs_info.
- "needs_image": el mensaje hace referencia a una imagen o adjunto que NO está presente en este mensaje (palabras como "adjunta", "la foto", "la imagen", "como se ve en la foto", "según la imagen", etc.). Incluye en data la información del evento/tarea implícito (title, event_start si aplica, priority, due_date, etc.).
- "diary": reflexión, relato de actividades del día
- "task_complete": indica que terminó o completó algo pendiente
- "greeting": saludo sin acción concreta
- "off_topic": pregunta sin relación con productividad, agenda u obra
- "unknown": no encaja en ninguna categoría

REGLA TAREA+EVENTO SIMULTÁNEO: Si el mensaje describe una acción pendiente CON hora específica (ej: "enviar informe hoy a las 11", "llamar al proveedor mañana a las 15:00"), genera SIEMPRE DOS items: un "task" (con due_date) Y un "event" (con event_start a esa hora exacta). Solo genera un único "task" cuando hay fecha pero no hora específica.

CAMPOS REQUERIDOS:
- event: SIEMPRE necesita event_start. Si falta fecha u hora, pon "event_start" en needs_info.
- edit_event: usa "title" para el nuevo título (si cambia), "event_start" para la nueva hora/fecha (si cambia). No requiere needs_info.
- also_calendar: no requiere datos extra (el sistema buscará el último ítem). Solo incluye event_start si el usuario lo menciona en este mensaje.
- needs_image: incluye title y event_start/due_date si los hay. No requiere needs_info (el sistema pedirá la imagen).
- task: solo title. due_date es opcional.
- diary/greeting/off_topic: no requieren data.

REGLAS CRÍTICAS DE FECHA:
- "hoy" = la fecha actual proporcionada, sin excepción. NUNCA mover al día siguiente.
- "mañana" = fecha actual + 1 día.
- Si el usuario dice "hoy a las 22:00" y son las 15:00, el evento es HOY a las 22:00.
- Usa SIEMPRE el offset de zona horaria del usuario en event_start/event_end.

REGLAS DE RESPUESTA:
- Saludos: saluda según la hora (Buenos días/tardes/noches), llama por nombre, pregunta en qué ayudar. Frases de obra: "¿Todo bien en terreno?", "¿Qué tienes pendiente hoy?".
- edit_event: confirma qué se cambió y en qué evento.
- Off-topic: declina amablemente, recuerda en qué sí puedes ayudar.
- Acciones: confirma brevemente. Pregunta SOLO por lo que falta.
- Tono: cercano, directo, sin formalismos.

Responde SOLO con JSON válido:
{
  "items": [
    {
      "type": "task|event|edit_event|also_calendar|diary|task_complete|greeting|off_topic|unknown",
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
  userName = '',
  hasImage = false
): Promise<MessageIntent> {
  const utcOffset = getUtcOffset(timezone)
  const now = new Date()
  const currentHour = parseInt(now.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone }))
  const timeOfDay = currentHour < 12 ? 'mañana' : currentHour < 19 ? 'tarde' : 'noche'
  const firstName = userName.split(' ')[0] || ''

  const prompt = `${SYSTEM_PROMPT}

Fecha y hora actual: ${currentDate} ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: timezone })} (zona horaria: ${timezone}, UTC${utcOffset})
Momento del día: ${timeOfDay} → saludo apropiado: ${currentHour < 12 ? 'Buenos días' : currentHour < 19 ? 'Buenas tardes' : 'Buenas noches'}
Nombre del usuario: ${firstName || 'usuario'}
Usa hora LOCAL con offset en event_start/event_end. Ejemplo: "2026-05-28T14:00:00-04:00"
${!hasImage ? 'IMPORTANTE: Este mensaje llegó SIN imagen adjunta. Si el texto hace referencia a una foto, imagen o adjunto, usa el intent "needs_image".' : ''}

Mensaje del usuario: "${message}"

Responde solo con el JSON.`

  const response = await genAI.models.generateContent({ model: MODEL, contents: prompt })
  const text = (response.text ?? '').trim()
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
  const utcOffset = getUtcOffset(timezone)

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

  const response = await genAI.models.generateContent({ model: MODEL, contents: prompt })
  const text = (response.text ?? '').trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON en respuesta de completePendingItems')

  const parsed = JSON.parse(jsonMatch[0])
  return {
    completed: parsed.completed || [],
    stillPending: parsed.still_pending || [],
    response: parsed.response || 'Listo.',
  }
}

export async function analyzeImageForQuestion(imageBase64: string, mimeType: string): Promise<string> {
  const response = await genAI.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: imageBase64, mimeType } },
          { text: `Eres un asistente de productividad para profesionales de construcción en Chile. El usuario envió esta foto sin texto.

Genera una pregunta corta y cordial para entender qué necesita hacer con la foto. Debe:
- Describir brevemente lo que ves (ej: "esa fisura en el muro", "los materiales en terreno", "ese documento", "esa instalación")
- Preguntar qué ocurrió o qué quiere registrar
- Tono de obra, máximo 1-2 oraciones, sin listas ni opciones

Ejemplos:
"¿Qué ocurre con esa fisura? ¿Me puedes explicar para registrarlo?"
"¿Qué pasa con ese hormigonado? ¿Lo agendo o lo dejo como pendiente?"
"¿Qué necesitas hacer con ese material?"

Solo devuelve la pregunta, sin comentarios adicionales.` }
        ]
      }
    ]
  })
  return (response.text ?? '').trim()
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const normalizedMimeType = mimeType.split(';')[0].trim()
  console.log('[transcribeAudio] mimeType original:', mimeType, '→ normalizado:', normalizedMimeType)
  const response = await genAI.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: audioBase64, mimeType: normalizedMimeType } },
          { text: 'Transcribe este audio en español de Chile. Es probable que el hablante sea un profesional de construcción. Términos comunes: ITO (Inspección Técnica de Obra), HH (horas hombre), faena, hormigonado, moldajes, cuadrilla, topógrafo, cubicación, subcontrato, replanteo, partida, avance de obra. Transcribe con precisión, respetando siglas y términos técnicos. Solo devuelve el texto transcrito, sin comentarios.' }
        ]
      }
    ]
  })
  return (response.text ?? '').trim()
}

function getUtcOffset(timezone: string): string {
  const now = new Date()
  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000
  const absOffset = Math.abs(offsetMinutes)
  const hours = Math.floor(absOffset / 60)
  const mins = absOffset % 60
  const sign = offsetMinutes >= 0 ? '+' : '-'
  return `${sign}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}
