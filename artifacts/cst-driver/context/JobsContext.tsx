import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/services/storage';
import { Job, ShipmentStatus } from '@/types';

const DUMMY_JOBS: Job[] = [
  {
    id: 'job-001',
    jobNumber: 'TRK-2026-001',
    customerName: 'PT Garuda Nusantara',
    pickupAddress: 'Pelabuhan Tanjung Priok, Jl. Enggano No.1, Jakarta Utara',
    deliveryAddress: 'Kawasan Industri Pulogadung, Jl. Bekasi Raya KM 22, Jakarta Timur',
    cargoDescription: 'Kontainer 20ft — Electronic Components',
    vehicleType: 'Truk Engkel',
    truckPlate: 'B 8234 CST',
    driverName: 'Ahmad Rizki',
    pickupDateTime: '2026-05-04T08:00:00',
    deliveryDateTime: '2026-05-04T12:00:00',
    specialInstruction: 'Handle with care, fragile items. Koordinasi dengan pihak gudang sebelum bongkar muat.',
    status: 'ASSIGNED',
    photos: [],
    statusLogs: [
      { status: 'ASSIGNED', timestamp: '2026-05-03T14:00:00', note: 'Job diterima sistem' },
    ],
    weight: '5.2 ton',
    distance: '28 km',
  },
  {
    id: 'job-002',
    jobNumber: 'TRK-2026-002',
    customerName: 'CV Maju Bersama',
    pickupAddress: 'Gudang CST Logistics, Jl. Raya Cikupa KM 5, Tangerang',
    deliveryAddress: 'Pelabuhan Tanjung Emas, Jl. Coaster No.10, Semarang, Jawa Tengah',
    cargoDescription: 'Barang Elektronik + Spare Parts Otomotif',
    vehicleType: 'Truk CDD Long',
    truckPlate: 'B 8234 CST',
    driverName: 'Ahmad Rizki',
    pickupDateTime: '2026-05-03T06:00:00',
    deliveryDateTime: '2026-05-04T18:00:00',
    specialInstruction: 'Keep dry, barang sensitif kelembaban. Jangan ditumpuk lebih dari 2 layer.',
    status: 'IN_TRANSIT',
    photos: [],
    statusLogs: [
      { status: 'ASSIGNED', timestamp: '2026-05-02T20:00:00' },
      { status: 'ACCEPTED', timestamp: '2026-05-02T20:15:00' },
      { status: 'ON_THE_WAY_TO_PICKUP', timestamp: '2026-05-03T05:30:00' },
      { status: 'ARRIVED_AT_PICKUP', timestamp: '2026-05-03T06:05:00' },
      { status: 'PICKED_UP', timestamp: '2026-05-03T07:20:00' },
      { status: 'IN_TRANSIT', timestamp: '2026-05-03T07:30:00' },
    ],
    weight: '8.7 ton',
    distance: '460 km',
  },
  {
    id: 'job-003',
    jobNumber: 'TRK-2026-000',
    customerName: 'PT Sinar Cahaya Global',
    pickupAddress: 'MM2100 Industrial Town, Cikarang Barat, Bekasi',
    deliveryAddress: 'Terminal Petikemas Surabaya, Jl. Tanjung Sadari, Surabaya',
    cargoDescription: 'Mesin Industri + Spare Parts',
    vehicleType: 'Truk CDE',
    truckPlate: 'B 8234 CST',
    driverName: 'Ahmad Rizki',
    pickupDateTime: '2026-05-01T07:00:00',
    deliveryDateTime: '2026-05-02T16:00:00',
    status: 'COMPLETED',
    photos: [],
    statusLogs: [
      { status: 'ASSIGNED', timestamp: '2026-04-30T15:00:00' },
      { status: 'ACCEPTED', timestamp: '2026-04-30T15:10:00' },
      { status: 'ON_THE_WAY_TO_PICKUP', timestamp: '2026-05-01T06:30:00' },
      { status: 'ARRIVED_AT_PICKUP', timestamp: '2026-05-01T07:05:00' },
      { status: 'PICKED_UP', timestamp: '2026-05-01T08:00:00' },
      { status: 'IN_TRANSIT', timestamp: '2026-05-01T08:10:00' },
      { status: 'ARRIVED_AT_DESTINATION', timestamp: '2026-05-02T15:40:00' },
      { status: 'DELIVERED', timestamp: '2026-05-02T16:00:00' },
      { status: 'COMPLETED', timestamp: '2026-05-02T16:05:00' },
    ],
    podSigned: true,
    receiverName: 'Budi Santoso',
    weight: '12.5 ton',
    distance: '740 km',
  },
  {
    id: 'job-004',
    jobNumber: 'TRK-2026-999',
    customerName: 'PT Indo Makmur',
    pickupAddress: 'Kawasan Berikat Nusantara, Marunda, Jakarta Utara',
    deliveryAddress: 'IKM Sentra Batik, Yogyakarta',
    cargoDescription: 'Bahan Baku Tekstil',
    vehicleType: 'Truk Engkel',
    truckPlate: 'B 8234 CST',
    driverName: 'Ahmad Rizki',
    pickupDateTime: '2026-04-28T08:00:00',
    deliveryDateTime: '2026-04-29T14:00:00',
    status: 'COMPLETED',
    photos: [],
    statusLogs: [
      { status: 'ASSIGNED', timestamp: '2026-04-27T09:00:00' },
      { status: 'ACCEPTED', timestamp: '2026-04-27T09:05:00' },
      { status: 'ON_THE_WAY_TO_PICKUP', timestamp: '2026-04-28T07:30:00' },
      { status: 'ARRIVED_AT_PICKUP', timestamp: '2026-04-28T08:10:00' },
      { status: 'PICKED_UP', timestamp: '2026-04-28T09:00:00' },
      { status: 'IN_TRANSIT', timestamp: '2026-04-28T09:10:00' },
      { status: 'ARRIVED_AT_DESTINATION', timestamp: '2026-04-29T13:50:00' },
      { status: 'DELIVERED', timestamp: '2026-04-29T14:00:00' },
      { status: 'COMPLETED', timestamp: '2026-04-29T14:10:00' },
    ],
    podSigned: true,
    receiverName: 'Dewi Rahayu',
    weight: '3.8 ton',
    distance: '520 km',
  },
];

interface JobsContextType {
  jobs: Job[];
  activeJobs: Job[];
  completedJobs: Job[];
  getJob: (id: string) => Job | undefined;
  updateJobStatus: (id: string, status: ShipmentStatus, note?: string) => void;
  addJobPhoto: (id: string, uri: string) => void;
  submitPOD: (id: string, receiverName: string) => void;
  rejectJob: (id: string) => void;
}

const JobsContext = createContext<JobsContextType>({
  jobs: [],
  activeJobs: [],
  completedJobs: [],
  getJob: () => undefined,
  updateJobStatus: () => {},
  addJobPhoto: () => {},
  submitPOD: () => {},
  rejectJob: () => {},
});

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>(DUMMY_JOBS);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    try {
      const stored = await storage.getJobs();
      if (stored) {
        setJobs(JSON.parse(stored) as Job[]);
      }
    } catch {
      setJobs(DUMMY_JOBS);
    }
  }

  async function saveJobs(updatedJobs: Job[]) {
    setJobs(updatedJobs);
    await storage.setJobs(updatedJobs);
  }

  function updateJobStatus(id: string, status: ShipmentStatus, note?: string) {
    const updated = jobs.map((j) => {
      if (j.id !== id) return j;
      const log = { status, timestamp: new Date().toISOString(), note };
      return { ...j, status, statusLogs: [...j.statusLogs, log] };
    });
    saveJobs(updated);
  }

  function addJobPhoto(id: string, uri: string) {
    const updated = jobs.map((j) =>
      j.id === id ? { ...j, photos: [...j.photos, uri] } : j
    );
    saveJobs(updated);
  }

  function submitPOD(id: string, receiverName: string) {
    const updated = jobs.map((j) =>
      j.id === id ? { ...j, podSigned: true, receiverName } : j
    );
    saveJobs(updated);
  }

  function rejectJob(id: string) {
    const updated = jobs.map((j) =>
      j.id === id
        ? { ...j, status: 'CANCELLED' as ShipmentStatus, statusLogs: [...j.statusLogs, { status: 'CANCELLED' as ShipmentStatus, timestamp: new Date().toISOString(), note: 'Ditolak oleh driver' }] }
        : j
    );
    saveJobs(updated);
  }

  const activeJobs = jobs.filter(
    (j) => j.status !== 'COMPLETED' && j.status !== 'CANCELLED'
  );
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED');

  return (
    <JobsContext.Provider
      value={{
        jobs,
        activeJobs,
        completedJobs,
        getJob: (id) => jobs.find((j) => j.id === id),
        updateJobStatus,
        addJobPhoto,
        submitPOD,
        rejectJob,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export const useJobs = () => useContext(JobsContext);
