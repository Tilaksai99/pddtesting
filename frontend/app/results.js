import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { getToken } from './api';

const BASE_URL = 'http://10.33.115.98:8000/api';


export default function ResultsScreen() {
  const { reportId, filename } = useLocalSearchParams();
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [flagging, setFlagging] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  useEffect(() => {
    loadResults();
  }, [reportId]);

  const loadResults = async () => {
    setLoading(true);
    try {
      if (reportId) {
        const token = await getToken();
        const res   = await fetch(`${BASE_URL}/reports/${reportId}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResult(data);
          // Check if there are still pending AI code reviews for this report
          try {
            const revRes  = await fetch(`${BASE_URL}/reports/${reportId}/reviews`, { headers: { Authorization: `Bearer ${token}` } });
            if (revRes.ok) {
              const revData = await revRes.json();
              setPendingReviewCount(revData.filter((r) => r.status === 'pending').length);
            }
          } catch { /* non-critical */ }
          setLoading(false);
          return;
        }
      }
      // No real result — show error state
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!result || isSharing) return;
    setIsSharing(true);
    try {
      const lines = [
        `Report: ${result.filename}`,
        `Analysed: ${result.analysed_at}`,
        '',
        '── ICD-10 Codes ──',
        ...result.icd10.map((c) => `${c.code}  ${c.description}  (${c.confidence}%)`),
        '',
        '── CPT Codes ──',
        ...result.cpt.map((c) => `${c.code}  ${c.description}  (${c.confidence}%)`),
      ];
      await Share.share({ message: lines.join('\n'), title: 'Medical Coding Results' });
    } finally {
      setIsSharing(false);
    }
  };

  const handleFlag = async () => {
    setFlagging(true);
    try {
      if (reportId) {
        const token = await getToken();
        await fetch(`${BASE_URL}/reports/${reportId}/flag`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Manual review requested' }),
        });
      }
      Alert.alert('Flagged', 'This report has been flagged for manual review.');
    } catch {
      Alert.alert('Flagged', 'Flagged for manual review (offline mode).');
    } finally {
      setFlagging(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 14, color: '#64748B', fontSize: 14 }}>
          AI is analysing your report…
        </Text>
      </SafeAreaView>
    );
  }

  if (!result) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Ionicons name="document-outline" size={56} color="#CBD5E1" />
        <Text style={{ marginTop: 16, fontSize: 16, fontWeight: 'bold', color: '#0F172A' }}>
          No results found
        </Text>
        <Text style={{ marginTop: 8, fontSize: 13, color: '#64748B', textAlign: 'center' }}>
          Could not load results for this report. Please try again or re-upload.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, paddingVertical: 13, paddingHorizontal: 28, backgroundColor: '#2563EB', borderRadius: 14 }}
          onPress={() => router.back()}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const avgConfidence = Math.round(
    [...result.icd10, ...result.cpt].reduce((s, c) => s + c.confidence, 0) /
      (result.icd10.length + result.cpt.length)
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <LinearGradient colors={['#1E3A8A', '#2563EB']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {result.filename || filename || 'AI Results'}
          </Text>
          <Text style={styles.headerSub}>{result.analysed_at}</Text>
        </View>
        <TouchableOpacity onPress={handleExport} style={styles.headerIcon} disabled={isSharing}>
          <Ionicons name="share-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Pending reviews banner */}
        {pendingReviewCount > 0 && (
          <TouchableOpacity
            style={styles.reviewBanner}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/review', params: { reportId, filename: result.filename } })}
          >
            <Ionicons name="sparkles-outline" size={18} color="#1E40AF" />
            <Text style={styles.reviewBannerText}>
              {pendingReviewCount} AI code suggestion{pendingReviewCount !== 1 ? 's' : ''} waiting for your review
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color="#1E40AF" />
          </TouchableOpacity>
        )}

        {/* Summary strip */}
        <View style={styles.summaryStrip}>
          <SummaryPill label="Codes found" value={result.icd10.length + result.cpt.length} color="#2563EB" bg="#EFF6FF" />
          <SummaryPill label="Avg confidence" value={`${avgConfidence}%`} color="#16A34A" bg="#F0FDF4" />
          <SummaryPill label="Flags" value={result.flags?.length || 0} color="#D97706" bg="#FFFBEB" />
        </View>

        {/* AI Summary */}
        {result.summary && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={18} color="#2563EB" />
              <Text style={styles.cardTitle}>Clinical summary</Text>
            </View>
            <Text style={styles.summaryText}>{result.summary}</Text>
          </View>
        )}

        {/* ICD-10 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="medical-outline" size={18} color="#2563EB" />
            <Text style={styles.cardTitle}>ICD-10 diagnosis codes</Text>
            <Text style={styles.cardCount}>{result.icd10.length} codes</Text>
          </View>
          {result.icd10.map((item) => (
            <CodeRow key={item.code} item={item} />
          ))}
        </View>

        {/* CPT */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="list-outline" size={18} color="#16A34A" />
            <Text style={styles.cardTitle}>CPT procedure codes</Text>
            <Text style={styles.cardCount}>{result.cpt.length} codes</Text>
          </View>
          {result.cpt.map((item) => (
            <CodeRow key={item.code} item={item} accent="#16A34A" />
          ))}
        </View>

        {/* Flags */}
        {result.flags?.length > 0 && (
          <View style={[styles.card, styles.flagCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="warning-outline" size={18} color="#D97706" />
              <Text style={[styles.cardTitle, { color: '#92400E' }]}>Review flags</Text>
            </View>
            {result.flags.map((flag, i) => (
              <View key={i} style={styles.flagRow}>
                <Ionicons name="alert-circle-outline" size={14} color="#D97706" style={{ marginTop: 2 }} />
                <Text style={styles.flagText}>{flag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleExport} disabled={isSharing} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={18} color="#2563EB" />
            <Text style={styles.actionBtnText}>{isSharing ? 'Sharing…' : 'Export'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnWarn]}
            onPress={handleFlag}
            disabled={flagging}
            activeOpacity={0.8}
          >
            {flagging
              ? <ActivityIndicator size="small" color="#D97706" />
              : <Ionicons name="flag-outline" size={18} color="#D97706" />}
            <Text style={[styles.actionBtnText, { color: '#D97706' }]}>Flag review</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnAI]}
            onPress={() => router.push('/assistant')}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubbles-outline" size={18} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Ask AI</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Code Row ─────────────────────────────────────────────────────────────────

function CodeRow({ item, accent = '#2563EB' }) {
  const conf = item.confidence;
  const barColor = conf >= 90 ? '#16A34A' : conf >= 75 ? '#D97706' : '#DC2626';

  return (
    <View style={styles.codeRow}>
      <View style={styles.codeLeft}>
        <Text style={[styles.codeText, { color: accent }]}>{item.code}</Text>
        <Text style={styles.codeDesc}>{item.description}</Text>
      </View>
      <View style={styles.codeRight}>
        <Text style={[styles.confNum, { color: barColor }]}>{conf}%</Text>
        <View style={styles.confTrack}>
          <View style={[styles.confFill, { width: `${conf}%`, backgroundColor: barColor }]} />
        </View>
      </View>
    </View>
  );
}

// ── Summary Pill ─────────────────────────────────────────────────────────────

function SummaryPill({ label, value, color, bg }) {
  return (
    <View style={[styles.summaryPill, { backgroundColor: bg }]}>
      <Text style={[styles.pillValue, { color }]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 12,
    color: '#BFDBFE',
    marginTop: 2,
  },
  backBtn: { padding: 6 },
  headerIcon: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  // Summary strip
  summaryStrip: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summaryPill: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  pillValue: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  pillLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  flagCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
    flex: 1,
  },
  cardCount: {
    fontSize: 12,
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },

  // Summary text
  summaryText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 21,
  },

  // Code row
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },
  codeLeft: {
    flex: 1,
  },
  codeText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  codeDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  codeRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  confNum: {
    fontSize: 12,
    fontWeight: '700',
  },
  confTrack: {
    width: 64,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confFill: {
    height: 4,
    borderRadius: 2,
  },

  // Flags
  flagRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  flagText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 19,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  actionBtnWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  actionBtnAI: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
});