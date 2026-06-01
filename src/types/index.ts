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

export interface Project {
  id: string
  user_id: string
  name: string
  description?: string
  start_date?: string | null
  end_date?: string | null
  status: 'active' | 'completed' | 'paused'
  created_at: string
  updated_at: string
}

export type ProjectTaskStatus = 'pending' | 'in_progress' | 'in_review' | 'approved' | 'rejected' | 'completed'

export interface ProjectTask {
  id: string
  project_id: string
  parent_id?: string | null
  name: string
  wbs?: string | null
  outline_level: number
  start_date?: string | null
  end_date?: string | null
  duration_days?: number | null
  progress: number
  progress_proposed: number
  status: ProjectTaskStatus
  is_summary: boolean
  is_milestone: boolean
  critical_path: boolean
  sort_order: number
  color?: string | null
  assignee_name?: string | null
  proposed_by?: string | null
  proposed_at?: string | null
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  baseline_start?: string | null
  baseline_end?: string | null
  baseline_progress?: number
  created_at: string
  updated_at: string
}

export interface TaskDependency {
  id: string
  predecessor_id: string
  successor_id: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lag_days: number
}

export interface ApprovalLog {
  id: string
  task_id: string
  user_id: string
  action: 'propose' | 'approve' | 'reject' | 'reset'
  comment?: string | null
  progress_value?: number | null
  created_at: string
  user?: { name: string; email: string }
}

export interface ProjectResource {
  id: string
  project_id: string
  name: string
  type: 'person' | 'equipment' | 'material'
  cost_per_unit: number
  unit: string
}

export interface TaskAssignment {
  id: string
  task_id: string
  resource_id: string
  units: number
  total_cost: number
  resource?: ProjectResource
}

export interface ProjectBaseline {
  id: string
  project_id: string
  name: string
  snapshot: ProjectTask[]
  created_at: string
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
