import type { ReactNode } from 'react';
import { CheckCheck, FileText, Mic } from 'lucide-react';
import type { DraftMessage } from './types';
import { formatFileSize } from './types';

// WhatsApp's own markers: *bold*, _italic_ and ~strikethrough~.
const FORMATTING = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

const formatWhatsappText = (text: string): ReactNode[] =>
  text.split(FORMATTING).map((part, index) => {
    const inner = part.slice(1, -1);
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <strong key={index}>{inner}</strong>;
    if (part.length > 2 && part.startsWith('_') && part.endsWith('_')) return <em key={index}>{inner}</em>;
    if (part.length > 2 && part.startsWith('~') && part.endsWith('~')) return <s key={index}>{inner}</s>;
    return part;
  });

const isEmpty = (message: DraftMessage): boolean =>
  message.type === 'text' ? !message.text.trim() : !message.media;

function Bubble({ message }: { message: DraftMessage }) {
  const caption = message.type !== 'audio' && message.text.trim();
  return (
    <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1.5 text-[13px] leading-snug text-[#111b21] shadow-sm">
      {message.type === 'image' && message.media?.url && (
        <img src={message.media.url} alt={message.media.filename} className="mb-1 max-h-64 w-full rounded-md object-cover" />
      )}
      {message.type === 'audio' && message.media && (
        <div className="flex items-center gap-2 px-1 py-1">
          <Mic className="h-5 w-5 flex-shrink-0 text-[#53bdeb]" />
          {message.media.url ? (
            <audio controls src={message.media.url} className="h-8 w-48" />
          ) : (
            <span className="truncate">{message.media.filename}</span>
          )}
        </div>
      )}
      {(message.type === 'file' || (message.type === 'image' && !message.media?.url)) && message.media && (
        <div className="mb-1 flex items-center gap-2 rounded-md bg-black/5 p-2">
          <FileText className="h-7 w-7 flex-shrink-0 text-[#54656f]" />
          <div className="min-w-0">
            <div className="truncate font-medium">{message.media.filename}</div>
            <div className="text-[11px] text-[#667781]">{formatFileSize(message.media.size)}</div>
          </div>
        </div>
      )}
      {caption && <div className="whitespace-pre-wrap break-words px-1">{formatWhatsappText(message.text)}</div>}
      <div className="flex items-center justify-end gap-1 px-1 text-[10px] text-[#667781]">
        agora <CheckCheck className="h-3 w-3" />
      </div>
    </div>
  );
}

interface MessagePreviewProps {
  messages: DraftMessage[];
  contactName?: string;
}

// How the sequence will look in the contact's WhatsApp. Colors are fixed on
// purpose: it imitates the WhatsApp chat, not the CRM theme.
export default function MessagePreview({ messages, contactName = 'Contato' }: MessagePreviewProps) {
  const visible = messages.filter(message => !isEmpty(message));
  return (
    <div className="overflow-hidden rounded-xl border shadow-sm">
      <div className="flex items-center gap-2 bg-[#008069] px-3 py-2 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-sm font-semibold">
          {contactName.charAt(0).toUpperCase()}
        </div>
        <div className="text-sm font-medium">{contactName}</div>
      </div>
      <div className="flex max-h-[520px] min-h-[260px] flex-col gap-1.5 overflow-y-auto bg-[#efeae2] p-3">
        {visible.length === 0 ? (
          <p className="m-auto text-center text-xs text-[#667781]">
            As mensagens aparecem aqui conforme você escreve.
          </p>
        ) : (
          visible.map(message => <Bubble key={message.key} message={message} />)
        )}
      </div>
    </div>
  );
}
