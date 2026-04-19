/**
 * Google Calendar integration
 *
 * Wraps the Google Calendar API v3 for Appointment sync.
 * Falls back to mock (console log) when credentials are missing.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *   GOOGLE_CALENDAR_ID  (defaults to 'primary')
 */

import { google } from 'googleapis'

function buildCalendarClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) return null

  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  return google.calendar({ version: 'v3', auth })
}

const calendarId = () => process.env.GOOGLE_CALENDAR_ID ?? 'primary'

export interface CalendarEventInput {
  title: string
  description?: string
  location?: string
  startAt: Date
  endAt: Date
  attendees?: string[]
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<string | null> {
  const calendar = buildCalendarClient()
  if (!calendar) {
    console.log(`[google-calendar] MOCK createEvent: "${input.title}" @ ${input.startAt.toISOString()}`)
    return `mock-event-${Date.now()}`
  }

  const res = await calendar.events.insert({
    calendarId: calendarId(),
    requestBody: {
      summary: input.title,
      description: input.description,
      location: input.location,
      start: { dateTime: input.startAt.toISOString() },
      end: { dateTime: input.endAt.toISOString() },
      attendees: input.attendees?.map((email) => ({ email })),
    },
  })

  console.log(`[google-calendar] created event: ${res.data.id}`)
  return res.data.id ?? null
}

export async function updateCalendarEvent(
  googleEventId: string,
  input: Partial<CalendarEventInput>,
): Promise<void> {
  const calendar = buildCalendarClient()
  if (!calendar) {
    console.log(`[google-calendar] MOCK updateEvent: ${googleEventId}`)
    return
  }

  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) patch.summary = input.title
  if (input.description !== undefined) patch.description = input.description
  if (input.location !== undefined) patch.location = input.location
  if (input.startAt) patch.start = { dateTime: input.startAt.toISOString() }
  if (input.endAt) patch.end = { dateTime: input.endAt.toISOString() }
  if (input.attendees) patch.attendees = input.attendees.map((email) => ({ email }))

  await calendar.events.patch({
    calendarId: calendarId(),
    eventId: googleEventId,
    requestBody: patch,
  })

  console.log(`[google-calendar] updated event: ${googleEventId}`)
}

export async function deleteCalendarEvent(googleEventId: string): Promise<void> {
  const calendar = buildCalendarClient()
  if (!calendar) {
    console.log(`[google-calendar] MOCK deleteEvent: ${googleEventId}`)
    return
  }

  await calendar.events.delete({
    calendarId: calendarId(),
    eventId: googleEventId,
  })

  console.log(`[google-calendar] deleted event: ${googleEventId}`)
}
