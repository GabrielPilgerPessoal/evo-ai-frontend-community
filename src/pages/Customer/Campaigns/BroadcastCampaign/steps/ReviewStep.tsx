import { useState, type ReactNode } from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { Input, Label } from '@evoapi/design-system';
import type { AudiencePreviewParams } from '@/types/campaigns';
import type { Inbox } from '@/types/channels/inbox';
import AudienceDialog from '../AudienceDialog';
import ChoiceCard from '../ChoiceCard';
import MessagePreview from '../MessagePreview';
import { PACE_OPTIONS, formatDuration } from '../pacing';
import type { ContactsImport, FormState, UpdateForm } from '../types';

interface ReviewStepProps {
  form: FormState;
  update: UpdateForm;
  inboxes: Inbox[];
  contactsImport: ContactsImport | null;
  typingSeconds: number;
  // Set when editing: a list imported earlier is read from the saved campaign.
  campaignId?: string;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-2 text-sm">
      <div className="w-32 flex-shrink-0 text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}

export default function ReviewStep({ form, update, inboxes, contactsImport, typingSeconds, campaignId }: ReviewStepProps) {
  const [audienceOpen, setAudienceOpen] = useState(false);
  const pace = PACE_OPTIONS.find(option => option.value === form.pace) ?? PACE_OPTIONS[1];
  const inbox = inboxes.find(candidate => candidate.id === form.inboxId);
  const audience =
    form.audience === 'all'
      ? 'Todos os contatos com telefone'
      : form.audience === 'csv'
        ? `Lista importada (${(contactsImport?.count ?? 0).toLocaleString('pt-BR')} contatos)`
        : `Contatos com as etiquetas: ${form.labels.join(', ')}`;

  const audienceParams: AudiencePreviewParams =
    form.audience === 'csv'
      ? contactsImport?.csv
        ? { contacts_csv: contactsImport.csv }
        : { campaign_id: campaignId }
      : { send_to_all: form.audience === 'all', tags: form.audience === 'labels' ? form.labels : [] };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <AudienceDialog
        open={audienceOpen}
        onOpenChange={setAudienceOpen}
        audience={audienceParams}
        description={audience}
      />
      <div className="space-y-8">
        <section className="rounded-lg border px-4 py-2 divide-y">
          <Row label="Nome">{form.name}</Row>
          {form.description.trim() && <Row label="Descrição">{form.description}</Row>}
          <Row label="Canal">{inbox?.name ?? '-'}</Row>
          <Row label="Quem recebe">
            <button
              type="button"
              onClick={() => setAudienceOpen(true)}
              className="inline-flex items-center gap-2 text-left text-primary underline-offset-4 hover:underline"
              title="Ver a lista de contatos"
            >
              <Users className="h-4 w-4 flex-shrink-0" />
              {audience}
            </button>
          </Row>
          <Row label="Ritmo">
            {pace.label} ({pace.min} a {pace.max} s entre um contato e outro)
          </Row>
          <Row label="Mensagens">
            {form.messages.length} por contato, levando de {formatDuration(typingSeconds + pace.min)} a{' '}
            {formatDuration(typingSeconds + pace.max)} cada contato
          </Row>
        </section>

        <section>
          <Label className="text-base mb-2 block font-semibold">Limite diário</Label>
          <Input
            type="number"
            min={1}
            placeholder="Sem limite"
            value={form.dailyLimit}
            onChange={event => update({ dailyLimit: event.target.value })}
            className="h-12 text-base max-w-[200px]"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Máximo de contatos que este número atende por dia, somando todas as campanhas. Ao atingir o
            limite, o disparo para e continua sozinho no dia seguinte.
          </p>
        </section>

        <section>
          <Label className="text-base mb-2 block font-semibold">Quando enviar</Label>
          <div className="grid grid-cols-2 gap-3">
            <ChoiceCard
              selected={form.timing === 'now'}
              onSelect={() => update({ timing: 'now' })}
              title="Disparar agora"
              description="Começa assim que você confirmar"
            />
            <ChoiceCard
              selected={form.timing === 'later'}
              onSelect={() => update({ timing: 'later' })}
              title="Agendar"
              description="Começa na data e hora escolhidas"
            />
          </div>
          {form.timing === 'later' && (
            <Input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={event => update({ scheduledAt: event.target.value })}
              className="mt-3 h-12 text-base"
            />
          )}
        </section>

        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
          <p>
            Disparos em massa por uma conexão não oficial podem levar o WhatsApp a bloquear o número. Prefira
            ritmos mais lentos e envie apenas para contatos que esperam a sua mensagem.
          </p>
        </div>
      </div>

      <div className="lg:sticky lg:top-0 lg:self-start">
        <Label className="text-sm mb-2 block font-semibold">O que cada contato recebe</Label>
        <MessagePreview messages={form.messages} />
      </div>
    </div>
  );
}
