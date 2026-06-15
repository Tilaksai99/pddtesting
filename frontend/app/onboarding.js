import React from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import { BlurView } from 'expo-blur';

import {
  Ionicons,
} from '@expo/vector-icons';

import * as Animatable from 'react-native-animatable';

import { router } from 'expo-router';

export default function OnboardingScreen() {
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
            paddingBottom: 60,
          }}
        >
          {/* Top Logo */}
          <Animatable.View
            animation="fadeInDown"
            duration={1200}
            style={styles.top}
          >
            <View style={styles.logoCircle}>
              <Ionicons
                name="medical"
                size={42}
                color="#60A5FA"
              />
            </View>

            <Text style={styles.brand}>
              Medical AI
            </Text>
          </Animatable.View>

          {/* Hero */}
          <Animatable.View
            animation="fadeInUp"
            duration={1200}
            delay={300}
            style={styles.hero}
          >
            <Text style={styles.heading}>
              Intelligent Medical
              {'\n'}
              Coding Platform
            </Text>

            <Text style={styles.subtitle}>
              AI-powered diagnosis extraction,
              report analysis, and smart coding
              designed for modern healthcare teams.
            </Text>
          </Animatable.View>

          {/* Floating Main Glass Card */}
          <Animatable.View
            animation="fadeInUp"
            iterationCount="infinite"
            direction="alternate"
            duration={3000}
            delay={700}
            style={styles.centerVisual}
          >
            <BlurView
              intensity={40}
              tint="dark"
              style={styles.glassCard}
            >
              <View style={styles.iconRow}>
                <View style={styles.iconBubble}>
                  <Ionicons
                    name="cloud-upload-outline"
                    size={28}
                    color="#60A5FA"
                  />
                </View>

                <View style={styles.iconBubble}>
                  <Ionicons
                    name="scan-outline"
                    size={28}
                    color="#60A5FA"
                  />
                </View>

                <View style={styles.iconBubble}>
                  <Ionicons
                    name="sparkles-outline"
                    size={28}
                    color="#60A5FA"
                  />
                </View>
              </View>

              <Text style={styles.glassTitle}>
                AI Medical Workflow
              </Text>

              <Text style={styles.glassText}>
                Upload reports and let AI
                extract diagnoses, generate
                coding suggestions, and analyze
                medical data instantly.
              </Text>
            </BlurView>
          </Animatable.View>

          {/* Features */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Platform Features
            </Text>

            <Animatable.View
              animation="fadeInUp"
              delay={1000}
            >
              <BlurView
                intensity={20}
                tint="dark"
                style={styles.featureCard}
              >
                <View style={styles.featureIcon}>
                  <Ionicons
                    name="document-text-outline"
                    size={24}
                    color="#60A5FA"
                  />
                </View>

                <View style={styles.featureContent}>
                  <Text style={styles.featureTitle}>
                    Upload Reports
                  </Text>

                  <Text style={styles.featureDesc}>
                    Upload PDFs and medical files
                    securely from any device.
                  </Text>
                </View>
              </BlurView>
            </Animatable.View>

            <Animatable.View
              animation="fadeInUp"
              delay={1200}
            >
              <BlurView
                intensity={20}
                tint="dark"
                style={styles.featureCard}
              >
                <View style={styles.featureIcon}>
                  <Ionicons
                    name="analytics-outline"
                    size={24}
                    color="#60A5FA"
                  />
                </View>

                <View style={styles.featureContent}>
                  <Text style={styles.featureTitle}>
                    AI Analysis
                  </Text>

                  <Text style={styles.featureDesc}>
                    Extract diagnoses and insights
                    automatically using AI.
                  </Text>
                </View>
              </BlurView>
            </Animatable.View>

            <Animatable.View
              animation="fadeInUp"
              delay={1400}
            >
              <BlurView
                intensity={20}
                tint="dark"
                style={styles.featureCard}
              >
                <View style={styles.featureIcon}>
                  <Ionicons
                    name="medkit-outline"
                    size={24}
                    color="#60A5FA"
                  />
                </View>

                <View style={styles.featureContent}>
                  <Text style={styles.featureTitle}>
                    Smart Coding
                  </Text>

                  <Text style={styles.featureDesc}>
                    Generate intelligent coding
                    suggestions in seconds.
                  </Text>
                </View>
              </BlurView>
            </Animatable.View>
          </View>

          {/* CTA */}
          <Animatable.View
            animation="fadeInUp"
            delay={1600}
            duration={1200}
            style={styles.ctaContainer}
          >
            <BlurView
              intensity={30}
              tint="dark"
              style={styles.ctaCard}
            >
              <Text style={styles.ctaTitle}>
                Ready to transform
                {'\n'}
                medical workflows?
              </Text>

              <Text style={styles.ctaSubtitle}>
                Experience intelligent healthcare
                automation powered by AI.
              </Text>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.button}
                onPress={() =>
                  router.push('/login')
                }
              >
                <LinearGradient
                  colors={['#2563EB', '#3B82F6']}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>
                    Get Started
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </BlurView>

            <Text style={styles.footer}>
              Secure • Intelligent • Fast
            </Text>
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

  top: {
    alignItems: 'center',
    marginTop: 40,
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
  },

  brand: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 18,
  },

  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 40,
  },

  heading: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 54,
  },

  subtitle: {
    color: '#CBD5E1',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 28,
    marginTop: 22,
  },

  centerVisual: {
    paddingHorizontal: 24,
    marginTop: 50,
  },

  glassCard: {
    borderRadius: 30,
    padding: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  iconRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },

  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },

  glassTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },

  glassText: {
    color: '#CBD5E1',
    fontSize: 16,
    lineHeight: 28,
    textAlign: 'center',
    marginTop: 18,
  },

  section: {
    marginTop: 60,
    paddingHorizontal: 24,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 22,
  },

  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 24,
    marginBottom: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  featureContent: {
    marginLeft: 16,
    flex: 1,
  },

  featureTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  featureDesc: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 6,
    lineHeight: 22,
  },

  ctaContainer: {
    marginTop: 60,
    paddingHorizontal: 24,
  },

  ctaCard: {
    borderRadius: 30,
    padding: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  ctaTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 46,
  },

  ctaSubtitle: {
    color: '#CBD5E1',
    textAlign: 'center',
    marginTop: 18,
    fontSize: 16,
    lineHeight: 26,
  },

  button: {
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 30,
  },

  buttonGradient: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  footer: {
    color: '#64748B',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    marginBottom: 40,
  },
});