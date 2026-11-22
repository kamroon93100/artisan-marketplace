import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

const ONBOARDING_COMPLETE_KEY = 'onboarding.complete.v1';
const ONBOARDING_PROGRESS_KEY = 'onboarding.progress.v1';

export type OnboardingStep =
  | 'welcome-splash'
  | 'truly-unique-crafts'
  | 'meet-the-makers'
  | 'craft-passions'
  | 'aesthetic-style-quiz'
  | 'ethical-craft-values'
  | 'exclusive-drops-alerts'
  | 'collective-welcome-pass';

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'welcome-splash',
  'truly-unique-crafts',
  'meet-the-makers',
  'craft-passions',
  'aesthetic-style-quiz',
  'ethical-craft-values',
  'exclusive-drops-alerts',
  'collective-welcome-pass',
];

export type OnboardingProgress = {
  completedSteps: OnboardingStep[];
  currentStepIndex: number;
  selectedInterests: string[];
  selectedValues: string[];
  selectedStyle: string | null;
  notificationPreferences: {
    studioDrops: boolean;
    artisanDMs: boolean;
    liveStreams: boolean;
  };
  couponCopied: boolean;
};

const DEFAULT_PROGRESS: OnboardingProgress = {
  completedSteps: [],
  currentStepIndex: 0,
  selectedInterests: [],
  selectedValues: [],
  selectedStyle: null,
  notificationPreferences: {
    studioDrops: true,
    artisanDMs: true,
    liveStreams: false,
  },
  couponCopied: false,
};

type OnboardingContextValue = {
  progress: OnboardingProgress;
  isCompleted: boolean;
  currentStep: OnboardingStep;
  currentStepIndex: number;
  nextStep: () => void;
  previousStep: () => void;
  completeStep: (step: OnboardingStep, data?: Partial<OnboardingProgress>) => void;
  skipOnboarding: () => void;
  updateProgress: (data: Partial<OnboardingProgress> | ((prev: OnboardingProgress) => Partial<OnboardingProgress>)) => void;
  resetProgress: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<OnboardingProgress>(DEFAULT_PROGRESS);
  const [isLoading, setIsLoading] = useState(true);

  const loadProgress = useCallback(async () => {
    try {
      const [completeRaw, progressRaw] = await Promise.all([
        SecureStore.getItemAsync(ONBOARDING_COMPLETE_KEY),
        SecureStore.getItemAsync(ONBOARDING_PROGRESS_KEY),
      ]);

      if (completeRaw === 'true') {
        setProgress((prev) => ({ ...prev, completedSteps: ONBOARDING_STEPS }));
      } else if (progressRaw) {
        const parsed = JSON.parse(progressRaw) as OnboardingProgress;
        setProgress(parsed);
      }
    } catch {
      // Ignore storage errors, use defaults
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load persisted onboarding state after the callback is initialized.
  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const saveProgress = useCallback(async (newProgress: OnboardingProgress) => {
    try {
      await SecureStore.setItemAsync(
        ONBOARDING_PROGRESS_KEY,
        JSON.stringify(newProgress),
      );
    } catch {
      // Ignore storage errors
    }
  }, []);

  const saveComplete = useCallback(async () => {
    try {
      await SecureStore.setItemAsync(ONBOARDING_COMPLETE_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  }, []);

  const nextStep = useCallback(() => {
    const currentIndex = progress.currentStepIndex;
    const nextIndex = Math.min(
      currentIndex + 1,
      ONBOARDING_STEPS.length - 1,
    );

    const newCompletedSteps = [
      ...new Set([
        ...progress.completedSteps,
        ONBOARDING_STEPS[currentIndex],
      ]),
    ];

    const newProgress = {
      ...progress,
      currentStepIndex: nextIndex,
      completedSteps: newCompletedSteps,
    };

    setProgress(newProgress);
    void saveProgress(newProgress);

    if (nextIndex > currentIndex) {
      router.push(`/(onboarding)/${ONBOARDING_STEPS[nextIndex]}` as any);
    }
  }, [progress, saveProgress]);

  const previousStep = useCallback(() => {
    setProgress((prev) => {
      if (prev.currentStepIndex <= 0) return prev;
      const newProgress = {
        ...prev,
        currentStepIndex: prev.currentStepIndex - 1,
      };
      saveProgress(newProgress);
      return newProgress;
    });
  }, [saveProgress]);

  const completeStep = useCallback(
    (step: OnboardingStep, data?: Partial<OnboardingProgress>) => {
      setProgress((prev) => {
        const stepIndex = ONBOARDING_STEPS.indexOf(step);
        const newCompletedSteps = [
          ...new Set([...prev.completedSteps, step]),
        ];
        const newProgress = {
          ...prev,
          ...data,
          completedSteps: newCompletedSteps,
          currentStepIndex: Math.max(prev.currentStepIndex, stepIndex + 1),
        };
        saveProgress(newProgress);

        // Check if all steps are complete
        if (newCompletedSteps.length === ONBOARDING_STEPS.length) {
          saveComplete();
        }

        return newProgress;
      });
    },
    [saveProgress, saveComplete],
  );

  const skipOnboarding = useCallback(async () => {
    const completed = {
      ...DEFAULT_PROGRESS,
      completedSteps: ONBOARDING_STEPS,
      currentStepIndex: ONBOARDING_STEPS.length - 1,
    };
    setProgress(completed);
    await saveProgress(completed);
    await saveComplete();
  }, [saveProgress, saveComplete]);

  const updateProgress = useCallback(
    (data: Partial<OnboardingProgress> | ((prev: OnboardingProgress) => Partial<OnboardingProgress>)) => {
      setProgress((prev) => {
        const updates = typeof data === 'function' ? data(prev) : data;
        const newProgress = { ...prev, ...updates };
        saveProgress(newProgress);
        return newProgress;
      });
    },
    [saveProgress],
  );

  const resetProgress = useCallback(async () => {
    setProgress(DEFAULT_PROGRESS);
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(ONBOARDING_COMPLETE_KEY),
        SecureStore.deleteItemAsync(ONBOARDING_PROGRESS_KEY),
      ]);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const isCompleted = progress.completedSteps.length === ONBOARDING_STEPS.length;
  const currentStep = ONBOARDING_STEPS[progress.currentStepIndex] ?? ONBOARDING_STEPS[0];

  const value = useMemo<OnboardingContextValue>(
    () => ({
      progress,
      isCompleted,
      currentStep,
      currentStepIndex: progress.currentStepIndex,
      nextStep,
      previousStep,
      completeStep,
      skipOnboarding,
      updateProgress,
      resetProgress,
    }),
    [
      progress,
      isCompleted,
      currentStep,
      nextStep,
      previousStep,
      completeStep,
      skipOnboarding,
      updateProgress,
      resetProgress,
    ],
  );

  if (isLoading) {
    return null;
  }

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}