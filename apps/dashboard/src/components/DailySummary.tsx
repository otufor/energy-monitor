import { format } from "date-fns";
import { useDailySummary } from "../hooks/usePowerData";

export const DailySummary = () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data } = useDailySummary(today);

  const cards = [
    {
      label: "消費電力量",
      value: data?.total_kwh != null ? `${data.total_kwh.toFixed(2)} kWh` : "---",
      color: "blue",
    },
    {
      label: "ピーク電力",
      value: data?.peak_watts != null ? `${data.peak_watts} W` : "---",
      color: "red",
    },
    {
      label: "平均電力",
      value: data?.avg_watts != null ? `${data.avg_watts} W` : "---",
      color: "green",
    },
    {
      label: "電気代概算",
      value: data?.cost_yen != null ? `${data.cost_yen} 円` : "---",
      color: "yellow",
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, color }) => (
        <div key={label} className={`bg-${color}-50 border border-${color}-100 rounded-xl p-4`}>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
      ))}
    </div>
  );
};
