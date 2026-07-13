import { template as disasterAlert } from './disaster-alert.tsx'

export interface TemplateEntry {
  component: (props: any) => any
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, unknown>
  to?: (data: any) => string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'disaster-alert': disasterAlert,
}