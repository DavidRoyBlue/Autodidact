import { useState } from 'react';
import { Alert } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useCreateCourse } from '@/api/courses';
import { useCourseGeneration } from '@/hooks/useCourseGeneration';
import { Screen, Heading, AppText, Input, Button, Chip } from '@/components';

type Difficulty = 'beginner' | 'intermediate' | 'advanced';
const difficulties: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

const STATUS_LABELS: Record<string, string> = {
  pending:   'Queued...',
  active:    'Generating course...',
  completed: 'Almost ready...',
  failed:    'Failed',
};

export default function HomeScreen() {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner');
  const [pendingCourseId, setPendingCourseId] = useState<string | null>(null);

  const { mutateAsync: createCourse, isPending } = useCreateCourse();
  const { isGenerating, failed, status } = useCourseGeneration(pendingCourseId);

  const handleStart = async () => {
    if (!topic.trim()) return;
    try {
      const result = await createCourse({ topic: topic.trim(), difficulty });
      // Reused/ready courses need no polling — only poll while generating.
      setPendingCourseId(
        result.status === 'ready' || result.reused ? null : result.courseId,
      );
    } catch {
      Alert.alert('Error', 'Failed to start course generation');
    }
  };

  const isLoading = isPending || isGenerating;

  return (
    <Screen scroll>
      <YStack gap="$6" paddingTop="$6">
        <Heading size="h1">What do you want to learn?</Heading>

        <Input
          placeholder="e.g. Rust programming, Byzantine history..."
          value={topic}
          onChangeText={setTopic}
          multiline
          maxLength={200}
        />

        <YStack gap="$2">
          <AppText variant="label">Difficulty</AppText>
          <XStack gap="$3">
            {difficulties.map((d) => (
              <Chip
                key={d}
                label={d.charAt(0).toUpperCase() + d.slice(1)}
                selected={difficulty === d}
                onPress={() => setDifficulty(d)}
              />
            ))}
          </XStack>
        </YStack>

        <Button
          variant="primary"
          size="lg"
          loading={isLoading}
          disabled={!topic.trim()}
          onPress={handleStart}
        >
          {isGenerating ? `Building course — ${STATUS_LABELS[status ?? ''] ?? '...'}` : 'Start Learning'}
        </Button>

        {failed && <AppText variant="error" textAlign="center">Course generation failed. Please try again.</AppText>}
      </YStack>
    </Screen>
  );
}
