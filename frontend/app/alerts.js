import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getToken } from './api';
import { TabBar } from './dashboard';

const BASE_URL = 'http://10.33.115.98:8000/api';


const SEVERITY_CONFIG = {
  warning: { bg: '#FFFBEB', border: '#FDE68A', icon: 'warning-outline',          iconColor: '#D97706', label: 'Warning', labelBg: '#FEF3C7', labelText: '#92400E' },
  info:    { bg: '#EFF6FF', border: '#BFDBFE', icon: 'information-circle-outline', iconColor: '#2563EB', label: 'Info',    labelBg: '#DBEAFE', labelText: '#1E40AF' },
  danger:  { bg: '#FFF1F2', border: '#FECDD3', icon: 'alert-circle-outline',      iconColor: '#E11D48', label: 'Action',  labelBg: '#FFE4E6', labelText: '#9F1239' },
};

export default function AlertsScreen() {
  const [alerts, setAlerts]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${BASE_URL}/reports/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || data);
      } else {
        setAlerts([]);
      }
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const resolveAlert = async (alertId) => {
    Alert.alert('Resolve alert', 'Mark this alert as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Resolve',
        style: 'default',
        onPress: async () => {
          try {
            const token = await getToken();
            await fetch(`${BASE_URL}/alerts/${alertId}/resolve`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch { /* offline — still update UI */ }
          setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        },
      },
    ]);
  };

  const onRefresh = useCallback(() => loadAlerts(true), []);

  const active   = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) =>  a.resolved);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#1E3A8A', '#2563EB']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Alerts</Text>
          {active.length > 0 && (
            <Text style={styles.headerSub}>{active.length} need your attention</Text>
          )}
        </View>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{active.length}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {/* Active alerts */}
        {active.length === 0 ? (
          <View style={styles.allClear}>
            <View style={styles.allClearIcon}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#16A34A" />
            </View>
            <Text style={styles.allClearTitle}>All clear!</Text>
            <Text style={styles.allClearSub}>No active alerts. All reports look good.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Active · {active.length}</Text>
            {active.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onResolve={() => resolveAlert(alert.id)}
                onViewReport={() =>
                  router.push({ pathname: '/results', params: { reportId: alert.reportId, filename: alert.filename } })
                }
              />
            ))}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <TabBar active="alerts" />
    </SafeAreaView>
  );
}

// ── Alert Card ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onResolve, onViewReport }) {
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;

  return (
    <View style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={styles.cardTop}>
        <Ionicons name={cfg.icon} size={20} color={cfg.iconColor} />
        <View style={styles.cardMeta}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardType}>{alert.type}</Text>
            <View style={[styles.severityBadge, { backgroundColor: cfg.labelBg }]}>
              <Text style={[styles.severityText, { color: cfg.labelText }]}>{cfg.label}</Text>
            </View>
          </View>
          <Text style={styles.cardFilename} numberOfLines={1}>{alert.filename}</Text>
          <Text style={styles.cardTime}>{alert.createdAt}</Text>
        </View>
      </View>

      <Text style={styles.cardMessage}>{alert.message}</Text>

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.viewBtn} onPress={onViewReport} activeOpacity={0.8}>
          <Ionicons name="open-outline" size={14} color="#2563EB" />
          <Text style={styles.viewBtnText}>View report</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resolveBtn} onPress={onResolve} activeOpacity={0.8}>
          <Ionicons name="checkmark-outline" size={14} color="#16A34A" />
          <Text style={styles.resolveBtnText}>Resolve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 12,
    color: '#BFDBFE',
    marginTop: 2,
  },
  backBtn: { padding: 6 },
  headerBadge: {
    backgroundColor: '#DC2626',
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Card
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  cardMeta: { flex: 1 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardFilename: {
    fontSize: 12,
    color: '#475569',
  },
  cardTime: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  cardMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  viewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  resolveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  resolveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16A34A',
  },

  // All clear
  allClear: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  allClearIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  allClearTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  allClearSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
});