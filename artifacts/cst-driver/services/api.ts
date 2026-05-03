import { Job, ShipmentStatus } from '@/types';

const BASE_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : '/api';

export const api = {
  async login(email: string, password: string) {
    const res = await fetch(`${BASE_URL}/driver/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  },

  async getJobs(token: string): Promise<Job[]> {
    const res = await fetch(`${BASE_URL}/driver/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch jobs');
    return res.json();
  },

  async updateStatus(token: string, jobId: string, status: ShipmentStatus, note?: string) {
    const res = await fetch(`${BASE_URL}/driver/jobs/${jobId}/status`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, note }),
    });
    if (!res.ok) throw new Error('Failed to update status');
    return res.json();
  },

  async uploadPhoto(token: string, jobId: string, uri: string, type: string) {
    const formData = new FormData();
    formData.append('photo', { uri, type: 'image/jpeg', name: `${type}_${Date.now()}.jpg` } as unknown as Blob);
    formData.append('type', type);
    const res = await fetch(`${BASE_URL}/driver/jobs/${jobId}/photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload photo');
    return res.json();
  },

  async submitPOD(token: string, jobId: string, receiverName: string) {
    const res = await fetch(`${BASE_URL}/driver/jobs/${jobId}/pod`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ receiverName }),
    });
    if (!res.ok) throw new Error('Failed to submit POD');
    return res.json();
  },

  async updateLocation(token: string, lat: number, lng: number) {
    await fetch(`${BASE_URL}/driver/location`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lat, lng }),
    }).catch(() => {});
  },
};
