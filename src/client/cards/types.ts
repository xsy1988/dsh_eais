export interface CardEnumValue {
  value: string
  label: string
}

export interface CardColumn {
  key: string
  label: string
  type: string
  unit?: string
  decimal_scale?: number
  enum?: CardEnumValue[]
}

export interface DistributionBucket {
  value: string
  label?: string
  count: number
}

export interface Distribution {
  field: string
  label?: string
  buckets?: DistributionBucket[]
  min?: number
  max?: number
}

export interface DatasetCard {
  eais: 'card/v1'
  kind: 'dataset'
  status: string
  action: string
  action_name?: string
  action_say?: string
  task_id?: string
  view_id?: string
  view_token?: string
  total: number
  rows_fetched: number
  rows_returned: number
  complete: boolean
  columns: CardColumn[]
  display_columns: string[]
  distribution?: Distribution[]
  notes?: string[]
  downgraded?: boolean
  expires_at?: string
}

export interface DraftField {
  name: string
  label: string
  type: string
  required: boolean
  say?: string
  unit?: string
  enum?: CardEnumValue[]
  value?: unknown
  missing?: boolean
  uncertain?: boolean
}

export interface DraftRisk {
  requires_confirm?: boolean
  requires_approval?: boolean
  requires_person?: boolean
  high_risk?: boolean
  approval_type?: string
  max_targets?: number
  gates?: { key: string; name: string; status: string; reason: string }[]
  message?: string
}

export interface DraftCard {
  eais: 'card/v1'
  kind: 'draft'
  status: 'pending' | 'executing' | 'done' | 'failed' | 'cancelled' | 'expired'
  confirm_id: string
  confirm_token?: string
  action: string
  action_name?: string
  action_say?: string
  risk: DraftRisk
  fields: DraftField[]
  message?: string
  task_id?: string
  result?: Record<string, unknown>
  expires_at?: string
}

export type CardPayload = DatasetCard | DraftCard

export function isDataset(card: CardPayload): card is DatasetCard {
  return card.kind === 'dataset'
}

export function isDraft(card: CardPayload): card is DraftCard {
  return card.kind === 'draft'
}
