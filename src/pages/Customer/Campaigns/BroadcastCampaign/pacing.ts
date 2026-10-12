import type { CampaignMessageType, CampaignPace } from '@/types/campaigns';

// Mirrors the rules enforced by the campaigns service; used only to show the
// user what to expect before sending.
export const PACE_OPTIONS: Array<{ value: CampaignPace; label: string; min: number; max: number }> = [
  { value: 'fast', label: 'Rápido', min: 5, max: 15 },
  { value: 'moderate', label: 'Moderado', min: 20, max: 45 },
  { value: 'slow', label: 'Lento', min: 60, max: 120 },
];

const TYPING_SECONDS_PER_CHARACTER = 0.3;
const MAX_TYPING_SECONDS = 230;

export const estimateTypingSeconds = (message: string): number =>
  Math.min(MAX_TYPING_SECONDS, Array.from(message).length * TYPING_SECONDS_PER_CHARACTER);

// Media with little or nothing to type still takes a moment to attach.
const MIN_MEDIA_SECONDS = 3;

// How long "Digitando..." (or "Gravando áudio...") shows before one message.
export const estimateMessageSeconds = (message: {
  type: CampaignMessageType;
  text: string;
  durationSeconds?: number;
}): number => {
  if (message.type === 'audio') {
    return Math.min(MAX_TYPING_SECONDS, Math.max(MIN_MEDIA_SECONDS, message.durationSeconds ?? 0));
  }
  const typed = estimateTypingSeconds(message.text);
  return message.type === 'text' ? typed : Math.max(MIN_MEDIA_SECONDS, typed);
};

export const formatDuration = (seconds: number): string => {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
};
