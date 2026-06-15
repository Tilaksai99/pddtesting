import React, { useEffect, useState, useCallback } from 'react';
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
  TextInput,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { getPendingReviews, approveReview, rejectReview } from './api';

export default function ReviewScreen() {
  const { reportId, filename } = useLocalSearchParams();

  const [reviews, setReviews]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState(null); // which card is mid-action

  useEffect(() => { loadReviews(); }, [reportId]);

  const loadReviews = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await getPendingReviews(reportId);
      setReviews(data);
    } catch (err) {
      Alert.alert('Error', 'Could not load pending reviews.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleApprove = async (reviewId, editedCode) => {
    setActioningId(reviewId);
    try {
      await approveReview(reviewId, editedCode);
      // Remove from list immediately
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (err) {
      Alert.alert('Failed', err.message || 'Could not approve. Please retry.');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (reviewId, entity) => {
    Alert.alert(
      'Reject suggestion',
      `Reject AI suggestion for "${entity}"? It will NOT be added to Neo4j.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActioningId(reviewId);
            try {
              await rejectReview(reviewId, 'Rejected by human reviewer');
              setReviews((prev) => prev.filter((r) => r.id !== reviewId));
            } catch (err) {
              Alert.alert('Failed', err.message || 'Could not reject.');
            } finally {
              setActioningId(null);
            }
          },
        },
      ]
    );
  };

  const onRefresh = useCallback(() => loadReviews(true), [reportId]);

  const pendingCount  = reviews.length;
  const icdReviews    = reviews.filter((r) => r.code_type === 'ICDCode');
  const cptReviews    = reviews.filter((r) => r.code_type !== 'ICDCode');

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 14, color: '#64748B', fontSize: 14 }}>
          Loading AI suggestions…
        </Text>
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
          <Text style={styles.headerTitle}>Review AI Suggestions</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {filename || 'Medical report'}
          </Text>
        </View>
        {pendingCount > 0 && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{pendingCount}</Text>
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
        }
      >

        {/* All reviewed — success state */}
        {pendingCount === 0 ? (
          <View style={styles.allDone}>
            <View style={styles.allDoneIcon}>
              <Ionicons name="checkmark-circle" size={56} color="#16A34A" />
            </View>
            <Text style={styles.allDoneTitle}>All reviewed!</Text>
            <Text style={styles.allDoneSub}>
              All AI suggestions have been reviewed. Approved codes are now in Neo4j
              and will appear automatically on future reports.
            </Text>
            <TouchableOpacity
              style={styles.goResultsBtn}
              onPress={() => router.push({ pathname: '/results', params: { reportId, filename } })}
              activeOpacity={0.85}
            >
              <Text style={styles.goResultsText}>View final results</Text>
              <Ionicons name="arrow-forward-outline" size={16} color="#2563EB" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Info banner */}
            <View style={styles.infoBanner}>
              <Ionicons name="sparkles-outline" size={18} color="#1E40AF" />
              <Text style={styles.infoText}>
                Neo4j had no codes for these entities. AI suggested the codes below.
                Review each one — approved codes are permanently saved to the graph.
              </Text>
            </View>

            {/* ICD-10 section */}
            {icdReviews.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="medical-outline" size={15} color="#2563EB" />
                  <Text style={styles.sectionTitle}>ICD-10 Diagnosis Codes</Text>
                  <Text style={styles.sectionCount}>{icdReviews.length}</Text>
                </View>
                {icdReviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    actioning={actioningId === r.id}
                    onApprove={(edited) => handleApprove(r.id, edited)}
                    onReject={() => handleReject(r.id, r.entity)}
                  />
                ))}
              </>
            )}

            {/* CPT / HCPCS section */}
            {cptReviews.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="list-outline" size={15} color="#16A34A" />
                  <Text style={[styles.sectionTitle, { color: '#15803D' }]}>
                    CPT / HCPCS Procedure Codes
                  </Text>
                  <Text style={[styles.sectionCount, { backgroundColor: '#F0FDF4', color: '#15803D' }]}>
                    {cptReviews.length}
                  </Text>
                </View>
                {cptReviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    actioning={actioningId === r.id}
                    onApprove={(edited) => handleApprove(r.id, edited)}
                    onReject={() => handleReject(r.id, r.entity)}
                    accent="#16A34A"
                  />
                ))}
              </>
            )}

            {/* Skip all button */}
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => router.push({ pathname: '/results', params: { reportId, filename } })}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Skip — review later</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Review Card ───────────────────────────────────────────────────────────────

function ReviewCard({ review, actioning, onApprove, onReject, accent = '#2563EB' }) {
  const [editedCode, setEditedCode] = useState('');
  const [editing, setEditing]       = useState(false);

  const conf      = review.confidence || 0;
  const confColor = conf >= 85 ? '#16A34A' : conf >= 65 ? '#D97706' : '#DC2626';
  const confBg    = conf >= 85 ? '#F0FDF4'  : conf >= 65 ? '#FFFBEB'  : '#FFF1F2';

  const displayCode = editedCode.trim() || review.suggested_code;

  return (
    <View style={styles.card}>

      {/* Top row: entity + confidence badge */}
      <View style={styles.cardTop}>
        <View style={styles.entityWrap}>
          <Text style={styles.entityLabel}>Entity</Text>
          <Text style={styles.entityText}>{review.entity}</Text>
          <Text style={styles.entityType}>{review.entity_type}</Text>
        </View>
        <View style={[styles.confBadge, { backgroundColor: confBg }]}>
          <Text style={[styles.confText, { color: confColor }]}>{conf}%</Text>
          <Text style={[styles.confLabel, { color: confColor }]}>confidence</Text>
        </View>
      </View>

      {/* Arrow → code */}
      <View style={styles.arrowRow}>
        <View style={styles.arrowLine} />
        <Ionicons name="arrow-forward" size={14} color="#CBD5E1" />
      </View>

      {/* Suggested code block */}
      <View style={[styles.codeBlock, { borderLeftColor: accent }]}>
        <View style={styles.codeTopRow}>
          <Text style={[styles.codeValue, { color: accent }]}>{displayCode}</Text>
          <View style={styles.codeTypeBadge}>
            <Text style={styles.codeTypeText}>{review.code_type}</Text>
          </View>
        </View>
        <Text style={styles.codeDesc}>{review.description}</Text>
        {review.reasoning ? (
          <Text style={styles.reasoning}>💡 {review.reasoning}</Text>
        ) : null}
      </View>

      {/* Edit code field */}
      {editing ? (
        <View style={styles.editWrap}>
          <TextInput
            style={styles.editInput}
            value={editedCode}
            onChangeText={setEditedCode}
            placeholder={`Override code (e.g. ${review.suggested_code})`}
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity onPress={() => { setEditing(false); setEditedCode(''); }} style={styles.editCancelBtn}>
            <Ionicons name="close-outline" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.editHintBtn} onPress={() => setEditing(true)} activeOpacity={0.7}>
          <Ionicons name="pencil-outline" size={14} color="#94A3B8" />
          <Text style={styles.editHintText}>Edit code before approving</Text>
        </TouchableOpacity>
      )}

      {/* Action buttons */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.rejectBtn}
          onPress={onReject}
          disabled={actioning}
          activeOpacity={0.8}
        >
          <Ionicons name="close-outline" size={16} color="#DC2626" />
          <Text style={styles.rejectText}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.approveBtn, { backgroundColor: accent, borderColor: accent }]}
          onPress={() => onApprove(editedCode.trim() || null)}
          disabled={actioning}
          activeOpacity={0.85}
        >
          {actioning ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-outline" size={16} color="#FFFFFF" />
              <Text style={styles.approveText}>
                Approve{editedCode.trim() ? ` "${editedCode.trim()}"` : ` "${review.suggested_code}"`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#F8FAFC' },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  headerTitle:   { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF' },
  headerSub:     { fontSize: 12, color: '#BFDBFE', marginTop: 2 },
  backBtn:       { padding: 6 },
  headerBadge:   { backgroundColor: '#DC2626', minWidth: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  headerBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16 },

  infoBanner: {
    flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 14,
    padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 20 },

  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: '#1E40AF', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount:   { fontSize: 12, fontWeight: '700', color: '#1E40AF', backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  // Card
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  entityWrap:   { flex: 1, marginRight: 12 },
  entityLabel:  { fontSize: 10, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  entityText:   { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  entityType:   { fontSize: 11, color: '#64748B', marginTop: 3, textTransform: 'capitalize' },
  confBadge:    { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  confText:     { fontSize: 18, fontWeight: 'bold' },
  confLabel:    { fontSize: 10, fontWeight: '600', marginTop: 1 },

  arrowRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  arrowLine:    { flex: 1, height: 1, backgroundColor: '#E2E8F0' },

  codeBlock:    { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 12 },
  codeTopRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  codeValue:    { fontSize: 20, fontWeight: 'bold', fontFamily: 'monospace' },
  codeTypeBadge:{ backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  codeTypeText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  codeDesc:     { fontSize: 13, color: '#475569', lineHeight: 19 },
  reasoning:    { fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 18, fontStyle: 'italic' },

  editHintBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, marginBottom: 10 },
  editHintText: { fontSize: 12, color: '#94A3B8' },
  editWrap:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  editInput:    { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0', fontFamily: 'monospace' },
  editCancelBtn:{ padding: 6 },

  cardActions:  { flexDirection: 'row', gap: 10 },
  rejectBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3' },
  rejectText:   { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  approveBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  approveText:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  // Skip
  skipBtn:      { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  skipText:     { fontSize: 14, color: '#94A3B8', fontWeight: '500' },

  // All done
  allDone:      { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24, gap: 14 },
  allDoneIcon:  { width: 96, height: 96, borderRadius: 48, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center' },
  allDoneTitle: { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  allDoneSub:   { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22 },
  goResultsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  goResultsText:{ fontSize: 15, fontWeight: '700', color: '#2563EB' },
});