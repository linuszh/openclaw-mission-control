type NavBadgeProps = {
  count: number;
  className?: string;
};

export function NavBadge({ count, className }: NavBadgeProps) {
  if (count === 0) return null;
  return (
    <span
      className={className}
      style={{ background: "var(--sidebar-badge-bg)" }}
      aria-label={`${count} items`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
