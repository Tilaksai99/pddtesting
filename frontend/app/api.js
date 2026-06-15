import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// ─── Change this to your machine's local IP when testing on a real device ────
const BASE_URL   = 'http://10.33.115.98:8000/api/auth';
const UPLOAD_URL = 'http://10.33.115.98:8000/api/reports/upload';

// ─── Token helpers ────────────────────────────────────────────────────────────

export async function saveToken(token) {
  await AsyncStorage.setItem('access_token', token);
}

export async function getToken() {
  return AsyncStorage.getItem('access_token');
}

export async function removeToken() {
  await AsyncStorage.removeItem('access_token');
}

export async function saveUser(user) {
  await AsyncStorage.setItem('user', JSON.stringify(user));
}

export async function getUser() {
  const raw = await AsyncStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

// ─── Auth headers helper ──────────────────────────────────────────────────────

async function authHeaders() {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function registerUser({ name, email, password, phone = '', role = '' }) {
  const res = await fetch(`${BASE_URL}/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, email, password, phone }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Registration failed');

  await saveToken(data.access_token);
  await saveUser(data.user);
  if (role) await updateProfile({ role });

  return data;
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser({ email, password }) {
  const res = await fetch(`${BASE_URL}/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');

  await saveToken(data.access_token);
  await saveUser(data.user);

  return data;
}

// ─── Get current user (me) ────────────────────────────────────────────────────

export async function fetchMe() {
  const res = await fetch(`${BASE_URL}/me`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to fetch profile');
  return data;
}

// ─── Update profile ───────────────────────────────────────────────────────────

export async function updateProfile(fields) {
  const res = await fetch(`${BASE_URL}/me`, {
    method:  'PUT',
    headers: await authHeaders(),
    body:    JSON.stringify(fields),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Profile update failed');
  if (data.user) await saveUser(data.user);

  return data;
}

// ─── Upload medical report ────────────────────────────────────────────────────
//
// ROOT CAUSE OF THE [object Object] BUG:
//
// The old code did:
//   formData.append('file', { uri, name, type })
//   headers: { 'Content-Type': 'multipart/form-data' }   ← also wrong
//
// TWO bugs in one function:
//
// Bug 1 — Plain object append on web:
//   React Native's fetch polyfill understands { uri, name, type } and streams
//   the local file. The browser's native fetch does NOT — it calls .toString()
//   on the plain object, producing the string "[object Object]" as the file
//   body. FastAPI receives that string → 422.
//
// Bug 2 — Manual Content-Type header:
//   Setting 'Content-Type': 'multipart/form-data' manually omits the boundary
//   parameter that fetch auto-generates (e.g. boundary=----WebKitXXXX).
//   Without the boundary FastAPI cannot parse the multipart body → 400/422.
//   Fix: NEVER set Content-Type manually for multipart. Let fetch set it.
//
// Fix: detect platform and use the correct append strategy for each.
//   Web   → get the raw browser File object from a.file (set in upload.js),
//            or fetch the blob: URI as a fallback, then append a real File.
//   Native → { uri, name, type } descriptor (unchanged — works fine on RN).

export async function uploadMedicalReport(file, reportType = 'auto') {
  const token    = await getToken();
  const formData = new FormData();

  if (Platform.OS === 'web') {
    // On web, use the raw browser File object stored as fileRef during picking.
    // If fileRef is missing, fall back to fetching the blob: URI.
    if (file.fileRef instanceof File) {
      formData.append('file', file.fileRef, file.name);
    } else {
      const blobRes  = await fetch(file.uri);
      const blob     = await blobRes.blob();
      const mimeType = file.mimeType || inferMimeType(file.name);
      formData.append('file', new File([blob], file.name, { type: mimeType }), file.name);
    }
  } else {
    // React Native (iOS / Android) — RN fetch polyfill handles this descriptor.
    formData.append('file', {
      uri:  file.uri,
      name: file.name,
      type: file.mimeType || inferMimeType(file.name),
    });
  }

  formData.append('report_type', reportType);

  const res = await fetch(UPLOAD_URL, {
    method:  'POST',
    headers: {
      // ✅ DO NOT set Content-Type here.
      // fetch() auto-generates: Content-Type: multipart/form-data; boundary=XXXX
      // Setting it manually strips the boundary → FastAPI can't parse body → 422.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Upload failed');

  return data;
}

// ─── Mime type helper (also used by uploadMedicalReport) ─────────────────────

export function inferMimeType(filename = '') {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'pdf':  return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':  return 'application/msword';
    case 'txt':  return 'text/plain';
    default:     return 'application/pdf';
  }
}

// ─── Forgot password ──────────────────────────────────────────────────────────

export async function forgotPassword(email) {
  const res = await fetch(`${BASE_URL}/forgot-password`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to send OTP');
  return data;
}

// ─── Reset password ───────────────────────────────────────────────────────────

export async function resetPassword({ email, otp, new_password }) {
  const res = await fetch(`${BASE_URL}/reset-password`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, otp, new_password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Password reset failed');
  return data;
}

// ─── Review queue ─────────────────────────────────────────────────────────────

const REVIEW_URL = 'http://10.33.115.98:8000/api';

export async function getPendingReviews(reportId = null) {
  const headers = await authHeaders();
  const url = reportId
    ? `${REVIEW_URL}/reviews/pending?report_id=${reportId}`
    : `${REVIEW_URL}/reviews/pending`;
  const res  = await fetch(url, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to fetch reviews');
  return data;
}

export async function approveReview(reviewId, editedCode = null) {
  const headers = await authHeaders();
  const res = await fetch(`${REVIEW_URL}/reviews/${reviewId}/approve`, {
    method:  'PATCH',
    headers,
    body:    JSON.stringify({ edited_code: editedCode || null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Approval failed');
  return data;
}

export async function rejectReview(reviewId, reason = 'Rejected by reviewer') {
  const headers = await authHeaders();
  const res = await fetch(`${REVIEW_URL}/reviews/${reviewId}/reject`, {
    method:  'PATCH',
    headers,
    body:    JSON.stringify({ reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Rejection failed');
  return data;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout() {
  await removeToken();
  await AsyncStorage.removeItem('user');
}
// ─── Dashboard stats ──────────────────────────────────────────────────────────

const DASHBOARD_URL = 'http://10.33.115.98:8000/api';

export async function getDashboardStats() {
  const res = await fetch(`${DASHBOARD_URL}/reports/stats`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to fetch stats');
  return data;
}

export async function getRecentReports(limit = 5) {
  const res = await fetch(`${DASHBOARD_URL}/reports/history?limit=${limit}`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to fetch recent reports');
  return data.reports || data;
}

export async function getAlerts() {
  const res = await fetch(`${DASHBOARD_URL}/reports/alerts`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to fetch alerts');
  return data.alerts || data;
}

export async function getUserStats() {
  const res = await fetch(`${DASHBOARD_URL}/reports/user-stats`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Failed to fetch user stats');
  return data;
}