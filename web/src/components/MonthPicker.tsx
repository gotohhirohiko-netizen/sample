import { formatYearMonth } from "../lib/dateUtils";

interface Props {
  month: Date;
  onChange: (month: Date) => void;
}

export default function MonthPicker({ month, onChange }: Props) {
  return (
    <div className="month-picker">
      <button
        type="button"
        aria-label="前月"
        onClick={() => onChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
      >
        ‹
      </button>
      <strong>{formatYearMonth(month)}</strong>
      <button
        type="button"
        aria-label="次月"
        onClick={() => onChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
      >
        ›
      </button>
    </div>
  );
}
