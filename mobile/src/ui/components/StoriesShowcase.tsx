import { X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../themes/ThemeProvider';
import { Button } from './Button';

export interface StoryHighlight {
  id: string;
  title: string;
  subtitle: string;
  image: ImageSourcePropType;
  categoryKeyword?: string;
}

interface StoriesShowcaseProps {
  sectionTitle: string;
  stories: StoryHighlight[];
  ctaLabel: string;
  closeLabel: string;
  onSelectStoryCta: (story: StoryHighlight) => void;
}

export function StoriesShowcase({
  sectionTitle,
  stories,
  ctaLabel,
  closeLabel,
  onSelectStoryCta,
}: StoriesShowcaseProps) {
  const theme = useTheme();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [seenIds, setSeenIds] = useState<Record<string, boolean>>({});

  if (stories.length === 0) return null;

  const activeStory = activeIndex !== null ? stories[activeIndex] ?? null : null;

  const openStory = (idx: number) => {
    const story = stories[idx];
    if (story) {
      setSeenIds((prev) => ({ ...prev, [story.id]: true }));
    }
    setActiveIndex(idx);
  };

  const goNext = () => {
    if (activeIndex === null) return;
    const next = activeIndex + 1;
    if (next < stories.length) {
      openStory(next);
    } else {
      setActiveIndex(null);
    }
  };

  const goPrev = () => {
    if (activeIndex === null) return;
    if (activeIndex > 0) {
      openStory(activeIndex - 1);
    }
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {sectionTitle ? (
        <Text style={[theme.typography.titleSm, { color: theme.colors.text }]}>
          {sectionTitle}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: 2 }}
      >
        {stories.map((story, idx) => {
          const seen = Boolean(seenIds[story.id]);
          return (
            <Pressable
              key={story.id}
              onPress={() => openStory(idx)}
              accessibilityRole="button"
              accessibilityLabel={story.title}
              style={styles.storyItem}
            >
              <View style={styles.ringWrap}>
                <View
                  style={[
                    styles.ring,
                    {
                      borderColor: seen ? theme.colors.border : theme.colors.primary,
                      backgroundColor: theme.colors.surfaceElevated,
                    },
                  ]}
                >
                  <Image source={story.image} style={styles.avatar} resizeMode="cover" />
                </View>
                {!seen ? (
                  <View
                    style={[
                      styles.unreadDot,
                      {
                        backgroundColor: theme.colors.primary,
                        borderColor: theme.colors.background,
                      },
                    ]}
                  />
                ) : null}
              </View>
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.text, fontWeight: '600', textAlign: 'center' },
                ]}
                numberOfLines={1}
              >
                {story.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal
        visible={activeStory !== null}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setActiveIndex(null)}
      >
        {activeStory ? (
          <View style={styles.modalRoot}>
            <Image source={activeStory.image} style={styles.fullImage} resizeMode="cover" />
            <View style={styles.topScrim}>
              <View style={styles.progressRow}>
                {stories.map((s, i) => (
                  <View
                    key={s.id}
                    style={[
                      styles.progressSegment,
                      {
                        backgroundColor:
                          i <= (activeIndex ?? 0)
                            ? '#FFFFFF'
                            : 'rgba(255,255,255,0.35)',
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{activeStory.title}</Text>
                <Pressable
                  onPress={() => setActiveIndex(null)}
                  accessibilityRole="button"
                  accessibilityLabel={closeLabel}
                  style={styles.closeBtn}
                >
                  <X size={22} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>

            <View style={styles.tapZones}>
              <Pressable style={styles.tapHalf} onPress={goPrev} accessibilityLabel="Previous story" />
              <Pressable style={styles.tapHalf} onPress={goNext} accessibilityLabel="Next story" />
            </View>

            <View style={styles.bottomScrim}>
              <Text style={styles.storyCaption}>{activeStory.subtitle}</Text>
              <Button
                label={ctaLabel}
                onPress={() => {
                  const chosen = activeStory;
                  setActiveIndex(null);
                  onSelectStoryCta(chosen);
                }}
              />
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  storyItem: {
    width: 72,
    alignItems: 'center',
    gap: 5,
  },
  ringWrap: {
    position: 'relative',
  },
  ring: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#14110F',
    justifyContent: 'space-between',
  },
  fullImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  topScrim: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: 'rgba(20, 17, 15, 0.55)',
    gap: 12,
    zIndex: 2,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 1,
  },
  tapHalf: {
    flex: 1,
  },
  bottomScrim: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: 'rgba(20, 17, 15, 0.72)',
    gap: 14,
    zIndex: 2,
  },
  storyCaption: {
    color: '#F7F3EB',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
});

