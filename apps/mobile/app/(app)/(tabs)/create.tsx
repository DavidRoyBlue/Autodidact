import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DifficultyLevel, TimeBudget } from '@autodidact/types';
import { useCreateCourse } from '@/api/courses';
import { useToastStore } from '@/stores/toast.store';
import { Screen, Heading, AppText, Input, Button, Chip, Card, Icon, type IconName } from '@/components';

const difficulties: Array<[DifficultyLevel, string]> = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['advanced', 'Advanced'],
];

const budgets: Array<[TimeBudget, string]> = [
  ['30min', '30 min'],
  ['1h', '1 hour'],
  ['4h', '4 hours'],
  ['unrestricted', 'No limit'],
];

const steps: Array<[IconName, string]> = [
  ['git-branch-outline', 'Autodidact designs a course: a short series of focused modules.'],
  ['chatbubbles-outline', 'Each module is a conversation with your teacher.'],
  ['lock-open-outline', 'Show you understand a module to unlock the next one.'],
];

export default function CreateCourseScreen() {
  const router = useRouter();
  const toast = useToastStore((s) => s.addToast);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('beginner');
  const [timeBudget, setTimeBudget] = useState<TimeBudget>('1h');
  const { mutateAsync: createCourse, isPending } = useCreateCourse();

  const handleCreate = async () => {
    try {
      const result = await createCourse({ topic: topic.trim(), difficulty, timeBudget });
      setTopic('');
      if (result.status === 'ready') {
        router.push(`/(app)/courses/${result.courseId}`);
      } else {
        toast('Building your course. It will appear on Home in about 5 minutes.', 'info');
        router.navigate('/(app)/(tabs)');
      }
    } catch {
      toast("Couldn't start the course. Check your connection and try again.", 'error');
    }
  };

  return (
    <Screen scroll>
      <View className="gap-6 pt-2">
        <View className="gap-1">
          <Heading>New course</Heading>
          <AppText variant="muted">What do you want to learn?</AppText>
        </View>

        <Input
          label="Topic"
          placeholder="e.g. Spanish for travel, Rust ownership, Byzantine history"
          helper="Specific topics make better courses."
          value={topic}
          onChangeText={setTopic}
          multiline
          maxLength={200}
        />

        <View className="gap-2">
          <AppText variant="label">Your level</AppText>
          <View className="flex-row flex-wrap gap-2">
            {difficulties.map(([d, label]) => (
              <Chip key={d} label={label} selected={difficulty === d} onPress={() => setDifficulty(d)} />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <AppText variant="label">Time to spend</AppText>
          <View className="flex-row flex-wrap gap-2">
            {budgets.map(([b, label]) => (
              <Chip key={b} label={label} selected={timeBudget === b} onPress={() => setTimeBudget(b)} />
            ))}
          </View>
        </View>

        <Button size="lg" icon="sparkles" loading={isPending} disabled={!topic.trim()} onPress={handleCreate}>
          Build my course
        </Button>

        <Card variant="ghost">
          <AppText variant="label">How it works</AppText>
          <View className="mt-3 gap-3">
            {steps.map(([icon, text]) => (
              <View key={icon} className="flex-row items-center gap-3">
                <Icon name={icon} color="primary" />
                <AppText variant="muted" className="flex-1">{text}</AppText>
              </View>
            ))}
          </View>
        </Card>
      </View>
    </Screen>
  );
}
