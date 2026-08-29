import type { PendingOrder } from "@/lib/db";

export type OrderDayGroup = {
  /** Stable key for this day — also used as the /queue/[date] route param. */
  dateKey: string;
  /** Display label: "Today" | "Yesterday" | "Month Day[, Year]". */
  title: string;
  data: PendingOrder[];
};

/** Buckets orders into date groups the way a chat app would — Today,
 * Yesterday, then a plain date. Orders arrive pre-sorted by createdAt desc,
 * so same-day entries are always contiguous — no need to key by a map. */
export function groupOrdersByDate(orders: PendingOrder[], now: Date): OrderDayGroup[] {
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const groups: OrderDayGroup[] = [];
  for (const order of orders) {
    const created = new Date(order.createdAt);
    const dayStr = created.toDateString();
    let title: string;
    if (dayStr === todayStr) title = "Today";
    else if (dayStr === yesterdayStr) title = "Yesterday";
    else {
      title = created.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: created.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
    const last = groups[groups.length - 1];
    if (last && last.dateKey === dayStr) {
      last.data.push(order);
    } else {
      groups.push({ dateKey: dayStr, title, data: [order] });
    }
  }
  return groups;
}
