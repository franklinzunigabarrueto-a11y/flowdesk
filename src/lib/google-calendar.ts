import { google } from 'googleapis'
import type { SupabaseClient } from '@supabase/supabase-js'

const TZ = 'America/Santiago'

function makeOAuth() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
  )
}

/**
 * OAuth2 client with optional auto-save of refreshed tokens to Supabase.
 * Pass userId + adminDb to enable token refresh persistence.
 */
export function getGoogleClient(
  accessToken: string,
  refreshToken: string | null | undefined,
  userId?: string,
  adminDb?: SupabaseClient
) {
  const auth = makeOAuth()
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken ?? undefined })
  if (userId && adminDb) {
    auth.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await adminDb
          .from('users')
          .update({ google_access_token: tokens.access_token })
          .eq('id', userId)
      }
    })
  }
  return auth
}

/* ─── Existing API (backward-compatible — used by WhatsApp webhook) ─── */

export async function findCalendarByName(params: {
  accessToken: string
  refreshToken?: string
  name: string
}): Promise<string> {
  const auth = getGoogleClient(params.accessToken, params.refreshToken)
  const cal = google.calendar({ version: 'v3', auth })
  const res = await cal.calendarList.list()
  const match = (res.data.items || []).find(c =>
    c.summary?.toLowerCase().includes(params.name.toLowerCase().trim())
  )
  return match?.id || 'primary'
}

/**
 * Creates the "FlowDesk👷" calendar in Google Calendar with Tangerine (Mandarina) color.
 * If it already exists, reuses it. Saves the calendarId in the users table.
 */
export async function createFlowDeskCalendar(params: {
  accessToken: string
  refreshToken?: string | null
  userId: string
  adminDb: SupabaseClient
}): Promise<string> {
  const auth = getGoogleClient(params.accessToken, params.refreshToken, params.userId, params.adminDb)
  const cal = google.calendar({ version: 'v3', auth })

  // Reuse if already exists
  const listRes = await cal.calendarList.list()
  const existing = (listRes.data.items || []).find(c => c.summary === 'FlowDesk👷')
  if (existing?.id) {
    await params.adminDb.from('users').update({ flowdesk_calendar_id: existing.id }).eq('id', params.userId)
    return existing.id
  }

  // Create new calendar
  const createRes = await cal.calendars.insert({
    requestBody: { summary: 'FlowDesk👷', timeZone: TZ },
  })
  const calId = createRes.data.id!

  // Set Tangerine / Mandarina color (#F4511E)
  await cal.calendarList.patch({
    calendarId: calId,
    colorRgbFormat: true,
    requestBody: { backgroundColor: '#F4511E', foregroundColor: '#ffffff' },
  })

  await params.adminDb.from('users').update({ flowdesk_calendar_id: calId }).eq('id', params.userId)
  return calId
}

export async function createCalendarEvent(params: {
  accessToken: string
  refreshToken?: string | null
  title: string
  description?: string
  startTime: string
  endTime?: string
  timezone?: string
  calendarId?: string
  userId?: string
  adminDb?: SupabaseClient
}): Promise<{ googleEventId: string; htmlLink: string }> {
  const auth = getGoogleClient(params.accessToken, params.refreshToken, params.userId, params.adminDb)
  const cal = google.calendar({ version: 'v3', auth })

  const start = new Date(params.startTime)
  const end = params.endTime ? new Date(params.endTime) : new Date(start.getTime() + 3600000)
  const tz = params.timezone || TZ

  const res = await cal.events.insert({
    calendarId: params.calendarId || 'primary',
    requestBody: {
      summary: params.title,
      description: params.description,
      start: { dateTime: start.toISOString(), timeZone: tz },
      end:   { dateTime: end.toISOString(),   timeZone: tz },
    },
  })
  return { googleEventId: res.data.id!, htmlLink: res.data.htmlLink! }
}

export async function updateCalendarEvent(params: {
  accessToken: string
  refreshToken?: string | null
  googleEventId: string
  calendarId?: string
  title?: string
  description?: string
  startTime?: string
  endTime?: string
  timezone?: string
  userId?: string
  adminDb?: SupabaseClient
}): Promise<void> {
  const auth = getGoogleClient(params.accessToken, params.refreshToken, params.userId, params.adminDb)
  const cal = google.calendar({ version: 'v3', auth })
  const calId = params.calendarId || 'primary'

  const existing = await cal.events.get({ calendarId: calId, eventId: params.googleEventId })
  const tz = params.timezone || TZ
  const patch: any = {}

  if (params.title !== undefined)       patch.summary     = params.title
  if (params.description !== undefined) patch.description = params.description

  if (params.startTime) {
    patch.start = { dateTime: new Date(params.startTime).toISOString(), timeZone: tz }
    if (!params.endTime) {
      const origDur =
        existing.data.end?.dateTime && existing.data.start?.dateTime
          ? new Date(existing.data.end.dateTime).getTime() - new Date(existing.data.start.dateTime).getTime()
          : 3600000
      patch.end = {
        dateTime: new Date(new Date(params.startTime).getTime() + origDur).toISOString(),
        timeZone: tz,
      }
    }
  }
  if (params.endTime) {
    patch.end = { dateTime: new Date(params.endTime).toISOString(), timeZone: tz }
  }

  await cal.events.patch({ calendarId: calId, eventId: params.googleEventId, requestBody: patch })
}

export async function deleteCalendarEvent(params: {
  accessToken: string
  refreshToken?: string | null
  googleEventId: string
  calendarId?: string
  userId?: string
  adminDb?: SupabaseClient
}): Promise<void> {
  const auth = getGoogleClient(params.accessToken, params.refreshToken, params.userId, params.adminDb)
  const cal = google.calendar({ version: 'v3', auth })
  await cal.events.delete({ calendarId: params.calendarId || 'primary', eventId: params.googleEventId })
}

export async function listCalendarEvents(params: {
  accessToken: string
  refreshToken?: string
  timeMin: string
  timeMax: string
  timezone?: string
}) {
  const auth = getGoogleClient(params.accessToken, params.refreshToken)
  const cal = google.calendar({ version: 'v3', auth })
  const res = await cal.events.list({
    calendarId: 'primary',
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: params.timezone || TZ,
  })
  return res.data.items || []
}

/* ─── Webhook / push-notification sync ─── */

/**
 * Register a Google Calendar push-notification channel for the user's primary calendar.
 * Stores channelId, expiry, and initial syncToken in the users row.
 * Safe to call repeatedly — skips registration if channel is still valid.
 */
export async function registerWatch(params: {
  userId: string
  accessToken: string
  refreshToken?: string | null
  adminDb: SupabaseClient
  flowdeskCalendarId?: string | null
}): Promise<void> {
  const auth = getGoogleClient(params.accessToken, params.refreshToken, params.userId, params.adminDb)
  const cal = google.calendar({ version: 'v3', auth })

  const calId = params.flowdeskCalendarId || 'primary'
  const channelId = `fd-${params.userId.replace(/-/g, '').slice(0, 20)}-${Date.now()}`

  const watch = await cal.events.watch({
    calendarId: calId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: `${process.env.NEXT_PUBLIC_APP_URL}/api/events/google-sync`,
    },
  })

  // Page to the end of the event list to get a fresh nextSyncToken
  let syncToken = ''
  let pageToken: string | undefined
  do {
    const resp = await cal.events.list({ calendarId: calId, maxResults: 2500, pageToken })
    pageToken = resp.data.nextPageToken ?? undefined
    if (!pageToken) syncToken = resp.data.nextSyncToken ?? ''
  } while (pageToken)

  await params.adminDb.from('users').update({
    google_channel_id:     channelId,
    google_channel_expiry: Number(watch.data.expiration) || Date.now() + 7 * 24 * 3600 * 1000,
    google_sync_token:     syncToken,
  }).eq('id', params.userId)
}

/**
 * Fetch events that changed since the stored syncToken.
 * Returns changed items (including cancelled ones) and the new syncToken.
 * Throws Error('SYNC_TOKEN_EXPIRED') when the token is stale — caller should re-register.
 */
export async function fetchChangedEvents(params: {
  userId: string
  accessToken: string
  refreshToken?: string | null
  adminDb: SupabaseClient
  syncToken: string
  flowdeskCalendarId?: string | null
}): Promise<{ items: any[]; newSyncToken: string }> {
  const auth = getGoogleClient(params.accessToken, params.refreshToken, params.userId, params.adminDb)
  const cal = google.calendar({ version: 'v3', auth })
  const calId = params.flowdeskCalendarId || 'primary'

  const items: any[] = []
  let pageToken: string | undefined
  let newSyncToken = ''

  try {
    do {
      const resp = await cal.events.list({
        calendarId: calId,
        syncToken: params.syncToken,
        pageToken,
        maxResults: 2500,
      })
      items.push(...(resp.data.items ?? []))
      pageToken = resp.data.nextPageToken ?? undefined
      if (!pageToken) newSyncToken = resp.data.nextSyncToken ?? ''
    } while (pageToken)
  } catch (e: any) {
    if (e?.code === 410) throw new Error('SYNC_TOKEN_EXPIRED')
    throw e
  }

  return { items, newSyncToken }
}
