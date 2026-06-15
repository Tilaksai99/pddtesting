import React, { useState } from 'react';

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const BASE_URL = 'http://10.33.115.98:8000/api/auth';

export default function ForgotPasswordScreen() {
  const [step, setStep]                       = useState('email'); // 'email' | 'reset'
  const [email, setEmail]                     = useState('');
  const [otp, setOtp]                         = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]                 = useState(false);

  const handleSendOtp = async () => {
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert('Error', data.detail || 'Failed to send OTP');
        return;
      }

      Alert.alert('OTP Sent ✅', 'Check your email for the 6-digit OTP.');
      setStep('reset');
    } catch (err) {
      Alert.alert('Network Error', 'Could not reach server. Is backend running?');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otp.trim()) {
      Alert.alert('Required', 'Please enter the OTP.');
      return;
    }

    if (!newPassword.trim()) {
      Alert.alert('Required', 'Please enter a new password.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:        email.trim().toLowerCase(),
          otp:          otp.trim(),
          new_password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert('Error', data.detail || 'Password reset failed. OTP may have expired.');
        return;
      }

      Alert.alert(
        'Success ✅',
        'Password reset successfully! Please login with your new password.',
        [{ text: 'Login', onPress: () => router.replace('/login') }]
      );
    } catch (err) {
      Alert.alert('Network Error', 'Could not reach server. Is backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#2563EB', '#1E40AF']}
        style={styles.topSection}
      >
        <Text style={styles.logo}>🔑</Text>
        <Text style={styles.title}>Medical AI Platform</Text>
        <Text style={styles.subtitle}>
          {step === 'email' ? 'Reset Your Password' : 'Enter OTP & New Password'}
        </Text>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.welcome}>
          {step === 'email' ? 'Forgot Password' : 'Reset Password'}
        </Text>

        {/* ── STEP 1: Email ── */}
        {step === 'email' && (
          <>
            <Text style={styles.hint}>
              Enter your registered email and we'll send you an OTP.
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={22} color="#64748B" />
              <TextInput
                placeholder="Your registered email"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleSendOtp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.buttonText}>Send OTP</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 2: OTP + New Password ── */}
        {step === 'reset' && (
          <>
            <Text style={styles.hint}>
              OTP sent to{' '}
              <Text style={{ color: '#2563EB', fontWeight: '700' }}>
                {email}
              </Text>
              {'\n'}Enter it below along with your new password.
            </Text>

            {/* OTP */}
            <View style={styles.inputContainer}>
              <Ionicons name="key-outline" size={22} color="#64748B" />
              <TextInput
                placeholder="6-digit OTP"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            {/* New Password */}
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={22} color="#64748B" />
              <TextInput
                placeholder="New Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            {/* Confirm Password */}
            <View style={styles.inputContainer}>
              <Ionicons name="shield-checkmark-outline" size={22} color="#64748B" />
              <TextInput
                placeholder="Confirm New Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={styles.buttonText}>Reset Password</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSendOtp}>
              <Text style={styles.resendText}>Didn't get it? Resend OTP</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.push('/login')}>
          <Text style={styles.loginText}>← Back to Login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  topSection: {
    height: 260,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
  },

  logo: {
    fontSize: 70,
    marginBottom: 10,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },

  subtitle: {
    color: '#DBEAFE',
    marginTop: 10,
    fontSize: 15,
  },

  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: -40,
    borderRadius: 24,
    padding: 25,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },

  welcome: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 12,
  },

  hint: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 20,
    lineHeight: 22,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  input: {
    flex: 1,
    paddingVertical: 16,
    marginLeft: 10,
    fontSize: 16,
    color: '#0F172A',
  },

  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },

  resendText: {
    textAlign: 'center',
    marginTop: 16,
    color: '#64748B',
    fontSize: 14,
  },

  loginText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 15,
  },
});