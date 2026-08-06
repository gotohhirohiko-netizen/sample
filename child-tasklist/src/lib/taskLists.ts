import type { TaskList } from "../types/models";

/**
 * 指定した日付に適用されるタスクリストを決定する。
 * 期間(start_date〜end_date)に該当する特別リストがあればそれを、無ければ通常リスト(is_default)を返す。
 * 複数の特別リストの期間が重なっている場合は先に見つかったものを優先する(作成時にoverlap検証を行うため通常は発生しない)。
 */
export function resolveActiveList(lists: TaskList[], date: string): TaskList | null {
  const special = lists.find(
    (l) => !l.is_default && l.start_date !== null && l.end_date !== null && l.start_date <= date && date <= l.end_date,
  );
  if (special) return special;
  return lists.find((l) => l.is_default) ?? null;
}

/** 2つの期間([startA, endA] と [startB, endB])が重なっているかを判定する */
export function periodsOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && endA >= startB;
}

/**
 * 新規・編集しようとしている特別リストの期間が、他の特別リストと重なっていないか検証する。
 * 重なっていれば、重なっている相手のリスト名を返す(無ければnull)。
 */
export function findOverlappingList(
  lists: TaskList[],
  startDate: string,
  endDate: string,
  excludeListId?: string,
): TaskList | null {
  return (
    lists.find(
      (l) =>
        !l.is_default &&
        l.id !== excludeListId &&
        l.start_date !== null &&
        l.end_date !== null &&
        periodsOverlap(startDate, endDate, l.start_date, l.end_date),
    ) ?? null
  );
}
