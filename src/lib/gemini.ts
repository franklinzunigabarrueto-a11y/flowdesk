import { GoogleGenAI } from '@google/genai'

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { apiVersion: 'v1beta' } })
const MODEL = 'gemini-2.5-flash'

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
- Saludos: saluda según la hora (Buenos días/tardes/noches), llama por nombre, luego agrega UNA frase variada (nunca siempre la misma). Rota entre estas opciones: "¿Todo bien en terreno?", "¿En qué te puedo echar una mano?", "¿Para qué soy bueno hoy?", "¿Qué tienes pendiente?", "¿Cómo va la faena?", "¿Qué necesitas registrar?", "¿Algo que agendar?", "¿En qué andamos hoy?".
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
  hasImage = false,
  isFirstMessageToday = true
): Promise<MessageIntent> {
  const utcOffset = getUtcOffset(timezone)
  const now = new Date()
  const currentHour = parseInt(now.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: timezone }))
  const timeOfDay = currentHour < 12 ? 'mañana' : currentHour < 19 ? 'tarde' : 'noche'
  const firstName = userName.split(' ')[0] || ''

  const greetingInstruction = isFirstMessageToday
    ? `PRIMER MENSAJE DEL DÍA: Si es un saludo o contexto de inicio, saluda según la hora (${currentHour < 12 ? 'Buenos días' : currentHour < 19 ? 'Buenas tardes' : 'Buenas noches'}), llama por nombre (${firstName || 'usuario'}), y añade UNA frase variada de faena. Si el mensaje ya incluye una acción concreta, confirma la acción brevemente y puedes incluir el saludo al inicio.`
    : `NO es el primer mensaje del día. Responde DIRECTAMENTE sin saludar ni mencionar la faena. Ve al grano.`

  const prompt = `${SYSTEM_PROMPT}

Fecha y hora actual: ${currentDate} ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: timezone })} (zona horaria: ${timezone}, UTC${utcOffset})
Momento del día: ${timeOfDay}
Nombre del usuario: ${firstName || 'usuario'}
Usa hora LOCAL con offset en event_start/event_end. Ejemplo: "2026-05-28T14:00:00-04:00"
${!hasImage ? 'IMPORTANTE: Este mensaje llegó SIN imagen adjunta. Si el texto hace referencia a una foto, imagen o adjunto, usa el intent "needs_image".' : ''}
${greetingInstruction}

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

export type DiarySuggestion = {
  type: 'followup' | 'backup' | 'alert' | 'risk'
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
}

export type DiarySummaryResult = {
  summary: string
  suggestions: DiarySuggestion[]
}

export async function generateDiarySummary(
  entries: Array<{ content: string; created_at: string; audio_url?: string | null; image_url?: string | null }>,
  date: string
): Promise<DiarySummaryResult> {
  const entriesText = entries
    .map((e, i) => {
      const time = new Date(e.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      const kind = e.audio_url ? '🎤 Audio' : e.image_url ? '📸 Foto' : '✉️ Texto'
      return `${i + 1}. [${time}] ${kind}: ${e.content}`
    })
    .join('\n')

  const prompt = `Eres un experto en gestión de obras de construcción en Chile con más de 20 años de experiencia. Conoces en profundidad el ciclo completo de obra, normativa NCh, coordinación con ITO (Inspección Técnica de Obra), planificación de partidas y riesgos frecuentes en faena.

CONOCIMIENTO TÉCNICO QUE DEBES APLICAR AL ANALIZAR LAS ENTRADAS:

HORMIGÓN Y MOLDAJES:
- Desencofrado / descimbre: estructuras verticales (muros, pilares) → 24-48h. Losas y vigas: resistencia mínima 70% → typically 7 días con cemento corriente, 3-4 días con cemento de alta resistencia. Vigas grandes o luces largas: 14-21 días. Tiempo frío (bajo 10°C) extiende los plazos. Siempre según ET o especificaciones del calculista.
- Post-hormigonado: curado húmedo mínimo 7 días. Evitar vibraciones ni cargas prematuras. Si hubo hormigonado, sugerir agendar revisión del curado y fecha estimada de desencofrado.
- Fisuras en hormigón fresco: si son >0.3mm o estructurales, requieren notificación al ITO y registro fotográfico con referencia métrica inmediata.

TECHUMBRES Y TRABAJOS EXTERIORES:
- Instalación de techumbre, impermeabilización, trabajos con mortero exterior: verificar pronóstico de lluvia con 3-5 días de anticipación. En Chile, Región Metropolitana y sur: lluvias de mayo-agosto son frecuentes. No instalar membranas impermeabilizantes con humedad >85% o lluvia inminente.
- Faenas de movimiento de tierras, excavaciones: evitar en días de lluvia intensa (riesgo de derrumbe, barro, problemas de compactación).
- Hormigonado exterior: no realizar con temp. <5°C ni lluvia directa. Cubrir con polietileno si hay riesgo.

COORDINACIÓN ITO / MANDANTE:
- Cualquier cambio de especificación técnica (ET), cambio de materiales o de procedimiento requiere autorización escrita del ITO y registro en libro de obra.
- Acuerdos verbales con ITO o mandante → SIEMPRE respaldar con correo o acta firmada el mismo día o al siguiente.
- Visitas de inspección avisadas → preparar libro de obra, registros fotográficos y muestras de ensayos al día.

SUBCONTRATOS Y CUADRILLAS:
- Si se menciona inicio de faena de subcontrato → verificar: credenciales vigentes (contrato, seguro de accidentes), EPP completo, charla de inducción de seguridad.
- Subcontrato de instalaciones (electricidad, gasfitería, HVAC): coordinar con calculista y arquitecto para verificar posiciones antes de hormigonar o cerrar.

REPLANTEO Y TOPOGRAFÍA:
- Replanteo recién realizado → confirmar con topógrafo antes de iniciar fundaciones. Cualquier desviación >2cm en ejes debe ser corregida y documentada.
- Nivelar, anclar o aplamar antes de hormigonar.

SEGURIDAD EN OBRA:
- Trabajo en altura (+1.8m): andamios con barandas, arnés y línea de vida obligatorios según DS 594.
- Mención de accidente, casi-accidente o condición insegura → requiere reporte inmediato, registro en libro de obra y notificación a prevencionista.
- Excavaciones > 1.5m profundidad: entibaciones obligatorias.

MATERIALES Y PROVEEDORES:
- Si se pidió material y aún no llega → alertar antes de que detenga la faena.
- Áridos, hormigón premezclado: confirmar recepción con guía de despacho y ensayo de cono de Abrams en obra.

PLAZOS CONTRACTUALES:
- Si se menciona avance menor al esperado → evaluar si hay riesgo de multa por atraso (boleta de garantía, multa por día).
- Hitos contractuales próximos → alertar con 5-10 días de anticipación.

---

Analiza las siguientes entradas del diario de obra del día ${date}:

${entriesText}

Genera:
1. Un RESUMEN conciso del día (2-4 oraciones) que capture actividades principales, avances y situaciones técnicas relevantes. Usa lenguaje de obra.
2. Hasta 4 SUGERENCIAS específicas y accionables. SOLO sugiere si hay algo concreto derivado de las entradas. Aplica el conocimiento técnico listado arriba para detectar plazos, riesgos y coordinaciones necesarias:
   - "followup": acción de seguimiento con plazo estimado (ej: "Desencofrado losa: agendar inspección en 7 días"; "Confirmar avance topógrafo antes de iniciar fundaciones")
   - "backup": respaldo necesario por escrito (ej: "Acuerdo verbal con ITO → enviar correo de confirmación hoy"; "Cambio de ET → documentar en libro de obra con firma")
   - "alert": alerta de coordinación, plazo o condición externa (ej: "Instalación techumbre mañana → verificar pronóstico de lluvia"; "Faena con subcontrato → confirmar EPP e inducción")
   - "risk": riesgo técnico, de seguridad o contractual (ej: "Fisura reportada → fotografía con escala y notificar ITO"; "Hormigonado bajo 5°C → protocolo de frío")

Si no hay suficiente información para sugerencias útiles, devuelve "suggestions": [].

Responde SOLO con JSON válido:
{
  "summary": "Resumen del día en 2-4 oraciones...",
  "suggestions": [
    {
      "type": "followup|backup|alert|risk",
      "title": "Título corto máx 6 palabras",
      "detail": "Explicación concreta de qué hacer, cuándo y por qué es importante",
      "priority": "high|medium|low"
    }
  ]
}`

  const response = await genAI.models.generateContent({ model: MODEL, contents: prompt })
  const text = (response.text ?? '').trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON en generateDiarySummary')
  return JSON.parse(jsonMatch[0]) as DiarySummaryResult
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
