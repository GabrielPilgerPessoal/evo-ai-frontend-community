import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Attachment } from '@/types/chat/api';
import { useLanguage } from '@/hooks/useLanguage';

interface MessageStickerProps {
  attachments: Attachment[];
}

// The original file goes first: the thumbnail is a resized still, so an animated
// sticker would stop moving.
const stickerSources = (attachment: Attachment): string[] =>
  [attachment.data_url, attachment.thumb_url].filter(
    (source): source is string => !!source && source.trim() !== '',
  );

const MessageSticker: React.FC<MessageStickerProps> = ({ attachments }) => {
  const { t } = useLanguage('chat');
  const [sourceIndex, setSourceIndex] = useState<Record<string, number>>({});

  return (
    <div className="space-y-1">
      {attachments.map((attachment, index) => {
        const key = String(attachment.id || index);
        const src = stickerSources(attachment)[sourceIndex[key] ?? 0];

        if (!src) {
          return (
            <div
              key={key}
              className="flex h-40 w-40 flex-col items-center justify-center gap-1 rounded-lg bg-muted/40 px-3 text-center text-xs text-muted-foreground"
            >
              <ImageOff className="h-5 w-5" />
              <span>{t('messages.messageSticker.loadError')}</span>
            </div>
          );
        }

        return (
          <img
            key={key}
            src={src}
            alt={t('messages.messageSticker.alt')}
            className="block h-40 w-40 object-contain"
            loading="lazy"
            draggable={false}
            onError={() => setSourceIndex(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))}
          />
        );
      })}
    </div>
  );
};

export default MessageSticker;
