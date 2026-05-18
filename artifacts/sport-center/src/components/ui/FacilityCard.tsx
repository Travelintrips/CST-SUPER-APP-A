import { Star, Users, Clock, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Facility } from "@/types";
import { formatCurrency } from "@/utils/bookingCode";

interface FacilityCardProps {
  facility: Facility;
}

export default function FacilityCard({ facility }: FacilityCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] overflow-hidden flex flex-col">
      <div className="relative h-48 overflow-hidden">
        <img
          src={facility.image}
          alt={facility.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute top-3 left-3">
          <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
            {facility.category}
          </span>
        </div>
        {!facility.available && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-red-500 text-white font-bold px-4 py-2 rounded-full text-sm">
              Tidak Tersedia
            </span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-slate-800 text-lg leading-tight">{facility.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            <span className="text-sm font-semibold text-slate-700">{facility.rating}</span>
          </div>
        </div>

        <p className="text-slate-500 text-sm leading-relaxed mb-4 flex-1 line-clamp-2">
          {facility.description}
        </p>

        <div className="flex items-center gap-4 mb-4 text-sm text-slate-500">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-blue-500" />
            <span>Maks. {facility.capacity} orang</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-emerald-500" />
            <span>Per jam</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {facility.amenities.slice(0, 3).map((a) => (
            <span key={a} className="bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full">
              {a}
            </span>
          ))}
          {facility.amenities.length > 3 && (
            <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full">
              +{facility.amenities.length - 3} lagi
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold text-blue-600">{formatCurrency(facility.pricePerHour)}</span>
            <span className="text-slate-400 text-sm">/jam</span>
          </div>
          <Link
            to={`/sport-center/booking?facility=${facility.id}`}
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-4 py-2 rounded-full text-sm font-semibold hover:shadow-md transition-all"
          >
            Booking
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
