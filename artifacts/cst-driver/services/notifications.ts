import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// expo-notifications dropped push/remote notification support in Expo Go since
// SDK 53. The notification handler and channel setup only work in a custom
// development build (APK). Skip silently when running inside Expo Go so the
// console error doesn't appear — the APK build gets full functionality.
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
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
  if (isExpoGo) return;

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
