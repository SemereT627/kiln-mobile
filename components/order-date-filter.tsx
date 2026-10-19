import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/theme-context";
import { radius, spacing, getShadow } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import {
  ETH_MONTHS,
  daysInEthiopianMonth,
  toEthiopian,
  toGregorian,
} from "@/lib/ethiopian-calendar";

const GREGORIAN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Calendar = "gregorian" | "ethiopian";

export type DateFilter = { date: Date; calendar: Calendar };

function daysInGregorianMonth(year: number, month: number): number {
  // month is 1-indexed; day 0 of next month = last day of this month.
  return new Date(year, month, 0).getDate();
}

/** Clamps `day` into [1, max] — used whenever year/month changes shrink
 * the valid day range (e.g. switching to Pagume, or February). */
function clampDay(day: number, max: number): number {
  return Math.min(Math.max(day, 1), max);
}

export function OrderDateFilter({
  value,
  onChange,
}: {
  value: DateFilter | null;
  onChange: (filter: DateFilter | null) => void;
}) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);
  const [open, setOpen] = useState(false);

  const [calendar, setCalendar] = useState<Calendar>(value?.calendar ?? "gregorian");
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);

  function openModal() {
    const base = value?.date ?? new Date();
    const cal = value?.calendar ?? "gregorian";
    setCalendar(cal);
    if (cal === "ethiopian") {
      const eth = toEthiopian(base);
      setYear(eth.year);
      setMonth(eth.month);
      setDay(eth.day);
    } else {
      setYear(base.getFullYear());
      setMonth(base.getMonth() + 1);
      setDay(base.getDate());
    }
    setOpen(true);
  }

  // Re-derive y/m/d when the calendar toggle changes mid-modal, so the
  // picker always shows the same underlying day in the newly chosen system.
  function switchCalendar(next: Calendar) {
    if (next === calendar) return;
    const currentGregorian =
      calendar === "gregorian" ? new Date(year, month - 1, day) : toGregorian({ year, month, day });
    if (next === "ethiopian") {
      const eth = toEthiopian(currentGregorian);
      setYear(eth.year);
      setMonth(eth.month);
      setDay(eth.day);
    } else {
      setYear(currentGregorian.getFullYear());
      setMonth(currentGregorian.getMonth() + 1);
      setDay(currentGregorian.getDate());
    }
    setCalendar(next);
  }

  const maxDay =
    calendar === "ethiopian" ? daysInEthiopianMonth(year, month) : daysInGregorianMonth(year, month);
  const monthNames = calendar === "ethiopian" ? ETH_MONTHS : GREGORIAN_MONTHS;
  const monthCount = calendar === "ethiopian" ? 13 : 12;

  function stepYear(delta: number) {
    setYear((y) => y + delta);
  }
  function stepMonth(delta: number) {
    setMonth((m) => {
      let next = m + delta;
      if (next < 1) next = monthCount;
      if (next > monthCount) next = 1;
      return next;
    });
  }
  function stepDay(delta: number) {
    setDay((d) => clampDay(d + delta, maxDay));
  }

  useEffect(() => {
    setDay((d) => clampDay(d, maxDay));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDay]);

  function apply() {
    const gregorian = calendar === "ethiopian" ? toGregorian({ year, month, day }) : new Date(year, month - 1, day);
    onChange({ date: gregorian, calendar });
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setOpen(false);
  }

  const insets = useSafeAreaInsets();

  return (
    <>
      <Pressable
        style={[styles.filterChip, value && styles.filterChipActive]}
        onPress={openModal}
      >
        <Ionicons
          name="calendar-outline"
          size={14}
          color={value ? "#fff" : colors.textMuted}
        />
        <Text style={[styles.filterChipText, value && styles.filterChipTextActive]}>
          {value ? describeFilter(value) : "Filter by date"}
        </Text>
      </Pressable>
      {value && (
        <Pressable style={styles.clearButton} onPress={() => onChange(null)} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      )}

      <Modal visible={open} transparent animationType="slide">
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.card, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>Filter by date</Text>

            <View style={styles.calendarToggle}>
              {(["gregorian", "ethiopian"] as const).map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.calendarOption, calendar === opt && styles.calendarOptionActive]}
                  onPress={() => switchCalendar(opt)}
                >
                  <Text
                    style={[
                      styles.calendarOptionText,
                      calendar === opt && styles.calendarOptionTextActive,
                    ]}
                  >
                    {opt === "gregorian" ? "Gregorian" : "Ethiopian"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.pickerRow}>
              <PickerColumn label="Day" value={String(day)} onDec={() => stepDay(-1)} onInc={() => stepDay(1)} />
              <PickerColumn
                label="Month"
                value={monthNames[month - 1] ?? String(month)}
                onDec={() => stepMonth(-1)}
                onInc={() => stepMonth(1)}
              />
              <PickerColumn label="Year" value={String(year)} onDec={() => stepYear(-1)} onInc={() => stepYear(1)} />
            </View>

            <View style={styles.actions}>
              <Pressable style={[styles.button, styles.buttonSecondary]} onPress={clear}>
                <Text style={styles.buttonSecondaryText}>Clear</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.buttonPrimary]} onPress={apply}>
                <Text style={styles.buttonPrimaryText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function describeFilter(filter: DateFilter): string {
  if (filter.calendar === "ethiopian") {
    const eth = toEthiopian(filter.date);
    return `${ETH_MONTHS[eth.month - 1]} ${eth.day}, ${eth.year}`;
  }
  return filter.date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PickerColumn({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);
  return (
    <View style={styles.pickerColumn}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <Pressable style={styles.pickerStepper} onPress={onInc} hitSlop={8}>
        <Ionicons name="chevron-up" size={16} color={colors.text} />
      </Pressable>
      <Text style={styles.pickerValue} numberOfLines={1}>
        {value}
      </Text>
      <Pressable style={styles.pickerStepper} onPress={onDec} hitSlop={8}>
        <Ionicons name="chevron-down" size={16} color={colors.text} />
      </Pressable>
    </View>
  );
}

function makeStyles(colors: ThemeColors, shadow: ReturnType<typeof getShadow>) {
  return StyleSheet.create({
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
    filterChipTextActive: { color: "#fff" },
    clearButton: { marginLeft: 6 },
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(15,23,42,0.45)",
    },
    card: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
      paddingTop: spacing.sm,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    title: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 16 },
    calendarToggle: { flexDirection: "row", gap: 8, marginBottom: 20 },
    calendarOption: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    calendarOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    calendarOptionText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
    calendarOptionTextActive: { color: "#fff" },
    pickerRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
    pickerColumn: { flex: 1, alignItems: "center", gap: 8 },
    pickerLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    pickerStepper: {
      width: 36,
      height: 28,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    pickerValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      minHeight: 20,
      textAlign: "center",
    },
    actions: { flexDirection: "row", gap: 12 },
    button: { flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
    buttonPrimary: { backgroundColor: colors.primary, ...shadow.card },
    buttonPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    buttonSecondary: { backgroundColor: colors.surfaceMuted },
    buttonSecondaryText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  });
}
