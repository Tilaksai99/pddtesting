import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getUser, updateProfile } from './api';

export default function SettingsScreen() {
  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [saving, setSaving]   = useState(false);

  // Notification toggles
  const [notifAnalysis, setNotifAnalysis]   = useState(true);
  const [notifLowConf,  setNotifLowConf]    = useState(true);
  const [notifWeekly,   setNotifWeekly]     = useState(false);

  // AI preference toggles
  const [autoCPT,       setAutoCPT]         = useState(true);
  const [confThreshold, setConfThreshold]   = useState(true);

  React.useEffect(() => {
    getUser().then((u) => {
      if (u) {
        setName(u.name  || '');
        setPhone(u.phone || '');
      }
    });
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Display name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() });
      Alert.alert('Saved ✅', 'Your profile has been updated.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#1E3A8A', '#2563EB']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Account ── */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Display name</Text>
            <TextInput
              style={styles.fieldInput}
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
            />
          </View>
          <View style={[styles.fieldWrap, { borderBottomWidth: 0 }]}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={styles.fieldInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 XXXXX XXXXX"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-outline" size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Save changes</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Notifications ── */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Analysis complete"
            sub="Alert when AI finishes a report"
            value={notifAnalysis}
            onToggle={() => setNotifAnalysis((v) => !v)}
          />
          <ToggleRow
            label="Low confidence flag"
            sub="Alert on codes below 80% confidence"
            value={notifLowConf}
            onToggle={() => setNotifLowConf((v) => !v)}
          />
          <ToggleRow
            label="Weekly summary"
            sub="Email digest every Monday morning"
            value={notifWeekly}
            onToggle={() => setNotifWeekly((v) => !v)}
            last
          />
        </View>

        {/* ── AI Preferences ── */}
        <Text style={styles.sectionTitle}>AI preferences</Text>
        <View style={styles.card}>
          <ToggleRow
            label="Auto-suggest CPT codes"
            sub="Generate CPT codes alongside ICD-10"
            value={autoCPT}
            onToggle={() => setAutoCPT((v) => !v)}
          />
          <ToggleRow
            label="Confidence threshold alerts"
            sub="Flag codes below 80% for review"
            value={confThreshold}
            onToggle={() => setConfThreshold((v) => !v)}
            last
          />
        </View>

        {/* ── Navigation shortcuts ── */}
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.card}>
          <LinkRow icon="lock-closed-outline" label="Change password"  onPress={() => router.push('/forgot-password')} />
          <LinkRow icon="help-circle-outline" label="Help & FAQ"       onPress={() => Alert.alert('Help', 'Contact support@medicalai.in')} />
          <LinkRow icon="shield-outline"      label="Privacy policy"   onPress={() => Alert.alert('Privacy', 'Privacy policy coming soon.')} last />
        </View>

        {/* ── Danger zone ── */}
        <Text style={styles.sectionTitle}>Danger zone</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.dangerRow}
            activeOpacity={0.8}
            onPress={() =>
              Alert.alert(
                'Delete account',
                'This will permanently delete your account and all data. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => {} },
                ]
              )
            }
          >
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
            <Text style={styles.dangerText}>Delete account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Toggle Row ────────────────────────────────────────────────────────────────

function ToggleRow({ label, sub, value, onToggle, last }) {
  return (
    <View style={[styles.toggleRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.toggleLeft}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sub && <Text style={styles.toggleSub}>{sub}</Text>}
      </View>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.8}
        style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}
      >
        <View style={[styles.toggleThumb, value ? styles.thumbOn : styles.thumbOff]} />
      </TouchableOpacity>
    </View>
  );
}

// ── Link Row ──────────────────────────────────────────────────────────────────

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
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  backBtn: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  // Field
  fieldWrap: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  fieldInput: {
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 2,
  },

  // Save button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 24,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  toggleLeft: { flex: 1 },
  toggleLabel: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },
  toggleSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
    flexShrink: 0,
  },
  toggleOn:  { backgroundColor: '#2563EB' },
  toggleOff: { backgroundColor: '#CBD5E1' },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbOn:  { alignSelf: 'flex-end' },
  thumbOff: { alignSelf: 'flex-start' },

  // Link row
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  linkLabel: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
  },

  // Danger
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
  },
  dangerText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
  },
});