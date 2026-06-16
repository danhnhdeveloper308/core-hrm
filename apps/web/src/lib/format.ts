const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

const relativeFormat = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** "5 phút trước", "hôm qua"... */
export function timeAgo(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1_000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return relativeFormat.format(diffSec, 'second');
  if (abs < 3_600) return relativeFormat.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return relativeFormat.format(Math.round(diffSec / 3_600), 'hour');
  return relativeFormat.format(Math.round(diffSec / 86_400), 'day');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Phút → "1h 30p" / "45p" / "0p" — cho hiển thị trễ/sớm/giờ công. */
export function formatMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return '0p';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}p`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}p`;
}
