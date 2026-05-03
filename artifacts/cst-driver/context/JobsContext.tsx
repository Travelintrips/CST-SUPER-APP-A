import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { api, API_BASE_URL } from '@/services/api';
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

function toAbsoluteUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
}

const LOCATION_INTERVAL_MS = 60_000;

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshJobs = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getJobs(token);
      setJobs((data as unknown as Record<string, unknown>[]).map(mapApiJob));
    } catch {
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

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (locationTimerRef.current) {
        clearInterval(locationTimerRef.current);
        locationTimerRef.current = null;
      }
      return;
    }

    async function startLocationTracking() {
      if (Platform.OS === 'web') return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        async function postLocation() {
          if (!token) return;
          try {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            await api.updateLocation(token, loc.coords.latitude, loc.coords.longitude);
          } catch {
          }
        }

        await postLocation();
        locationTimerRef.current = setInterval(postLocation, LOCATION_INTERVAL_MS);
      } catch {
      }
    }

    startLocationTracking();

    return () => {
      if (locationTimerRef.current) {
        clearInterval(locationTimerRef.current);
        locationTimerRef.current = null;
      }
    };
  }, [isAuthenticated, token]);

  async function updateJobStatus(id: string, status: ShipmentStatus, note?: string) {
    if (!token) return;
    const updated = await api.updateStatus(token, id, status, note);
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? mergeJobUpdate(j, updated as Record<string, unknown>) : j))
    );
  }

  async function addJobPhoto(id: string, uri: string, type = 'general') {
    if (!token) return;
    const photo = await api.uploadPhoto(token, id, uri, type);
    const photoUrl = toAbsoluteUrl((photo as Record<string, string>).url ?? uri);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? { ...j, photos: [...j.photos, photoUrl] }
          : j
      )
    );
  }

  async function submitPOD(id: string, receiverName: string) {
    if (!token) return;
    const updated = await api.submitPOD(token, id, receiverName);
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? mergeJobUpdate(j, updated as Record<string, unknown>) : j))
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
    photos: photos.map((p) => toAbsoluteUrl(String((p as Record<string, unknown>).url ?? ''))),
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
