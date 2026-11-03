import type { CardColumn } from './types.js'
import type { Density } from './tableState.js'
import { ColumnSettings } from './ColumnSettings.js'
import {
  Button, IconClose, IconRefresh, IconSearch, Input, SegmentedChoice,
} from './ui.js'

export interface TableToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
  onClear: () => void
  filterActive: boolean
  density: Density
  onDensityChange: (next: Density) => void
  columns: CardColumn[]
  order: string[]
  hidden: string[]
  onHiddenChange: (next: string[]) => void
  onOrderChange: (next: string[]) => void
  onReset: () => void
  onRefresh: () => void
  refreshing: boolean
}

export function TableToolbar({
  search, onSearchChange, onSearchSubmit, onClear, filterActive,
  density, onDensityChange,
  columns, order, hidden, onHiddenChange, onOrderChange, onReset,
  onRefresh, refreshing,
}: TableToolbarProps) {
  return (
    <div style={rootStyle}>
      <div style={searchWrapStyle}>
        <Input
          icon={<IconSearch size={14} />}
          value={search}
          placeholder="搜索全部字段"
          aria-label="搜索全部字段"
          style={{ width: '100%' }}
          onChange={(event: { target: { value: string } }) => onSearchChange(event.target.value)}
          onKeyDown={(event: { key: string }) => {
            if (event.key === 'Enter') onSearchSubmit()
            if (event.key === 'Escape') onClear()
          }}
        />
      </div>
      {filterActive ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <IconClose size={13} />
          清除筛选
        </Button>
      ) : null}
      <div style={rightStyle}>
        <Button
          variant="ghost"
          size="sm"
          aria-label="刷新"
          title="刷新"
          disabled={refreshing}
          style={iconButtonStyle}
          onClick={onRefresh}
        >
          <IconRefresh size={14} />
        </Button>
        <SegmentedChoice
          id="eais-density"
          value={density}
          label="行密度"
          options={[{ value: 'standard', label: '标准' }, { value: 'compact', label: '紧凑' }]}
          onChange={(next) => onDensityChange(next === 'compact' ? 'compact' : 'standard')}
        />
        <ColumnSettings
          columns={columns}
          order={order}
          hidden={hidden}
          onHiddenChange={onHiddenChange}
          onOrderChange={onOrderChange}
          onReset={onReset}
        />
      </div>
    </div>
  )
}

const rootStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
  flex: 'none',
  paddingBottom: 10,
} as const

const searchWrapStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  flex: '1 1 220px',
  maxWidth: 320,
  minWidth: 160,
} as const

const rightStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginLeft: 'auto',
} as const

const iconButtonStyle = {
  width: 28,
  minWidth: 28,
  padding: 0,
} as const
