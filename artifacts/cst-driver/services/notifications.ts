import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('job-alerts', {
        name: 'Notifikasi Job Baru',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 300, 200, 300],
        lightColor: '#FF6B00',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }
    return true;
  } catch {
    return false;
  }
}

export function notifyNewJob(
  jobNumber: string,
  customerName: string,
  pickupAddress: string,
): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

  Notifications.scheduleNotificationAsync({
    content: {
      title: `🚛 Job Baru: ${jobNumber}`,
      body: `${customerName || 'Pelanggan'}\n📍 ${pickupAddress || '-'}`,
      sound: 'default',
      data: { jobNumber },
      ...(Platform.OS === 'android' ? { channelId: 'job-alerts' } : {}),
    },
    trigger: null,
  }).catch(() => {});
}
