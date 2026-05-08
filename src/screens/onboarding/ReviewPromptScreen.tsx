import React, { useState } from 'react';
import { View, AppState, type AppStateStatus } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { usePlacement } from 'expo-superwall';

import OnboardingLayout from '../../components/OnboardingLayout';
import { useData } from '../../context/DataContext';
import { PLACEMENTS } from '../../services/superwallPlacements';

// iOS posts inactive when SKStoreReviewController presents and active when it dismisses,
// so we can wait for that round-trip before changing screens. If the sheet never appears
// (rate-limited), fall through after a short detect window.
const waitForReviewSheetDismissed = (
  detectMs = 600,
  hardTimeoutMs = 8000
): Promise<void> =>
  new Promise((resolve) => {
    let resolved = false;
    let sawInactive = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      subscription.remove();
      clearTimeout(detectTimer);
      clearTimeout(hardTimer);
      resolve();
    };

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') {
        sawInactive = true;
      } else if (sawInactive) {
        finish();
      }
    });

    const detectTimer = setTimeout(() => {
      if (!sawInactive) finish();
    }, detectMs);

    const hardTimer = setTimeout(finish, hardTimeoutMs);
  });

const ReviewPromptScreen = () => {
  const { completeOnboarding } = useData();
  const { registerPlacement } = usePlacement();
  const [submitting, setSubmitting] = useState(false);

  const finishOnboarding = async () => {
    registerPlacement({ placement: PLACEMENTS.ONBOARDING_COMPLETE });
    await completeOnboarding();
  };

  const handleLeaveReview = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (await StoreReview.isAvailableAsync()) {
        await StoreReview.requestReview();
        await waitForReviewSheetDismissed();
      }
    } catch {}
    await finishOnboarding();
  };

  const handleSkip = async () => {
    if (submitting) return;
    setSubmitting(true);
    await finishOnboarding();
  };

  return (
    <OnboardingLayout
      step={0}
      showProgressBar={false}
      petePose="invite"
      peteSize="lg"
      peteMessage="Mind a quick favor?"
      title="Help spread the word"
      subtitle="If you're enjoying PickleGo, a quick App Store review goes a long way. It only takes a moment."
      ctaTitle="Leave a Review"
      ctaOnPress={handleLeaveReview}
      ctaLoading={submitting}
      secondaryAction={{ title: 'Maybe Later', onPress: handleSkip }}
    >
      <View />
    </OnboardingLayout>
  );
};

export default ReviewPromptScreen;
