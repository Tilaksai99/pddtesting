import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, StatusBar, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { TabBar } from './dashboard';
import { getToken, inferMimeType } from './api';   // ← reuse inferMimeType from api.js

const REPORT_TYPES = [
  { key: 'auto',       label: 'Auto-detect',       icon: 'sparkles-outline' },
  { key: 'discharge',  label: 'Discharge Summary',  icon: 'document-text-outline' },
  { key: 'radiology',  label: 'Radiology Report',   icon: 'scan-outline' },
  { key: 'lab',        label: 'Lab Report',         icon: 'flask-outline' },
  { key: 'opd',        label: 'OPD Notes',          icon: 'clipboard-outline' },
  { key: 'operative',  label: 'Operative Notes',    icon: 'medkit-outline' },
];

const BASE_URL = 'http://10.33.115.98:8000/api';

// ─── Platform-aware FormData file append ─────────────────────────────────────
//
// Web:    Expo DocumentPicker puts the raw browser File on a.file → stored as
//         fileRef. We append it directly. If missing, we fetch the blob: URI.
// Native: RN fetch polyfill understands { uri, name, type } — unchanged.
//
const appendFileToFormData = async (formData, fieldName, file) => {
  if (Platform.OS === 'web') {
    if (file.fileRef instanceof File) {
      formData.append(fieldName, file.fileRef, file.name);
    } else {
      const blobRes  = await fetch(file.uri);
      const blob     = await blobRes.blob();
      const mimeType = file.mimeType || inferMimeType(file.name);
      formData.append(fieldName, new File([blob], file.name, { type: mimeType }), file.name);
    }
  } else {
    formData.append(fieldName, {
      uri:  file.uri,
      name: file.name,
      type: file.mimeType || inferMimeType(file.name),
    });
  }
};

export default function UploadScreen() {
  const [files, setFiles]           = useState([]);
  const [reportType, setReportType] = useState('auto');
  const [loading, setLoading]       = useState(false);

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
          'text/plain',
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const picked = result.assets.map((a) => ({
        uri:      a.uri,
        name:     a.name,
        size:     a.size,
        mimeType: a.mimeType || inferMimeType(a.name),
        status:   'pending',
        fileRef:  a.file || null,   // ← raw browser File object (web only)
      }));

      setFiles((prev) => [...prev, ...picked]);
    } catch (err) {
      Alert.alert('Error', 'Could not pick file. Please try again.');
    }
  };

  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleAnalyse = async () => {
    if (files.length === 0) {
      Alert.alert('No file', 'Please upload at least one report first.');
      return;
    }

    setLoading(true);
    try {
      const token         = await getToken();
      const uploadedIds   = [];
      let firstHasPending = false;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f));

        const formData = new FormData();
        await appendFileToFormData(formData, 'file', file);
        formData.append('report_type', reportType);

        const res = await fetch(`${BASE_URL}/reports/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            // ✅ NO Content-Type here — fetch sets it automatically with boundary
          },
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Upload failed');

        uploadedIds.push(data.report_id || data.id);
        if (i === 0) firstHasPending = data.has_pending_reviews || false;
        setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: 'done' } : f));
      }

      // AI found missing codes → review first; else go straight to results
      if (firstHasPending) {
        router.push({ pathname: '/review', params: { reportId: uploadedIds[0], filename: files[0].name } });
      } else {
        router.push({ pathname: '/results', params: { reportId: uploadedIds[0], filename: files[0].name } });
      }
    } catch (err) {
      Alert.alert('Upload Failed', err.message || 'Something went wrong.');
      setFiles((prev) => prev.map((f) => ({ ...f, status: 'error' })));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#1E3A8A', '#2563EB']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload Report</Text>
        <View style={{ width: 38 }} />
      </LinearGradient>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <TouchableOpacity style={styles.dropZone} onPress={pickFiles} activeOpacity={0.7}>
          <View style={styles.dropIconWrap}>
            <Ionicons name="cloud-upload-outline" size={40} color="#2563EB" />
          </View>
          <Text style={styles.dropTitle}>Tap to select files</Text>
          <Text style={styles.dropSub}>PDF, DOCX, TXT · Max 20 MB each</Text>
        </TouchableOpacity>

        {files.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Selected files</Text>
            {files.map((file, index) => (
              <FileRow key={index} file={file} onRemove={() => removeFile(index)} />
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Report type</Text>
          <View style={styles.typeGrid}>
            {REPORT_TYPES.map((rt) => (
              <TouchableOpacity
                key={rt.key}
                style={[styles.typeChip, reportType === rt.key && styles.typeChipActive]}
                onPress={() => setReportType(rt.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={rt.icon} size={16} color={reportType === rt.key ? '#FFFFFF' : '#64748B'} />
                <Text style={[styles.typeChipText, reportType === rt.key && styles.typeChipTextActive]}>
                  {rt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color="#2563EB" />
          <Text style={styles.infoText}>
            AI will extract ICD-10 diagnoses, CPT procedure codes, and flag items needing
            manual review. Average analysis time is under 30 seconds.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.analyseBtn, loading && { opacity: 0.7 }]}
          onPress={handleAnalyse}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#2563EB', '#1D4ED8']} style={styles.analyseBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {loading
              ? <ActivityIndicator color="#FFFFFF" />
              : (<>
                  <Ionicons name="sparkles-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.analyseBtnText}>Analyse with AI</Text>
                </>)}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      <TabBar active="upload" />
    </SafeAreaView>
  );
}

function FileRow({ file, onRemove }) {
  const statusColor = { pending: '#64748B', uploading: '#2563EB', done: '#16A34A', error: '#DC2626' };
  const statusLabel = { pending: 'Ready', uploading: 'Uploading…', done: 'Done', error: 'Failed' };

  const fileSize = file.size
    ? file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`
    : '';

  const getFileIcon = (name = '') => {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf')                   return 'document-text-outline';
    if (ext === 'docx' || ext === 'doc') return 'document-outline';
    if (ext === 'txt')                   return 'reader-outline';
    return 'document-outline';
  };

  return (
    <View style={styles.fileRow}>
      <View style={styles.fileIconWrap}>
        <Ionicons name={getFileIcon(file.name)} size={22} color="#2563EB" />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
        <Text style={styles.fileMeta}>{fileSize}</Text>
        {file.status === 'uploading' && (
          <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
        )}
      </View>
      <View style={styles.fileRight}>
        <Text style={[styles.fileStatus, { color: statusColor[file.status] }]}>
          {statusLabel[file.status]}
        </Text>
        {file.status !== 'uploading' && (
          <TouchableOpacity onPress={onRemove} style={{ marginTop: 4 }}>
            <Ionicons name="close-circle-outline" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1, backgroundColor: '#F8FAFC' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle:     { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF' },
  backBtn:         { padding: 6 },
  scroll:          { flex: 1 },
  scrollContent:   { padding: 16 },
  dropZone:        { borderWidth: 2, borderColor: '#BFDBFE', borderStyle: 'dashed', borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24, marginBottom: 20 },
  dropIconWrap:    { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  dropTitle:       { fontSize: 16, fontWeight: 'bold', color: '#1E40AF', marginBottom: 6 },
  dropSub:         { fontSize: 13, color: '#64748B', textAlign: 'center' },
  section:         { marginBottom: 20 },
  sectionTitle:    { fontSize: 14, fontWeight: 'bold', color: '#0F172A', marginBottom: 10 },
  fileRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  fileIconWrap:    { width: 42, height: 42, borderRadius: 10, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  fileInfo:        { flex: 1 },
  fileName:        { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  fileMeta:        { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  progressTrack:   { height: 3, backgroundColor: '#E2E8F0', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressFill:    { height: 3, width: '60%', backgroundColor: '#2563EB', borderRadius: 2 },
  fileRight:       { alignItems: 'flex-end' },
  fileStatus:      { fontSize: 11, fontWeight: '600' },
  typeGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  typeChipActive:  { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  typeChipText:    { fontSize: 13, color: '#64748B', fontWeight: '500' },
  typeChipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  infoBox:         { flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: '#BFDBFE' },
  infoText:        { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 20 },
  analyseBtn:      { borderRadius: 16, overflow: 'hidden' },
  analyseBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  analyseBtnText:  { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF' },
});