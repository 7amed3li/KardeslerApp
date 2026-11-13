import type { MenuItemDto, MenuOptionDto } from '../../../api/types';

export interface OptionGroup {
  groupId: string;
  groupName: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: MenuOptionDto[];
}

export function groupMenuItemOptions(options: MenuOptionDto[]): OptionGroup[] {
  const map = new Map<string, OptionGroup>();
  for (const opt of options) {
    const existing = map.get(opt.groupId);
    if (existing) {
      existing.options.push(opt);
    } else {
      map.set(opt.groupId, {
        groupId: opt.groupId,
        groupName: opt.groupName,
        minSelect: opt.minSelect,
        maxSelect: opt.maxSelect,
        isRequired: opt.isRequired,
        options: [opt],
      });
    }
  }
  return Array.from(map.values());
}

export function validateOptionSelection(
  groups: OptionGroup[],
  selectedOptionIds: string[],
): { valid: boolean; missingGroupName?: string } {
  const selectedSet = new Set(selectedOptionIds);
  for (const group of groups) {
    const count = group.options.filter((o) => selectedSet.has(o.id)).length;
    const minRequired = Math.max(group.minSelect, group.isRequired ? 1 : 0);
    if (count < minRequired) {
      return { valid: false, missingGroupName: group.groupName };
    }
    if (group.maxSelect > 0 && count > group.maxSelect) {
      return { valid: false, missingGroupName: group.groupName };
    }
  }
  return { valid: true };
}

export function filterMenuItems(params: {
  items: MenuItemDto[];
  categoryId: string | null;
  searchQuery: string;
  favoritesOnly: boolean;
  favoriteIds: string[];
  availableOnly?: boolean;
}): MenuItemDto[] {
  const q = params.searchQuery.trim().toLocaleLowerCase('tr-TR');
  const favSet = new Set(params.favoriteIds);
  return params.items.filter((item) => {
    if (params.availableOnly && !item.isAvailable) {
      return false;
    }
    if (params.categoryId && item.categoryId !== params.categoryId) {
      return false;
    }
    if (params.favoritesOnly && !favSet.has(item.id)) {
      return false;
    }
    if (q) {
      const hay = `${item.name} ${item.description ?? ''}`.toLocaleLowerCase('tr-TR');
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

