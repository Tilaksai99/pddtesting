import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getToken } from './api';

const BASE_URL = 'http://10.33.115.98:8000/api';

const WELCOME_MSG = {
  id:   '0',
  role: 'assistant',
  text: 'Hello! I can help with ICD-10/CPT code lookups, E&M guidelines, billing queries, and interpreting AI results. What do you need?',
};

const QUICK_PROMPTS = [
  { label: 'Code lookup',       text: 'What ICD-10 code is used for chest pain with shortness of breath?' },
  { label: 'E&M coding guide',  text: 'How does E&M coding work for hospital inpatients?' },
  { label: 'CPT modifiers',     text: 'What CPT modifiers are most commonly used in medical billing?' },
  { label: 'Pre-auth tips',     text: 'Which procedures typically require prior authorization from insurance?' },
  { label: 'ICD-10 vs ICD-11', text: 'What are the key differences between ICD-10 and ICD-11 coding?' },
  { label: 'Diabetes codes',    text: 'Explain the ICD-10 coding rules for type 2 diabetes with complications.' },
];

export default function AssistantScreen() {
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const scrollRef               = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText) return;

    const userMsg = { id: Date.now().toString(), role: 'user', text: userText };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const token = await getToken();

      // Build conversation history, skipping the static welcome message (id '0')
      // so the first entry sent to Gemini is always a user turn.
      const history = messages
        .filter((m) => m.id !== '0')
        .map((m) => ({
          role:    m.role === 'assistant' ? 'assistant' : 'user',
          content: m.text,
        }));

      // Append the current user message
      history.push({ role: 'user', content: userText });

      const res = await fetch(`${BASE_URL}/assistant/chat`, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: history }),
      });

      if (res.ok) {
        const data  = await res.json();
        const reply = data.reply || data.message || data.content;
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 1).toString(), role: 'assistant', text: reply },
        ]);
      } else {
        throw new Error(`API error: ${res.status}`);
      }
    } catch (err) {
      console.error('AssistantScreen sendMessage error:', err);
      // Fallback stub so the UI still works without backend
      setMessages((prev) => [
        ...prev,
        {
          id:   (Date.now() + 1).toString(),
          role: 'assistant',
          text: `I'm having trouble reaching the server right now. Please check your connection and try again.\n\nFor urgent code lookups, refer to the ICD-10-CM or AMA CPT codebook.`,
        },
      ]);
    } finally {
      setLoading(false);
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
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>AI Assistant</Text>
          <Text style={styles.headerSub}>Medical coding &amp; billing help</Text>
        </View>
        <TouchableOpacity
          onPress={() => setMessages([WELCOME_MSG])}
          style={styles.clearBtn}
        >
          <Ionicons name="trash-outline" size={20} color="#BFDBFE" />
        </TouchableOpacity>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {loading && (
            <View style={styles.typingRow}>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.typingText}>Thinking…</Text>
              </View>
            </View>
          )}
          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Quick prompts — visible only at the start of a conversation */}
        {messages.length < 3 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickScroll}
            contentContainerStyle={styles.quickContent}
          >
            {QUICK_PROMPTS.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={styles.quickChip}
                onPress={() => sendMessage(p.text)}
                activeOpacity={0.8}
              >
                <Text style={styles.quickChipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.inputField}
            placeholder="Ask about coding, diagnoses, billing…"
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Ionicons name="sparkles-outline" size={14} color="#2563EB" />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{msg.text}</Text>
      </View>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 12,
    color: '#BFDBFE',
    marginTop: 2,
  },
  backBtn:  { padding: 6 },
  clearBtn: { padding: 6 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14 },

  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    gap: 8,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleAI: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 21,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },

  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  typingText: {
    fontSize: 13,
    color: '#94A3B8',
  },

  quickScroll: {
    flexGrow: 0,
    marginBottom: 6,
  },
  quickContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quickChipText: {
    fontSize: 13,
    color: '#1E40AF',
    fontWeight: '600',
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inputField: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});