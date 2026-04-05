import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/Button';

export default function RegisterScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { registerWithMpin } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [mpin, setMpin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => {
    if (mpin.length >= 6) return 'Strong';
    if (mpin.length >= 4) return 'Good';
    return 'Choose 4-6 digits';
  }, [mpin]);

  const next = () => {
    if (!name || !mobileNumber || !email) {
      setError('Name, mobile number, and email are required.');
      return;
    }
    setError('');
    setStep(2);
  };

  const submit = async () => {
    if (mpin !== confirm) {
      setError('MPIN entries do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await registerWithMpin({ name, mobileNumber, email, mpin });
      router.replace('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#06121f', '#0a1a2d', '#13254a']} style={styles.fill}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={styles.container}>
          <Text style={styles.brand}>Open your edge</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>Create your StockSage mobile account with a 7-day trial and secure MPIN login.</Text>

          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            {step === 1 ? (
              <>
                <Input label="Full Name" value={name} onChangeText={setName} placeholder="Ram Kumar" theme={theme} />
                <Input label="Mobile Number" value={mobileNumber} onChangeText={setMobileNumber} placeholder="+91 9876543210" keyboardType="phone-pad" theme={theme} />
                <Input label="Email ID" value={email} onChangeText={setEmail} placeholder="you@example.com" theme={theme} />
                <View style={[styles.trialCard, { backgroundColor: theme.bgSoft, borderColor: theme.border }]}>
                  <Text style={[styles.trialTitle, { color: theme.textPrimary }]}>7-day premium trial</Text>
                  <Text style={[styles.trialText, { color: theme.textMuted }]}>You’ll get scanner access, AI chat, watchlist sync, and portfolio intelligence from day one.</Text>
                </View>
                {error ? <Text style={[styles.error, { color: theme.red }]}>{error}</Text> : null}
                <Button title="Continue to MPIN" onPress={next} />
              </>
            ) : (
              <>
                <Input label="Create MPIN" value={mpin} onChangeText={setMpin} placeholder="4 to 6 digits" keyboardType="number-pad" secureTextEntry maxLength={6} theme={theme} />
                <Input label="Confirm MPIN" value={confirm} onChangeText={setConfirm} placeholder="Repeat MPIN" keyboardType="number-pad" secureTextEntry maxLength={6} theme={theme} />
                <Text style={[styles.strength, { color: theme.textSecondary }]}>MPIN strength: <Text style={{ color: theme.blue }}>{strength}</Text></Text>
                <Text style={[styles.disclaimer, { color: theme.textMuted }]}>For research and education only. StockSage AI is not SEBI-registered investment advice.</Text>
                {error ? <Text style={[styles.error, { color: theme.red }]}>{error}</Text> : null}
                <Button title="Create Account" loading={loading} onPress={() => void submit()} />
                <Button title="Back" variant="ghost" disabled={loading} onPress={() => setStep(1)} />
              </>
            )}

            <Pressable onPress={() => router.push('/login')}>
              <Text style={[styles.link, { color: theme.textSecondary }]}>
                Already registered? <Text style={{ color: theme.blue }}>Sign in with MPIN</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Input({
  label,
  theme,
  ...props
}: {
  label: string;
  theme: ReturnType<typeof useTheme>['theme'];
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  secureTextEntry?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          {
            color: theme.textPrimary,
            borderColor: theme.border,
            backgroundColor: theme.bgSoft,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    gap: 18,
  },
  brand: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 34,
    color: '#f7f8ff',
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 20,
    gap: 16,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  trialCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  trialTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
  },
  trialText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
  disclaimer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  strength: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  error: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  link: {
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
});
