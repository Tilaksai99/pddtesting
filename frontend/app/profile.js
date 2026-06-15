import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getUser, fetchMe, logout, getUserStats } from './api';
import { TabBar } from './dashboard';

export default function ProfileScreen() {
  const [user, setUser]       = useState(null);
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const [userResult, statsResult] = await Promise.allSettled([
        fetchMe().catch(() => getUser()),   // live API, fallback to cache
        getUserStats(),
      ]);

      if (userResult.status === 'fulfilled') setUser(userResult.value);
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '??';

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
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar card */}
        <View style={styles.avatarCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email || ''}</Text>

          {user?.role && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{user.role}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/settings')}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={16} color="#2563EB" />
            <Text style={styles.editBtnText}>Edit profile</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <Text style={styles.sectionTitle}>This month's activity</Text>
        {stats ? (
          <View style={styles.statsGrid}>
            <StatTile icon="documents-outline"        iconBg="#EFF6FF" iconColor="#2563EB" label="Reports"     value={stats.reports_total ?? 0} />
            <StatTile icon="code-slash-outline"       iconBg="#F0FDF4" iconColor="#16A34A" label="Codes"       value={(stats.codes_generated ?? 0).toLocaleString()} />
            <StatTile icon="checkmark-circle-outline" iconBg="#F0FDF4" iconColor="#16A34A" label="Accuracy"    value={`${stats.accuracy ?? 0}%`} />
            <StatTile icon="time-outline"             iconBg="#FFFBEB" iconColor="#D97706" label="Hours saved" value={`${stats.hours_saved ?? 0}h`} />
          </View>
        ) : (
          <View style={styles.statsEmpty}>
            <Text style={styles.statsEmptyText}>Upload reports to see your activity stats.</Text>
          </View>
        )}

        {/* Account details */}
        <Text style={styles.sectionTitle}>Account details</Text>
        <View style={styles.card}>
          <DetailRow icon="person-outline"    label="Full name"  value={user?.name  || '—'} />
          <DetailRow icon="mail-outline"      label="Email"      value={user?.email || '—'} />
          <DetailRow icon="call-outline"      label="Phone"      value={user?.phone || '—'} />
          <DetailRow icon="briefcase-outline" label="Role"       value={user?.role  || '—'} last />
        </View>

        {/* Quick links */}
        <Text style={styles.sectionTitle}>More</Text>
        <View style={styles.card}>
          <LinkRow icon="history-outline"       label="View history"  onPress={() => router.push('/history')} />
          <LinkRow icon="notifications-outline" label="Alerts"        onPress={() => router.push('/alerts')} />
          <LinkRow icon="chatbubbles-outline"   label="AI Assistant"  onPress={() => router.push('/assistant')} />
          <LinkRow icon="settings-outline"      label="Settings"      onPress={() => router.push('/settings')} last />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      <TabBar active="profile" />
    </SafeAreaView>
  );
}

function StatTile({ icon, iconBg, iconColor, label, value }) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({ icon, label, value, last }) {
  return (
    <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon} size={18} color="#64748B" />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function LinkRow({ icon, label, onPress, last }) {
  return (
    <TouchableOpacity
      style={[styles.linkRow, last && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={18} color="#2563EB" />
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward-outline" size={16} color="#CBD5E1" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#F8FAFC' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle:   { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF' },
  backBtn:       { padding: 6 },
  settingsBtn:   { padding: 6 },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16 },

  avatarCard:    { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20 },
  avatar:        { width: 72, height: 72, borderRadius: 36, backgroundColor: '#EFF6FF', borderWidth: 2, borderColor: '#BFDBFE', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText:    { fontSize: 24, fontWeight: 'bold', color: '#1E40AF' },
  userName:      { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  userEmail:     { fontSize: 13, color: '#64748B', marginTop: 4 },
  roleBadge:     { marginTop: 10, backgroundColor: '#EFF6FF', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#BFDBFE' },
  roleBadgeText: { fontSize: 13, color: '#1E40AF', fontWeight: '600' },
  editBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 9, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  editBtnText:   { fontSize: 13, color: '#2563EB', fontWeight: '600' },

  sectionTitle:  { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statTile:       { width: '47.5%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  statIcon:       { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue:      { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  statLabel:      { fontSize: 12, color: '#64748B', marginTop: 3 },
  statsEmpty:     { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  statsEmptyText: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  card:        { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 16, marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  detailRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  detailLabel: { fontSize: 13, color: '#64748B', width: 80 },
  detailValue: { flex: 1, fontSize: 13, color: '#0F172A', fontWeight: '500', textAlign: 'right' },
  linkRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  linkLabel:   { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '500' },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3', marginBottom: 8 },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#DC2626' },
});