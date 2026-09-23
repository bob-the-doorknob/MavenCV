import { categoryLabels, type CategoryKey } from '../../theme/tokens';
import { Chip } from './Chip';

interface CategoryChipProps {
  category: CategoryKey;
  /** Defaults to the category's own name. */
  label?: string;
  selected?: boolean;
  onPress?: () => void;
}

export function CategoryChip({ category, label, selected = false, onPress }: CategoryChipProps) {
  return (
    <Chip
      label={label ?? categoryLabels[category]}
      selected={selected}
      tone={category}
      {...(onPress ? { onPress } : {})}
    />
  );
}
