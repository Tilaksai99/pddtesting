import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getUser, logout, getDashboardStats, getRecentReports } from './api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFileIcon(filename = '') {
  if (filename.endsWith('.pdf')) return 'document-text';
  if (filename.endsWith('.docx') || filename.endsWith('.doc')) return 'document';
  return 'document-outline';
}

function StatusBadge({ status, alerts }) {
  if (status === 'alert') {
    return (
      <View style={[styles.badge, styles.badgeWarn]}>
        <Text style={styles.badgeWarnText}>
          {alerts} alert{alerts !== 1 ? 's' : ''}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeDone]}>
      <Text style={styles.badgeDoneText}>Done</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const [user, setUser]           = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [stats, setStats]         = useState(null);
  const [recent, setRecent]       = useState([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [userData, statsData, recentData] = await Promise.allSettled([
        getUser(),
        getDashboardStats(),
        getRecentReports(5),
      ]);

      if (userData.status === 'fulfilled') setUser(userData.value);
      if (statsData.status === 'fulfilled') setStats(statsData.value);
      if (recentData.status === 'fulfilled') setRecent(recentData.value);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => loadDashboard(true), []);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const firstName = user?.name?.split(' ')[0] || 'Doctor';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <LinearGradient colors={['#1E3A8A', '#2563EB']} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>
              {getGreeting()}, {firstName} 👋
            </Text>
            <Text style={styles.headerDate}>
              {new Date().toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutIcon}>
            <Ionicons name="log-out-outline" size={24} color="#DBEAFE" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
          }
        >
          {/* ── Stat Cards ── */}
          <View style={styles.statsGrid}>
            <StatCard
              label="Reports today"
              value={stats?.reports_today ?? '—'}
              sub={stats?.reports_today_delta ? `+${stats.reports_today_delta} from yesterday` : 'Pull to refresh'}
              subColor={stats?.reports_today_delta > 0 ? '#16A34A' : '#64748B'}
              icon="documents-outline"
              iconBg="#EFF6FF"
              iconColor="#2563EB"
            />
            <StatCard
              label="Codes found"
              value={stats?.codes_found ?? '—'}
              sub="ICD + CPT total"
              subColor="#64748B"
              icon="code-slash-outline"
              iconBg="#F0FDF4"
              iconColor="#16A34A"
            />
            <StatCard
              label="Active alerts"
              value={stats?.active_alerts ?? '—'}
              sub="Needs review"
              subColor="#DC2626"
              icon="warning-outline"
              iconBg="#FEF2F2"
              iconColor="#DC2626"
            />
            <StatCard
              label="Pre-auth flags"
              value={stats?.pre_auth_flags ?? '—'}
              sub="Insurance"
              subColor="#D97706"
              icon="shield-outline"
              iconBg="#FFFBEB"
              iconColor="#D97706"
            />
          </View>

          {/* ── Upload Button ── */}
          <TouchableOpacity
            style={styles.uploadBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/upload')}
          >
            <LinearGradient
              colors={['#2563EB', '#1D4ED8']}
              style={styles.uploadBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="cloud-upload-outline" size={22} color="#FFFFFF" />
              <Text style={styles.uploadBtnText}>Upload new report</Text>
              <Ionicons name="arrow-forward-outline" size={18} color="#BFDBFE" />
            </LinearGradient>
          </TouchableOpacity>

          {/* ── Recent Uploads ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent uploads</Text>
            <TouchableOpacity onPress={() => router.push('/history')}>
              <Text style={styles.sectionLink}>View all</Text>
            </TouchableOpacity>
          </View>

          {recent.length === 0 ? (
            <View style={styles.emptyRecent}>
              <Ionicons name="cloud-upload-outline" size={36} color="#CBD5E1" />
              <Text style={styles.emptyRecentText}>No reports yet. Upload your first report!</Text>
            </View>
          ) : (
            recent.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.recentItem}
                activeOpacity={0.7}
                onPress={() =>
                  router.push({ pathname: '/results', params: { reportId: item.id, filename: item.filename } })
                }
              >
                <View style={styles.fileIconWrap}>
                  <Ionicons name={getFileIcon(item.filename)} size={22} color="#2563EB" />
                </View>
                <View style={styles.recentInfo}>
                  <Text style={styles.recentFilename} numberOfLines={1}>
                    {item.filename}
                  </Text>
                  <Text style={styles.recentMeta}>
                    {item.date} · {item.codes} codes
                  </Text>
                </View>
                <StatusBadge status={item.status} alerts={item.alerts || 0} />
              </TouchableOpacity>
            ))
          )}

          {/* ── Alerts Shortcut ── */}
          {stats?.active_alerts > 0 && (
            <TouchableOpacity
              style={styles.alertsBanner}
              activeOpacity={0.8}
              onPress={() => router.push('/alerts')}
            >
              <Ionicons name="warning-outline" size={20} color="#B45309" />
              <Text style={styles.alertsBannerText}>
                {stats.active_alerts} alert{stats.active_alerts !== 1 ? 's' : ''} need your attention
              </Text>
              <Ionicons name="chevron-forward-outline" size={16} color="#B45309" />
            </TouchableOpacity>
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ── Bottom Tab Bar ── */}
      <TabBar active="home" />
    </SafeAreaView>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, subColor, icon, iconBg, iconColor }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statSub, { color: subColor }]}>{sub}</Text>
    </View>
  );
}

// ─── Tab Bar (shared) ─────────────────────────────────────────────────────────

export function TabBar({ active }) {
  const tabs = [
    { key: 'home',    label: 'Home',    icon: 'home-outline',         route: '/dashboard' },
    { key: 'upload',  label: 'Upload',  icon: 'cloud-upload-outline', route: '/upload' },
    { key: 'alerts',  label: 'Alerts',  icon: 'notifications-outline', route: '/alerts' },
    { key: 'profile', label: 'Profile', icon: 'person-outline',       route: '/profile' },
  ];

  return (
    <View style={tabStyles.bar}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          style={tabStyles.tab}
          onPress={() => router.replace(t.route)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={t.icon}
            size={24}
            color={active === t.key ? '#2563EB' : '#94A3B8'}
          />
          <Text style={[tabStyles.label, active === t.key && tabStyles.labelActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: '#F8FAFC' },
  header:          { paddingTop: 10, paddingBottom: 22, paddingHorizontal: 20 },
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting:        { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  headerDate:      { fontSize: 13, color: '#BFDBFE', marginTop: 3 },
  logoutIcon:      { padding: 8 },
  scroll:          { flex: 1 },
  scrollContent:   { padding: 16 },

  statsGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard:        { width: '47.5%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  statIcon:        { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue:       { fontSize: 26, fontWeight: 'bold', color: '#0F172A' },
  statLabel:       { fontSize: 12, color: '#64748B', marginTop: 2 },
  statSub:         { fontSize: 11, marginTop: 3, fontWeight: '500' },

  uploadBtn:         { borderRadius: 16, overflow: 'hidden', marginBottom: 22 },
  uploadBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: 20 },
  uploadBtnText:     { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold', flex: 1, textAlign: 'center' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:  { fontSize: 15, fontWeight: 'bold', color: '#0F172A' },
  sectionLink:   { fontSize: 13, color: '#2563EB', fontWeight: '600' },

  emptyRecent:     { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyRecentText: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  recentItem:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  fileIconWrap:  { width: 42, height: 42, borderRadius: 10, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  recentInfo:    { flex: 1 },
  recentFilename:{ fontSize: 13, fontWeight: '600', color: '#0F172A' },
  recentMeta:    { fontSize: 11, color: '#64748B', marginTop: 3 },

  badge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
  badgeDone:     { backgroundColor: '#DCFCE7' },
  badgeDoneText: { fontSize: 11, fontWeight: '600', color: '#166534' },
  badgeWarn:     { backgroundColor: '#FEF3C7' },
  badgeWarnText: { fontSize: 11, fontWeight: '600', color: '#92400E' },

  alertsBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 14, padding: 14, marginTop: 8 },
  alertsBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#92400E' },
});

const tabStyles = StyleSheet.create({
  bar:         { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingBottom: 8, paddingTop: 8 },
  tab:         { flex: 1, alignItems: 'center', gap: 3 },
  label:       { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  labelActive: { color: '#2563EB', fontWeight: '700' },
});