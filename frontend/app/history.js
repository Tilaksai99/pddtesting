import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getToken } from './api';
import { TabBar } from './dashboard';

const BASE_URL = 'http://10.33.115.98:8000/api';


const TYPE_FILTERS = ['All', 'Discharge Summary', 'Radiology', 'Lab Report', 'OPD Notes', 'Operative Notes'];

const TYPE_ICONS = {
  'Discharge Summary': 'document-text-outline',
  'Radiology':         'scan-outline',
  'Lab Report':        'flask-outline',
  'OPD Notes':         'clipboard-outline',
  'Operative Notes':   'medkit-outline',
};

const TYPE_COLORS = {
  'Discharge Summary': { bg: '#EFF6FF', icon: '#2563EB' },
  'Radiology':         { bg: '#F0FDF4', icon: '#16A34A' },
  'Lab Report':        { bg: '#FFFBEB', icon: '#D97706' },
  'OPD Notes':         { bg: '#FDF4FF', icon: '#9333EA' },
  'Operative Notes':   { bg: '#FFF1F2', icon: '#E11D48' },
};

export default function HistoryScreen() {
  const [items, setItems]         = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    applyFilters(items, search, typeFilter);
  }, [search, typeFilter, items]);

  const loadHistory = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true); else setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch(`${BASE_URL}/reports/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.reports || data);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = (data, q, type) => {
    let out = data;
    if (q.trim()) {
      out = out.filter((i) => i.filename.toLowerCase().includes(q.toLowerCase()));
    }
    if (type !== 'All') {
      out = out.filter((i) => i.type === type);
    }
    setFiltered(out);
  };

  const onRefresh = useCallback(() => loadHistory(true), []);

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
        <Text style={styles.headerTitle}>History</Text>
        <View style={{ width: 38 }} />
      </LinearGradient>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search reports…"
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {TYPE_FILTERS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.filterChip, typeFilter === t && styles.filterChipActive]}
            onPress={() => setTypeFilter(t)}
          >
            <Text style={[styles.filterChipText, typeFilter === t && styles.filterChipTextActive]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Count */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>{filtered.length} report{filtered.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* List */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>No reports found</Text>
          </View>
        ) : (
          filtered.map((item) => (
            <HistoryItem
              key={item.id}
              item={item}
              onPress={() =>
                router.push({ pathname: '/results', params: { reportId: item.id, filename: item.filename } })
              }
            />
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <TabBar active="home" />
    </SafeAreaView>
  );
}

// ── History Item ──────────────────────────────────────────────────────────────

function HistoryItem({ item, onPress }) {
  const colors = TYPE_COLORS[item.type] || { bg: '#F1F5F9', icon: '#64748B' };
  const icon   = TYPE_ICONS[item.type]  || 'document-outline';

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.itemIconWrap, { backgroundColor: colors.bg }]}>
        <Ionicons name={icon} size={22} color={colors.icon} />
      </View>

      <View style={styles.itemInfo}>
        <Text style={styles.itemFilename} numberOfLines={1}>{item.filename}</Text>
        <Text style={styles.itemMeta}>{item.type} · {item.codes} codes</Text>
        <Text style={styles.itemDate}>{item.date}</Text>
      </View>

      <View style={styles.itemRight}>
        {item.status === 'alert' ? (
          <View style={styles.badgeWarn}>
            <Text style={styles.badgeWarnText}>{item.alerts} alert{item.alerts !== 1 ? 's' : ''}</Text>
          </View>
        ) : (
          <View style={styles.badgeDone}>
            <Text style={styles.badgeDoneText}>Done</Text>
          </View>
        )}
        <Ionicons name="chevron-forward-outline" size={16} color="#CBD5E1" style={{ marginTop: 6 }} />
      </View>
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

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
  },

  // Filter
  filterScroll: {
    marginTop: 10,
    flexGrow: 0,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterChipText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Count
  countRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  countText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

  // Item
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  itemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  itemInfo: { flex: 1 },
  itemFilename: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  itemMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  itemDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },

  // Badges
  badgeDone: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeDoneText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
  },
  badgeWarn: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeWarnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
  },

  // Empty
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },
});