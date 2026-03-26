interface ExpandToggleProps {
  show: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ExpandToggle({ show, isExpanded, onToggle }: ExpandToggleProps) {
  if (!show) {
    return null;
  }

  return (
    <button type="button" className="tasks-expand-toggle" data-testid="expand-toggle" onClick={onToggle}>
      {isExpanded ? "Show less" : "Show more"}
    </button>
  );
}
