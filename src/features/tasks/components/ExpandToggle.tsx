interface ExpandToggleProps {
  show: boolean;
  isExpanded: boolean;
  expandLabel?: string;
  collapseLabel?: string;
  onToggle: () => void;
}

export function ExpandToggle({
  show,
  isExpanded,
  expandLabel = "Show more",
  collapseLabel = "Show less",
  onToggle,
}: ExpandToggleProps) {
  if (!show) {
    return null;
  }

  return (
    <button type="button" className="tasks-expand-toggle" data-testid="expand-toggle" onClick={onToggle}>
      {isExpanded ? collapseLabel : expandLabel}
    </button>
  );
}
