interface EventBadgeProps {
  count: number
}

export function EventBadge({ count }: EventBadgeProps) {
  return <span className="event-badge">{count}</span>
}
