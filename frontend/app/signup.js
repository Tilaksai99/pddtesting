import React, { useState } from 'react';

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { BlurView } from 'expo-blur';

import {
  Ionicons,
} from '@expo/vector-icons';

import * as Animatable from 'react-native-animatable';

import { router } from 'expo-router';

import { registerUser } from './api';

export default function SignupScreen() {
  const [name, setName]                   = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [selectedRole, setSelectedRole]   = useState('');
  const [loading, setLoading]             = useState(false);

  const roles = [
    'Medical Coder',
    'Medical Trainer',
    'Doctor',
    'Healthcare Staff',
    'Student',
  ];

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please fill in your name, email, and password.');
      return;
    }

    if (password !== retypePassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match. Please try again.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await registerUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role: selectedRole,
      });
      router.replace('/dashboard');
    } catch (err) {
      Alert.alert('Sign Up Failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#020617', '#0F172A', '#111827']}
      style={styles.container}
    >
      {/* Animated Glow Background */}
      <Animatable.View
        animation="pulse"
        iterationCount="infinite"
        duration={5000}
        style={styles.glow1}
      />

      <Animatable.View
        animation="pulse"
        iterationCount="infinite"
        delay={1200}
        duration={6000}
        style={styles.glow2}
      />

      <SafeAreaView style={styles.safe}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 50,
          }}
        >
          {/* Top Section */}
          <Animatable.View
            animation="fadeInDown"
            duration={1200}
            style={styles.topSection}
          >
            <View style={styles.logoCircle}>
              <Ionicons
                name="person-add"
                size={42}
                color="#60A5FA"
              />
            </View>

            <Text style={styles.title}>
              Create Account
            </Text>

            <Text style={styles.subtitle}>
              Join the AI-powered medical
              coding platform.
            </Text>
          </Animatable.View>

          {/* Main Glass Card */}
          <Animatable.View
            animation="fadeInUp"
            duration={1200}
            delay={300}
            style={styles.cardWrapper}
          >
            <BlurView
              intensity={35}
              tint="dark"
              style={styles.card}
            >
              <Text style={styles.welcome}>
                Get Started
              </Text>

              {/* Full Name */}
              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={22}
                  color="#64748B"
                />

                <TextInput
                  placeholder="Full Name"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                />
              </View>

              {/* Email */}
              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={22}
                  color="#64748B"
                />

                <TextInput
                  placeholder="Email"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password */}
              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={22}
                  color="#64748B"
                />

                <TextInput
                  placeholder="Create Password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              {/* Retype Password */}
              <View style={styles.inputContainer}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={22}
                  color="#64748B"
                />

                <TextInput
                  placeholder="Retype Password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  style={styles.input}
                  value={retypePassword}
                  onChangeText={setRetypePassword}
                />
              </View>

              {/* Role Title */}
              <Text style={styles.roleTitle}>
                Select Your Role
              </Text>

              {/* Roles */}
              <View style={styles.rolesContainer}>
                {roles.map((role, index) => (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.85}
                    onPress={() =>
                      setSelectedRole(role)
                    }
                    style={[
                      styles.roleButton,
                      selectedRole === role &&
                        styles.activeRole,
                    ]}
                  >
                    <Text
                      style={[
                        styles.roleText,
                        selectedRole === role &&
                          styles.activeRoleText,
                      ]}
                    >
                      {role}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Signup Button */}
              <TouchableOpacity
                style={[styles.loginButton, loading && { opacity: 0.7 }]}
                activeOpacity={0.85}
                onPress={handleSignup}
                disabled={loading}
              >
                <LinearGradient
                  colors={[
                    '#2563EB',
                    '#3B82F6',
                  ]}
                  style={styles.buttonGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text
                      style={styles.loginButtonText}
                    >
                      Create Account
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Login */}
              <TouchableOpacity
                onPress={() =>
                  router.push('/login')
                }
              >
                <Text style={styles.signupText}>
                  Already have an account?
                  {' '}
                  <Text
                    style={{
                      color: '#60A5FA',
                      fontWeight: '700',
                    }}
                  >
                    Login
                  </Text>
                </Text>
              </TouchableOpacity>
            </BlurView>
          </Animatable.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  safe: {
    flex: 1,
  },

  glow1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#2563EB',
    opacity: 0.15,
    top: -100,
    left: -100,
  },

  glow2: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#3B82F6',
    opacity: 0.12,
    bottom: 50,
    right: -80,
  },

  topSection: {
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },

  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },

  subtitle: {
    color: '#CBD5E1',
    marginTop: 12,
    fontSize: 16,
  },

  cardWrapper: {
    paddingHorizontal: 20,
    marginTop: -20,
  },

  card: {
    borderRadius: 28,
    padding: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  welcome: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 25,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 15,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  input: {
    flex: 1,
    paddingVertical: 18,
    marginLeft: 10,
    fontSize: 16,
    color: '#FFFFFF',
  },

  roleTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 18,
    marginTop: 8,
  },

  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },

  roleButton: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginRight: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  activeRole: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },

  roleText: {
    color: '#CBD5E1',
    fontWeight: '600',
  },

  activeRoleText: {
    color: '#FFFFFF',
  },

  loginButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 10,
  },

  buttonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },

  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  signupText: {
    textAlign: 'center',
    marginTop: 24,
    color: '#CBD5E1',
    fontWeight: '500',
  },
});