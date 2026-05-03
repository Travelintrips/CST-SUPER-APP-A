// Notifikasi job baru dikirim via WhatsApp (Fonnte) dari server.
// File ini dipertahankan agar tidak perlu mengubah import di tempat lain.
export function notifyNewJob(
  _jobNumber: string,
  _customerName: string,
  _pickupAddress: string,
): void {
  // no-op: notifikasi ditangani di sisi server via WhatsApp
}

export async function requestNotificationPermission(): Promise<boolean> {
  return false;
}
