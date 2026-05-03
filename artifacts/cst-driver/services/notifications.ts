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
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function notifyNewJob(jobNumber: string, customerName: string, pickupAddress: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Job Baru: ${jobNumber}`,
        body: `${customerName} — ${pickupAddress}`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
      },
      trigger: null,
    });
  } catch {
  }
}
