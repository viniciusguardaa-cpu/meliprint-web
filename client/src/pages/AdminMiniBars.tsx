/** Minimal chart for daily unique visitors. */
export function MiniBars({ data, color }: { data: Array<{ label: string; value: number }>; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-[2px] h-24">
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.value}`}
          className={`flex-1 rounded-sm ${color} transition-all`}
          style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 1)}%`, opacity: d.value > 0 ? 1 : 0.25 }}
        />
      ))}
    </div>
  );
}
