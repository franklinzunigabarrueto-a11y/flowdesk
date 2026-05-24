import { google } from 'googleapis'

function getOAuthClient(accessToken: string, refreshToken?: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  )
  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  return auth
}

export async function findCalendarByName(params: {
  accessToken: string
  refreshToken?: string
  name: string
}): Promise<string> {
  const auth = getOAuthClient(params.accessToken, params.refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const response = await calendar.calendarList.list()
  const calendars = response.data.items || []

  const normalizedTarget = params.name.toLowerCase().trim()
  const match = calendars.find(cal =>
    cal.summary?.toLowerCase().includes(normalizedTarget)
  )

  return match?.id || 'primary'
}

export async function createCalendarEvent(params: {
  accessToken: string
  refreshToken?: string
  title: string
  description?: string
  startTime: string
  endTime?: string
  timezone?: string
  calendarId?: string
}): Promise<{ googleEventId: string; htmlLink: string }> {
  const auth = getOAuthClient(params.accessToken, params.refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const startDateTime = new Date(params.startTime)
  const endDateTime = params.endTime
    ? new Date(params.endTime)
    : new Date(startDateTime.getTime() + 60 * 60 * 1000)

  const event = await calendar.events.insert({
    calendarId: params.calendarId || 'primary',
    requestBody: {
      summary: params.title,
      description: params.description,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: params.timezone || 'America/Santiago',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: params.timezone || 'America/Santiago',
      },
    },
  })

  return {
    googleEventId: event.data.id!,
    htmlLink: event.data.htmlLink!,
  }
}

export async function updateCalendarEvent(params: {
  accessToken: string
  refreshToken?: string
  googleEventId: string
  title?: string
  description?: string
  startTime?: string
  endTime?: string
  timezone?: string
}): Promise<void> {
  const auth = getOAuthClient(params.accessToken, params.refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const existing = await calendar.events.get({ calendarId: 'primary', eventId: params.googleEventId })
  const patch: any = {}

  if (params.title) patch.summary = params.title
  if (params.description !== undefined) patch.description = params.description
  if (params.startTime) {
    patch.start = { dateTime: new Date(params.startTime).toISOString(), timeZone: params.timezone || 'America/Santiago' }
    if (!params.endTime) {
      const start = new Date(params.startTime)
      const origEnd = existing.data.end?.dateTime
      const origStart = existing.data.start?.dateTime
      const duration = origEnd && origStart ? new Date(origEnd).getTime() - new Date(origStart).getTime() : 3600000
      patch.end = { dateTime: new Date(start.getTime() + duration).toISOString(), timeZone: params.timezone || 'America/Santiago' }
    }
  }
  if (params.endTime) {
    patch.end = { dateTime: new Date(params.endTime).toISOString(), timeZone: params.timezone || 'America/Santiago' }
  }

  await calendar.events.patch({ calendarId: 'primary', eventId: params.googleEventId, requestBody: patch })
}

export async function deleteCalendarEvent(params: {
  accessToken: string
  refreshToken?: string
  googleEventId: string
}): Promise<void> {
  const auth = getOAuthClient(params.accessToken, params.refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })
  await calendar.events.delete({ calendarId: 'primary', eventId: params.googleEventId })
}

export async function listCalendarEvents(params: {
  accessToken: string
  refreshToken?: string
  timeMin: string
  timeMax: string
  timezone?: string
}) {
  const auth = getOAuthClient(params.accessToken, params.refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: params.timezone || 'America/Santiago',
  })

  return response.data.items || []
}
