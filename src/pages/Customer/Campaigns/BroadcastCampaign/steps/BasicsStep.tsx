import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@evoapi/design-system';
import type { Inbox } from '@/types/channels/inbox';
import type { FormState, UpdateForm } from '../types';

interface BasicsStepProps {
  form: FormState;
  update: UpdateForm;
  inboxes: Inbox[];
}

export default function BasicsStep({ form, update, inboxes }: BasicsStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base mb-2 block font-semibold">
          Nome <span className="text-red-500">*</span>
        </Label>
        <Input
          placeholder="Ex: Promoção de outubro"
          value={form.name}
          onChange={event => update({ name: event.target.value })}
          className="h-12 text-base"
          autoFocus
        />
      </div>
      <div>
        <Label className="text-base mb-2 block font-semibold">Descrição</Label>
        <Textarea
          placeholder="Para que serve esta campanha (opcional)"
          value={form.description}
          onChange={event => update({ description: event.target.value })}
          className="resize-none"
          rows={2}
        />
      </div>
      <div>
        <Label className="text-base mb-2 block font-semibold">
          Canal <span className="text-red-500">*</span>
        </Label>
        {inboxes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você não tem acesso a nenhum canal de WhatsApp conectado pela Evolution Go. Peça acesso a um
            administrador ou crie um em Canais.
          </p>
        ) : (
          <>
            <Select value={form.inboxId} onValueChange={value => update({ inboxId: value })}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Escolha o número que fará o disparo" />
              </SelectTrigger>
              <SelectContent>
                {inboxes.map(inbox => (
                  <SelectItem key={inbox.id} value={inbox.id}>
                    {inbox.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              Aparecem aqui apenas os canais de WhatsApp (Evolution Go) aos quais você tem acesso.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
