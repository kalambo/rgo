export default function parseDateString(date: string) {

  const parts = date.split(/^(\d\d?)\/(\d\d?)\/(\d\d(?:\d\d)?)$/).slice(1).map(parseFloat);
  if (parts.length === 0) return null;

  const dd = parts[0];
  const mm = parts[1] - 1;
  const yy = parts[2] + (parts[2] < 100 ? (parts[2] < 30 ? 2000 : 1900) : 0);

  const d = new Date(yy, mm, dd);
  if ((d.getDate() !== dd) || (d.getMonth() !== mm) || (d.getFullYear() !== yy)) return null;

  return d;
}
