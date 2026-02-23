import '../assets/tab-bar.css'

export type TabId = 'traces' | 'source' | 'console'

interface Tab {
  id: TabId
  label: string
  badge?: number
}

interface TabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  consoleBadge: number
}

const TABS: Omit<Tab, 'badge'>[] = [
  { id: 'traces', label: 'Traces' },
  { id: 'source', label: 'Source' },
  { id: 'console', label: 'Console' }
]

export function TabBar({ activeTab, onTabChange, consoleBadge }: TabBarProps) {
  return (
    <div className="tab-bar">
      {TABS.map((tab) => {
        const badge = tab.id === 'console' && consoleBadge > 0 ? consoleBadge : undefined
        return (
          <button
            key={tab.id}
            className={`tab-bar-item${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
            {badge !== undefined && (
              <span className="tab-bar-badge">{badge > 99 ? '99+' : badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
