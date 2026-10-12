import type { CampaignMessageType, CampaignPace, ContactsImportPreview } from '@/types/campaigns';

export type Audience = 'all' | 'labels' | 'csv';
export type Timing = 'now' | 'later';

// A message while it is being edited. `url` is a local object URL used only by
// the preview; what is saved is the uploaded file's id.
export interface DraftMessage {
  key: string;
  type: CampaignMessageType;
  text: string;
  media?: { id: string; filename: string; contentType: string; size: number; url?: string };
  durationSeconds?: number;
  uploading?: boolean;
}

// A list chosen in this session, or the one already saved with the campaign.
export interface ContactsImport {
  fileName: string | null;
  csv: string | null;
  count: number;
  preview: ContactsImportPreview | null;
}

export interface FormState {
  name: string;
  description: string;
  inboxId: string;
  audience: Audience;
  labels: string[];
  pace: CampaignPace;
  messages: DraftMessage[];
  dailyLimit: string;
  timing: Timing;
  scheduledAt: string;
}

export type UpdateForm = (changes: Partial<FormState>) => void;

export const MAX_MESSAGES = 10;
export const MAX_MESSAGE_LENGTH = 4096;
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export const MESSAGE_TYPE_LABELS: Record<CampaignMessageType, string> = {
  text: 'Texto',
  image: 'Imagem',
  audio: 'Áudio',
  file: 'Arquivo',
};

let nextKey = 0;
export const newMessage = (type: CampaignMessageType): DraftMessage => ({
  key: `message-${Date.now()}-${nextKey++}`,
  type,
  text: '',
});

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};
