export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type TaskPriority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  user_id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  due_date?: string
  completed_at?: string
  whatsapp_message_id?: string
  created_at: string
}

export interface DiaryEntry {
  id: string
  user_id: string
  content: string
  audio_url?: string
  image_url?: string
  entry_date: string
  task_references?: string[]
  whatsapp_message_id?: string
  created_at: string
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  description?: string
  color?: string
  google_event_id?: string
  completed?: boolean
}

export type ActivitySource = 'whatsapp_text' | 'whatsapp_audio' | 'whatsapp_photo' | 'event' | 'task'

export interface ActivityItem {
  id: string
  source: ActivitySource
  content?: string
  title?: string
  description?: string
  image_url?: string | null
  audio_url?: string | null
  created_at: string
  meta?: {
    priority?: string
    due_date?: string
    start_time?: string
    end_time?: string
  }
}

export interface UserProfile {
  id: string
  email: string
  name: string
  avatar_url?: string
  whatsapp_number?: string
  onboarding_completed: boolean
  created_at: string
}
