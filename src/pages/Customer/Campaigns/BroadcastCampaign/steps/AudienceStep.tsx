import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Clock, FileUp, Loader2 } from 'lucide-react';
import { Badge, Button, Label } from '@evoapi/design-system';
import { campaignsService } from '@/services/campaigns';
import type { ContactsImportPreview } from '@/types/campaigns';
import type { Label as ContactLabel } from '@/types/settings';
import ChoiceCard from '../ChoiceCard';
import { PACE_OPTIONS, formatDuration } from '../pacing';
import type { ContactsImport, FormState, UpdateForm } from '../types';

const MAX_CSV_BYTES = 2 * 1024 * 1024;

interface AudienceStepProps {
  form: FormState;
  update: UpdateForm;
  labels: ContactLabel[];
  contactsImport: ContactsImport | null;
  onImport: (contactsImport: ContactsImport) => void;
  typingSeconds: number;
}

export default function AudienceStep({ form, update, labels, contactsImport, onImport, typingSeconds }: AudienceStepProps) {
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pace = PACE_OPTIONS.find(option => option.value === form.pace) ?? PACE_OPTIONS[1];

  const toggleLabel = (title: string) =>
    update({
      labels: form.labels.includes(title) ? form.labels.filter(label => label !== title) : [...form.labels, title],
    });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      toast.error('O arquivo é grande demais (máximo de 2 MB)');
      return;
    }
    setImporting(true);
    try {
      const csv = await file.text();
      const preview = await campaignsService.previewContactsImport(csv);
      if (preview.valid_count === 0) {
        toast.error('Nenhum telefone válido foi encontrado no arquivo');
        return;
      }
      onImport({ fileName: file.name, csv, count: preview.valid_count, preview });
    } catch (error) {
      console.error('Error reading contact list:', error);
      toast.error('Não foi possível ler o arquivo');
    } finally {
      setImporting(false);
      // Lets the same file be picked again after fixing it.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <Label className="text-base mb-2 block font-semibold">
          Quem recebe <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-3 gap-3">
          <ChoiceCard
            selected={form.audience === 'labels'}
            onSelect={() => update({ audience: 'labels' })}
            title="Contatos com etiqueta"
            description="Quem tiver qualquer uma das etiquetas escolhidas"
          />
          <ChoiceCard
            selected={form.audience === 'all'}
            onSelect={() => update({ audience: 'all' })}
            title="Todos os contatos"
            description="Todos os contatos com telefone cadastrado"
          />
          <ChoiceCard
            selected={form.audience === 'csv'}
            onSelect={() => update({ audience: 'csv' })}
            title="Lista importada"
            description="Um arquivo CSV com nome e telefone"
          />
        </div>

        {form.audience === 'labels' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {labels.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma etiqueta cadastrada. Crie etiquetas e aplique nos contatos para segmentar.
              </p>
            )}
            {labels.map(label => (
              <button key={label.id} type="button" onClick={() => toggleLabel(label.title)}>
                <Badge
                  variant={form.labels.includes(label.title) ? 'default' : 'outline'}
                  className="cursor-pointer px-3 py-1"
                >
                  {label.title}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {form.audience === 'csv' && (
          <div className="mt-3 space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={event => handleFile(event.target.files?.[0])}
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {contactsImport ? 'Trocar arquivo' : 'Escolher arquivo CSV'}
              </Button>
              {contactsImport && (
                <span className="text-sm">
                  <strong>{contactsImport.count.toLocaleString('pt-BR')}</strong>{' '}
                  {contactsImport.count === 1 ? 'contato' : 'contatos'}
                  {contactsImport.fileName ? ` em ${contactsImport.fileName}` : ' já importados'}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Duas colunas: nome e telefone, com DDD. Telefones sem código do país são tratados como do
              Brasil. Quem ainda não for contato é cadastrado no CRM no momento do envio.
            </p>
            {contactsImport?.preview && <ImportSummary preview={contactsImport.preview} />}
          </div>
        )}
      </section>

      <section>
        <Label className="text-base mb-2 block font-semibold">Ritmo de disparo</Label>
        <div className="grid grid-cols-3 gap-3">
          {PACE_OPTIONS.map(option => (
            <ChoiceCard
              key={option.value}
              selected={form.pace === option.value}
              onSelect={() => update({ pace: option.value })}
              title={option.label}
              description={`${option.min} a ${option.max} s entre um contato e outro`}
            />
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 flex-shrink-0" />
          {typingSeconds > 0
            ? `Cada contato leva de ${formatDuration(typingSeconds + pace.min)} a ${formatDuration(typingSeconds + pace.max)} (digitação + intervalo).`
            : 'O intervalo conta além do tempo de "Digitando...", que depende do tamanho das mensagens.'}
        </p>
      </section>
    </div>
  );
}

function ImportSummary({ preview }: { preview: ContactsImportPreview }) {
  return (
    <div className="rounded-lg border p-3 text-sm space-y-2">
      <ul className="text-xs text-muted-foreground">
        {preview.sample.map(contact => (
          <li key={contact.number}>
            {contact.name || 'Sem nome'} · +{contact.number}
          </li>
        ))}
        {preview.valid_count > preview.sample.length && (
          <li>e mais {(preview.valid_count - preview.sample.length).toLocaleString('pt-BR')}</li>
        )}
      </ul>
      {preview.invalid_count + preview.duplicate_count > 0 && (
        <div className="text-xs text-amber-500">
          {preview.duplicate_count > 0 && <p>{preview.duplicate_count} telefone(s) repetido(s) ignorado(s).</p>}
          {preview.invalid_count > 0 && (
            <p>
              {preview.invalid_count} linha(s) com telefone inválido ignorada(s):{' '}
              {preview.invalid
                .slice(0, 5)
                .map(row => `linha ${row.line}${row.value ? ` (${row.value})` : ''}`)
                .join(', ')}
              {preview.invalid_count > 5 ? '…' : ''}
            </p>
          )}
        </div>
      )}
      {preview.truncated && (
        <p className="text-xs text-amber-500">
          O arquivo passa do máximo de 20.000 contatos por campanha; o restante ficou de fora.
        </p>
      )}
    </div>
  );
}
