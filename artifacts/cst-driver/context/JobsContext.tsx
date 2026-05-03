import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { useAuth } from './AuthContext';
import { Job, ShipmentStatus } from '@/types';

interface JobsContextType {
  jobs: Job[];
  activeJobs: Job[];
  completedJobs: Job[];
  isLoading: boolean;
  error: string | null;
  getJob: (id: string) => Job | undefined;
  updateJobStatus: (id: string, status: ShipmentStatus, note?: string) => Promise<void>;
  addJobPhoto: (id: string, uri: string, type?: string) => Promise<void>;
  submitPOD: (id: string, receiverName: string) => Promise<void>;
  rejectJob: (id: string) => Promise<void>;
  refreshJobs: () => Promise<void>;
}

const JobsContext = createContext<JobsContextType>({
  jobs: [],
  activeJobs: [],
  completedJobs: [],
  isLoading: false,
  error: null,
  getJob: () => undefined,
  updateJobStatus: async () => {},
  addJobPhoto: async () => {},
  submitPOD: async () => {},
  rejectJob: async () => {},
  refreshJobs: async () => {},
});

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshJobs = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getJobs(token);
      setJobs(data.map(mapApiJob));
    } catch (e) {
      setError('Gagal memuat data pekerjaan');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      refreshJobs();
    }
  }, [isAuthenticated, token, refreshJobs]);

  async function updateJobStatus(id: string, status: ShipmentStatus, note?: string) {
    if (!token) return;
    const updated = await api.updateStatus(token, id, status, note);
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? mergeJobUpdate(j, updated) : j))
    );
  }

  async function addJobPhoto(id: string, uri: string, type = 'general') {
    if (!token) return;
    const photo = await api.uploadPhoto(token, id, uri, type);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? { ...j, photos: [...j.photos, (photo as Record<string, string>).url ?? uri] }
          : j
      )
    );
  }

  async function submitPOD(id: string, receiverName: string) {
    if (!token) return;
    const updated = await api.submitPOD(token, id, receiverName);
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? mergeJobUpdate(j, updated) : j))
    );
  }

  async function rejectJob(id: string) {
    if (!token) return;
    await updateJobStatus(id, 'CANCELLED', 'Ditolak oleh driver');
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
        isLoading,
        error,
        getJob: (id) => jobs.find((j) => j.id === id),
        updateJobStatus,
        addJobPhoto,
        submitPOD,
        rejectJob,
        refreshJobs,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

function mapApiJob(d: Record<string, unknown>): Job {
  const logs = (d.statusLogs as Record<string, unknown>[] | undefined) ?? [];
  const photos = (d.photos as Record<string, unknown>[] | undefined) ?? [];
  return {
    id: String(d.id ?? ''),
    jobNumber: String(d.jobNumber ?? ''),
    customerName: String(d.customerName ?? ''),
    pickupAddress: String(d.pickupAddress ?? ''),
    deliveryAddress: String(d.deliveryAddress ?? ''),
    cargoDescription: String(d.cargoDescription ?? ''),
    vehicleType: String(d.vehicleType ?? ''),
    truckPlate: String(d.truckPlate ?? ''),
    driverName: '',
    pickupDateTime: String(d.pickupDateTime ?? ''),
    deliveryDateTime: String(d.deliveryDateTime ?? ''),
    specialInstruction: d.specialInstruction ? String(d.specialInstruction) : undefined,
    status: String(d.status ?? 'ASSIGNED') as ShipmentStatus,
    photos: photos.map((p) => String((p as Record<string, unknown>).url ?? '')),
    statusLogs: logs.map((l) => ({
      status: String((l as Record<string, unknown>).status ?? '') as ShipmentStatus,
      timestamp: String((l as Record<string, unknown>).timestamp ?? ''),
      note: (l as Record<string, unknown>).note ? String((l as Record<string, unknown>).note) : undefined,
    })),
    podSigned: !!d.podReceiverName,
    receiverName: d.podReceiverName ? String(d.podReceiverName) : undefined,
    weight: d.weight ? String(d.weight) : undefined,
    distance: d.distance ? String(d.distance) : undefined,
  };
}

function mergeJobUpdate(existing: Job, updated: Record<string, unknown>): Job {
  return {
    ...existing,
    status: String(updated.status ?? existing.status) as ShipmentStatus,
    podSigned: !!updated.podReceiverName || existing.podSigned,
    receiverName: updated.podReceiverName ? String(updated.podReceiverName) : existing.receiverName,
    statusLogs: [
      ...existing.statusLogs,
      ...(updated.status && updated.status !== existing.status
        ? [{ status: String(updated.status) as ShipmentStatus, timestamp: new Date().toISOString() }]
        : []),
    ],
  };
}

export const useJobs = () => useContext(JobsContext);
