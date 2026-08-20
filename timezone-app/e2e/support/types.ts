/** One row of the Time Keeper table, as a user would read it. */
export interface TimezoneRow {
  /** Label text with the "(You)" marker stripped off. */
  label: string;
  /** True when the row carries the "(You)" marker. */
  isLocal: boolean;
  /** IANA zone shown in the Timezone column. */
  zone: string;
  /** Wall-clock time shown in the time column, e.g. "9:30 AM". */
  time: string;
  /** Whether this row's Delete control is disabled. */
  deleteDisabled: boolean;
}
