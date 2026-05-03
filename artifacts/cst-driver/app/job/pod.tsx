import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, PanResponder, GestureResponderEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useJobs } from '@/context/JobsContext';
import { Icon } from '@/components/Icon';

export default function PODScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getJob, submitPOD } = useJobs();
  const [receiverName, setReceiverName] = useState('');
  const [isSigned, setIsSigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sigPoints, setSigPoints] = useState<Array<{ x: number; y: number; newLine: boolean }>>([]);

  const job = getJob(jobId);
  if (!job) return null;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        setSigPoints((prev) => [...prev, { x: locationX, y: locationY, newLine: true }]);
        setIsSigned(true);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        setSigPoints((prev) => [...prev, { x: locationX, y: locationY, newLine: false }]);
      },
    })
  ).current;

  function clearSignature() {
    setSigPoints([]);
    setIsSigned(false);
  }

  async function handleConfirm() {
    if (!receiverName.trim()) {
      Alert.alert('Perhatian', 'Masukkan nama penerima');
      return;
    }
    if (!isSigned) {
      Alert.alert('Perhatian', 'Penerima harus menandatangani dokumen');
      return;
    }
    setLoading(true);
    try {
      await submitPOD(jobId, receiverName.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Berhasil!', 'Bukti pengiriman berhasil disimpan', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch {
      Alert.alert('Gagal', 'Tidak dapat menyimpan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  function renderSignaturePaths() {
    if (sigPoints.length === 0) return null;
    const pathGroups: Array<Array<{ x: number; y: number }>> = [];
    let currentGroup: Array<{ x: number; y: number }> = [];
    for (const pt of sigPoints) {
      if (pt.newLine && currentGroup.length > 0) {
        pathGroups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push({ x: pt.x, y: pt.y });
    }
    if (currentGroup.length > 0) pathGroups.push(currentGroup);

    return pathGroups.map((group, gIdx) =>
      group.map((pt, pIdx) => {
        if (pIdx === 0) return null;
        const prev = group[pIdx - 1];
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={`${gIdx}-${pIdx}`}
            style={{
              position: 'absolute',
              left: prev.x,
              top: prev.y - 1.5,
              width: len,
              height: 3,
              backgroundColor: '#0F3460',
              borderRadius: 1.5,
              transformOrigin: 'left center',
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Job Summary */}
        <View style={[styles.summaryCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
          <Icon name="package" size={18} color="#0F3460" />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryJob}>{job.jobNumber}</Text>
            <Text style={styles.summaryCustomer}>{job.customerName}</Text>
            <Text style={styles.summaryAddr} numberOfLines={1}>{job.deliveryAddress}</Text>
          </View>
        </View>

        {/* Receiver Name */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Nama Penerima *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card }]}
            placeholder="Masukkan nama lengkap penerima"
            placeholderTextColor={colors.mutedForeground}
            value={receiverName}
            onChangeText={setReceiverName}
            returnKeyType="done"
          />
        </View>

        {/* Signature Pad */}
        <View style={styles.field}>
          <View style={styles.sigHeader}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Tanda Tangan Penerima *</Text>
            {isSigned && (
              <TouchableOpacity onPress={clearSignature} style={styles.clearBtn}>
                <Icon name="trash-2" size={14} color="#EF4444" />
                <Text style={styles.clearText}>Hapus</Text>
              </TouchableOpacity>
            )}
          </View>
          <View
            style={[styles.sigPad, { borderColor: isSigned ? '#0F3460' : colors.border, backgroundColor: colors.card }]}
            {...panResponder.panHandlers}
          >
            {!isSigned && (
              <View style={styles.sigPlaceholder}>
                <Icon name="edit-3" size={24} color={colors.mutedForeground} />
                <Text style={[styles.sigPlaceholderText, { color: colors.mutedForeground }]}>
                  Tanda tangan di sini
                </Text>
              </View>
            )}
            {renderSignaturePaths()}
          </View>
        </View>
      </View>

      {/* Confirm button */}
      <View style={[styles.footer, { paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[styles.confirmBtn, loading && { opacity: 0.7 }]}
          onPress={handleConfirm}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="check-circle" size={20} color="#fff" />
              <Text style={styles.confirmText}>Konfirmasi Pengiriman</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, padding: 16, gap: 16 },
  summaryCard: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  summaryJob: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#0F3460' },
  summaryCustomer: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0F172A' },
  summaryAddr: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#64748B', marginTop: 2 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  input: {
    borderWidth: 1.5, borderRadius: 14, padding: 14,
    fontSize: 15, fontFamily: 'Inter_400Regular', height: 52,
  },
  sigHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearText: { fontSize: 12, color: '#EF4444', fontFamily: 'Inter_600SemiBold' },
  sigPad: {
    height: 160, borderWidth: 2, borderRadius: 16, borderStyle: 'dashed',
    overflow: 'hidden', position: 'relative',
  },
  sigPlaceholder: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  sigPlaceholderText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  footer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E2E8F0', padding: 16,
  },
  confirmBtn: {
    backgroundColor: '#059669', borderRadius: 16, height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    shadowColor: '#059669', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  confirmText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#fff' },
});
