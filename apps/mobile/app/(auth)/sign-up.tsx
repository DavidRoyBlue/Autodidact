import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Screen, Heading, AppText, Input, Button } from '@/components';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      return; // inline field error on confirmPassword already communicates this
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }
    setConfirmed(true);
  };

  if (confirmed) {
    return (
      <Screen>
        <View className="flex-1 justify-center gap-4">
          <Heading size="h1">Check your email</Heading>
          <AppText variant="muted" size="lg">
            We sent a confirmation link to {email}. Open it to activate your account.
          </AppText>
          <Button variant="ghost" size="lg" onPress={() => router.replace('/(auth)/sign-in')}>
            Back to sign in
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <View className="gap-2 mb-4">
          <Heading size="h1">Create account</Heading>
          <AppText variant="muted" size="lg">Start learning anything, one module at a time.</AppText>
        </View>

        <View className="gap-3">
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Input
            label="Confirm password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            error={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : undefined}
          />
        </View>

        <Button
          variant="primary"
          size="lg"
          loading={loading}
          disabled={!email.trim() || !password || !confirmPassword}
          onPress={handleSignUp}
        >
          Create account
        </Button>

        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          Already have an account? Sign in
        </Button>
      </View>
    </Screen>
  );
}
