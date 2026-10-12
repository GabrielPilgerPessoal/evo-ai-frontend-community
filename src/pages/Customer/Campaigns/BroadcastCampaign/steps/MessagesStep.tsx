import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, FileText, Image, Loader2, Mic, Paperclip, Smile, Trash2, Type } from 'lucide-react';
import { Button, Label, Textarea } from '@evoapi/design-system';
import EmojiPicker from '@/components/chat/message-input/EmojiPicker';
import { campaignsService } from '@/services/campaigns';
import type { CampaignMessageType } from '@/types/campaigns';
import MessagePreview from '../MessagePreview';
import { estimateMessageSeconds, formatDuration } from '../pacing';
import {
  MAX_MEDIA_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGES,
  MESSAGE_TYPE_LABELS,
  formatFileSize,
  newMessage,
  type DraftMessage,
} from '../types';

const TYPE_ICONS: Record<CampaignMessageType, typeof Type> = { text: Type, image: Image, audio: Mic, file: FileText };
const ACCEPT: Record<Exclude<CampaignMessageType, 'text'>, string> = {
  image: 'image/*',
  audio: 'audio/*',
  // What the CRM accepts as a document.
  file: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.csv,.txt,.rtf,.json,.zip,.7z,.rar,.tar,image/*,video/*,audio/*',
};

const readAudioDuration = (url: string): Promise<number | undefined> =>
  new Promise(resolve => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? audio.duration : undefined);
    audio.onerror = () => resolve(undefined);
    audio.src = url;
  });

interface MessagesStepProps {
  messages: DraftMessage[];
  onChange: (update: (messages: DraftMessage[]) => DraftMessage[]) => void;
}

export default function MessagesStep({ messages, onChange }: MessagesStepProps) {
  const patch = (key: string, changes: Partial<DraftMessage>) =>
    onChange(current => current.map(message => (message.key === key ? { ...message, ...changes } : message)));

  const move = (index: number, offset: number) =>
    onChange(current => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });

  const remove = (key: string) => onChange(current => current.filter(message => message.key !== key));

  const attach = async (message: DraftMessage, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      toast.error('O arquivo passa do limite de 16 MB do WhatsApp');
      return;
    }
    patch(message.key, { uploading: true });
    try {
      const media = await campaignsService.uploadMedia(file);
      const url = URL.createObjectURL(file);
      patch(message.key, {
        uploading: false,
        media: { id: media.id, filename: media.filename, contentType: media.content_type, size: media.size, url },
        durationSeconds: message.type === 'audio' ? await readAudioDuration(url) : undefined,
      });
    } catch (error) {
      console.error('Error uploading campaign media:', error);
      toast.error('Não foi possível enviar o arquivo');
      patch(message.key, { uploading: false });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cada contato recebe estas mensagens, nesta ordem. Antes de cada uma o WhatsApp mostra
          &quot;Digitando...&quot; (ou &quot;Gravando áudio...&quot;) por um tempo proporcional ao tamanho dela.
        </p>

        {messages.map((message, index) => (
          <MessageEditor
            key={message.key}
            message={message}
            index={index}
            total={messages.length}
            onPatch={changes => patch(message.key, changes)}
            onMove={offset => move(index, offset)}
            onRemove={() => remove(message.key)}
            onAttach={file => attach(message, file)}
          />
        ))}

        {messages.length < MAX_MESSAGES ? (
          <div>
            <Label className="text-sm mb-2 block font-semibold">Adicionar mensagem</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MESSAGE_TYPE_LABELS) as CampaignMessageType[]).map(type => {
                const Icon = TYPE_ICONS[type];
                return (
                  <Button
                    key={type}
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onChange(current => [...current, newMessage(type)])}
                  >
                    <Icon className="h-4 w-4" />
                    {MESSAGE_TYPE_LABELS[type]}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Máximo de {MAX_MESSAGES} mensagens por campanha.</p>
        )}
      </div>

      <div className="lg:sticky lg:top-0 lg:self-start">
        <Label className="text-sm mb-2 block font-semibold">Prévia</Label>
        <MessagePreview messages={messages} />
      </div>
    </div>
  );
}

interface MessageEditorProps {
  message: DraftMessage;
  index: number;
  total: number;
  onPatch: (changes: Partial<DraftMessage>) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  onAttach: (file: File | undefined) => void;
}

function MessageEditor({ message, index, total, onPatch, onMove, onRemove, onAttach }: MessageEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const Icon = TYPE_ICONS[message.type];

  // Puts the emoji where the cursor is and leaves the cursor right after it.
  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? message.text.length;
    const end = textarea?.selectionEnd ?? start;
    const text = message.text.slice(0, start) + emoji + message.text.slice(end);
    if (Array.from(text).length > MAX_MESSAGE_LENGTH) return;
    onPatch({ text });
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };
  const isText = message.type === 'text';
  const hasContent = isText ? !!message.text.trim() : !!message.media;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" />
          {index + 1}. {MESSAGE_TYPE_LABELS[message.type]}
        </div>
        <div className="flex items-center">
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={index === 0} onClick={() => onMove(-1)} title="Mover para cima">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={index === total - 1} onClick={() => onMove(1)} title="Mover para baixo">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-400" disabled={total === 1} onClick={onRemove} title="Remover">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isText && (
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT[message.type as Exclude<CampaignMessageType, 'text'>]}
            className="hidden"
            onChange={event => {
              onAttach(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <Button type="button" variant="outline" className="gap-2" disabled={message.uploading} onClick={() => fileInputRef.current?.click()}>
            {message.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            {message.media ? 'Trocar arquivo' : 'Escolher arquivo'}
          </Button>
          {message.media && (
            <span className="min-w-0 truncate text-sm">
              {message.media.filename} · {formatFileSize(message.media.size)}
            </span>
          )}
        </div>
      )}

      {message.type !== 'audio' && (
        <Textarea
          ref={textareaRef}
          placeholder={isText ? 'Escreva a mensagem' : 'Legenda (opcional)'}
          value={message.text}
          onChange={event => onPatch({ text: event.target.value })}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={isText ? 5 : 2}
        />
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {message.type !== 'audio' && (
          <span className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setShowEmojiPicker(open => !open)}
              title="Inserir emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>
            <EmojiPicker
              isOpen={showEmojiPicker}
              onEmojiSelect={insertEmoji}
              onClose={() => setShowEmojiPicker(false)}
              placement="bottom"
            />
          </span>
        )}
        <span className="flex-1">
          {hasContent
            ? `${message.type === 'audio' ? '"Gravando áudio..."' : '"Digitando..."'} por ${formatDuration(estimateMessageSeconds(message))} antes do envio`
            : isText
              ? 'Quanto maior a mensagem, mais tempo o "Digitando..." aparece'
              : 'Até 16 MB'}
        </span>
        {message.type !== 'audio' && (
          <span>
            {Array.from(message.text).length}/{MAX_MESSAGE_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}
