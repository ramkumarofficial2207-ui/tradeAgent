import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';

interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const QUICK_PROMPTS = [
  'What are the top scanner-backed setups right now?',
  'Summarize my portfolio risk.',
  'What is the current market regime?',
];

export default function ChatScreen() {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Ask about top setups, grounded market pulse, portfolio risk, or a specific NSE stock.',
    },
  ]);
  const [sending, setSending] = useState(false);

  const canSend = useMemo(() => input.trim().length >= 3 && !sending, [input, sending]);

  const sendMessage = async (message: string) => {
    const clean = message.trim();
    if (clean.length < 3) return;

    const userMessage: ChatItem = { id: `${Date.now()}-u`, role: 'user', text: clean };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const { data } = await api.post('/api/chat', { message: clean });
      setMessages((prev) => [...prev, {
        id: `${Date.now()}-a`,
        role: 'assistant',
        text: data?.reply || data?.message || 'No response returned.',
      }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        id: `${Date.now()}-e`,
        role: 'assistant',
        text: err?.response?.data?.message || err?.message || 'Chat is unavailable right now.',
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: theme.bgPrimary }]}>
        <ScrollView contentContainerStyle={styles.messages}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {QUICK_PROMPTS.map((prompt) => (
              <Pressable key={prompt} onPress={() => void sendMessage(prompt)} style={[styles.chip, { backgroundColor: theme.bgSoft, borderColor: theme.border }]}>
                <Text style={[styles.chipText, { color: theme.textSecondary }]}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.bubble,
                message.role === 'user'
                  ? { alignSelf: 'flex-end', backgroundColor: theme.blue }
                  : { alignSelf: 'flex-start', backgroundColor: theme.bgCard, borderColor: theme.border, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.bubbleText, { color: message.role === 'user' ? '#fff' : theme.textPrimary }]}>{message.text}</Text>
            </View>
          ))}

          {sending ? <Text style={[styles.typing, { color: theme.textMuted }]}>StockSage is thinking…</Text> : null}
        </ScrollView>

        <View style={[styles.composer, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about a stock, scan, or portfolio risk"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.textPrimary }]}
            multiline
          />
          <Button title="Send" disabled={!canSend} onPress={() => void sendMessage(input)} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messages: {
    padding: 18,
    gap: 12,
    paddingBottom: 140,
  },
  chips: {
    gap: 10,
    marginBottom: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 18,
    padding: 14,
  },
  bubbleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  typing: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  composer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    borderWidth: 1,
    borderRadius: 24,
    padding: 12,
    gap: 12,
  },
  input: {
    minHeight: 44,
    maxHeight: 120,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
});
