import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../../components/ui/Button';

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { loginWithMpin } = useAuth();
  const [mobileNumber, setMobileNumber] = useState('');
  const [mpin, setMpin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (useBiometric = false) => {
    setLoading(true);
    setError('');
    try {
      await loginWithMpin(mobileNumber, mpin, useBiometric);
      router.replace('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#06070a', '#101420', '#18233d']} style={styles.fill}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <View style={styles.container}>
          <Text style={styles.brand}>StockSage AI</Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>Sign in with your mobile number and MPIN.</Text>

          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <LabeledInput
              label="Mobile Number"
              value={mobileNumber}
              onChangeText={setMobileNumber}
              keyboardType="phone-pad"
              placeholder="+91 9876543210"
              themeColor={theme.textPrimary}
              muted={theme.textMuted}
              border={theme.border}
              background={theme.bgSoft}
            />
            <LabeledInput
              label="MPIN"
              value={mpin}
              onChangeText={setMpin}
              keyboardType="number-pad"
              placeholder="4 to 6 digits"
              secureTextEntry
              maxLength={6}
              themeColor={theme.textPrimary}
              muted={theme.textMuted}
              border={theme.border}
              background={theme.bgSoft}
            />

            {error ? <Text style={[styles.error, { color: theme.red }]}>{error}</Text> : null}

            <Button title="Sign In" loading={loading} onPress={() => void submit(false)} />
            <Button title="Use Face ID / Fingerprint" variant="secondary" disabled={loading} onPress={() => void submit(true)} />

            <Pressable onPress={() => router.push('/register')}>
              <Text style={[styles.link, { color: theme.textSecondary }]}>
                New here? <Text style={{ color: theme.blue }}>Create your mobile account</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  secureTextEntry?: boolean;
  maxLength?: number;
  themeColor: string;
  muted: string;
  border: string;
  background: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.label, { color: props.muted }]}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={props.muted}
        keyboardType={props.keyboardType}
        secureTextEntry={props.secureTextEntry}
        maxLength={props.maxLength}
        style={[
          styles.input,
          {
            color: props.themeColor,
            borderColor: props.border,
            backgroundColor: props.background,
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
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 16,
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
  },
  link: {
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  error: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
});
