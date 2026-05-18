import type { Schedule } from "@/types";

interface ScheduleCardProps {
  schedule: Schedule;
}

const DAYS = [
  { key: "mon", label: "Sen" },
  { key: "tue", label: "Sel" },
  { key: "wed", label: "Rab" },
  { key: "thu", label: "Kam" },
  { key: "fri", label: "Jum" },
  { key: "sat", label: "Sab" },
  { key: "sun", label: "Min" },
] as const;

export default function ScheduleCard({ schedule }: ScheduleCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 px-5 py-3">
        <h3 className="text-white font-bold">{schedule.facilityName}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-semibold text-slate-600 w-36">Jam</th>
              {DAYS.map((d) => (
                <th key={d.key} className="text-center px-2 py-3 font-semibold text-slate-600">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.slots.map((slot, idx) => (
              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-700 text-xs whitespace-nowrap">
                  {slot.time}
                </td>
                {DAYS.map((d) => {
                  const available = slot[d.key];
                  return (
                    <td key={d.key} className="px-2 py-3 text-center">
                      <span
                        className={`inline-block w-6 h-6 rounded-full text-xs font-bold leading-6 ${
                          available
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-600"
                        }`}
                      >
                        {available ? "✓" : "✗"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 bg-slate-50 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-emerald-100 inline-flex items-center justify-center text-emerald-700 font-bold text-xs">✓</span>
          Tersedia
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-red-100 inline-flex items-center justify-center text-red-600 font-bold text-xs">✗</span>
          Penuh / Tutup
        </div>
      </div>
    </div>
  );
}
