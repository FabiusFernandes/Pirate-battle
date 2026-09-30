import { RoundButton } from '../components/RoundButton';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  label: string;
  disabled?: boolean;
}

export function Pagination({ page, totalPages, onChange, label, disabled = false }: PaginationProps) {
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <RoundButton
        icon="icon_turn_left"
        label="Previous page"
        onClick={() => {
          onChange(page - 1);
        }}
        disabled={disabled || page <= 1}
        data-testid="page-prev"
      />
      <span className="pagination__label" aria-live="polite" data-testid="page-label">
        Page {page} of {totalPages}
      </span>
      <RoundButton
        icon="icon_turn_right"
        label="Next page"
        onClick={() => {
          onChange(page + 1);
        }}
        disabled={disabled || page >= totalPages}
        data-testid="page-next"
      />
    </nav>
  );
}
