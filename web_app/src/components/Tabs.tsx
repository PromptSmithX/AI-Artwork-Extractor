import React from 'react'

export interface TabItem<T extends string = string> {
  id: T
  label: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
}

export interface TabsProps<T extends string = string> {
  tabs: TabItem<T>[]
  activeTab: T
  onChange: (tabId: T) => void
  size?: 'sm' | 'md'
  className?: string
  style?: React.CSSProperties
}

export function Tabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  size = 'md',
  className = '',
  style,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={`app-tabs ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 4px',
        userSelect: 'none',
        ...style,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: size === 'sm' ? '6px 10px' : '8px 14px',
              fontSize: size === 'sm' ? '11px' : '12px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
              background: 'transparent',
              marginBottom: '-1px',
              transition: 'all var(--transition-fast)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.icon && <span style={{ display: 'flex' }}>{tab.icon}</span>}
            {tab.label}
            {tab.badge}
          </button>
        )
      })}
    </div>
  )
}
