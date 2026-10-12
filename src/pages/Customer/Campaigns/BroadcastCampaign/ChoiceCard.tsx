interface ChoiceCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}

export default function ChoiceCard({ selected, onSelect, title, description }: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-lg border p-4 text-left transition-colors ${
        selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
      }`}
    >
      <div className="font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{description}</div>
    </button>
  );
}
