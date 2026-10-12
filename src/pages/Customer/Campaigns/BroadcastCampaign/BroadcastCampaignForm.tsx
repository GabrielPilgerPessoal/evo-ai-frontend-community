import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Loader2, Send } from 'lucide-react';
import { Button } from '@evoapi/design-system';
import { campaignsService } from '@/services/campaigns';
import InboxesService from '@/services/channels/inboxesService';
import { labelsService } from '@/services/contacts/labelsService';
import type { BroadcastCampaignData, Campaign, CampaignMessage } from '@/types/campaigns';
import type { Inbox } from '@/types/channels/inbox';
import type { Label as ContactLabel } from '@/types/settings';
import WizardProgress from '../NewCampaign/wizard/WizardProgress';
import { estimateMessageSeconds } from './pacing';
import AudienceStep from './steps/AudienceStep';
import BasicsStep from './steps/BasicsStep';
import MessagesStep from './steps/MessagesStep';
import ReviewStep from './steps/ReviewStep';
import { newMessage, type ContactsImport, type DraftMessage, type FormState } from './types';

const STEPS = [
  { id: 1, label: 'Campanha' },
  { id: 2, label: 'Público e ritmo' },
  { id: 3, label: 'Mensagens' },
  { id: 4, label: 'Revisão e envio' },
];

const INITIAL_STATE: FormState = {
  name: '',
  description: '',
  inboxId: '',
  audience: 'labels',
  labels: [],
  pace: 'moderate',
  messages: [newMessage('text')],
  dailyLimit: '',
  timing: 'now',
  scheduledAt: '',
};

const isEvolutionGoInbox = (inbox: Inbox): boolean =>
  inbox.channel_type === 'Channel::Whatsapp' && inbox.provider === 'evolution_go';

// <input type="datetime-local"> works in local time without a timezone suffix.
const toLocalInputValue = (iso: string): string => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const errorMessage = (error: unknown, fallback: string): string => {
  const message = (error as { response?: { data?: { error?: { message?: string } } } }).response?.data
    ?.error?.message;
  return message || fallback;
};

const toDraftMessages = (campaign: Campaign): DraftMessage[] => {
  const saved: CampaignMessage[] = campaign.messages?.length
    ? campaign.messages
    : [{ type: 'text', text: campaign.message || '' }];
  return saved.map(message => ({
    ...newMessage(message.type),
    text: message.text || '',
    durationSeconds: message.duration_seconds,
    media: message.media_id
      ? {
          id: message.media_id,
          filename: message.filename || 'arquivo',
          contentType: message.content_type || '',
          size: message.size || 0,
        }
      : undefined,
  }));
};

const toCampaignMessages = (messages: DraftMessage[]): CampaignMessage[] =>
  messages.map(message => ({
    type: message.type,
    text: message.type !== 'audio' && message.text.trim() ? message.text : undefined,
    media_id: message.media?.id,
    duration_seconds: message.type === 'audio' ? message.durationSeconds : undefined,
  }));

export default function BroadcastCampaignForm() {
  const navigate = useNavigate();
  const { id: campaignId } = useParams<{ id: string }>();
  const isEditMode = !!campaignId;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [labels, setLabels] = useState<ContactLabel[]>([]);
  const [contactsImport, setContactsImport] = useState<ContactsImport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const update = (changes: Partial<FormState>) => setForm(prev => ({ ...prev, ...changes }));
  const updateMessages = (change: (messages: DraftMessage[]) => DraftMessage[]) =>
    setForm(prev => ({ ...prev, messages: change(prev.messages) }));

  // Object URLs made for the preview are released when the form closes.
  const previewUrls = useRef(new Set<string>());
  form.messages.forEach(message => message.media?.url && previewUrls.current.add(message.media.url));
  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [inboxesResponse, labelsResponse, campaign] = await Promise.all([
          // The CRM lists only the inboxes this user was given access to.
          InboxesService.list(),
          labelsService.getLabels({ per_page: 100 }),
          campaignId ? campaignsService.getCampaign(campaignId) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        setInboxes((inboxesResponse.data || []).filter(isEvolutionGoInbox));
        setLabels(labelsResponse.data || []);
        if (!campaign) return;

        const messages = toDraftMessages(campaign);
        setForm({
          name: campaign.name,
          description: campaign.description || '',
          inboxId: campaign.inbox_id || '',
          audience: campaign.audience ?? (campaign.send_to_all ? 'all' : 'labels'),
          labels: campaign.tags || [],
          pace: campaign.pace || 'moderate',
          messages,
          dailyLimit: campaign.daily_limit ? String(campaign.daily_limit) : '',
          timing: campaign.schedule_to ? 'later' : 'now',
          scheduledAt: campaign.schedule_to ? toLocalInputValue(campaign.schedule_to) : '',
        });
        if (campaign.imported_contacts_count) {
          setContactsImport({ fileName: null, csv: null, count: campaign.imported_contacts_count, preview: null });
        }

        // Saved files are fetched so the preview can show them again.
        messages.forEach(async ({ key, media }) => {
          if (!media) return;
          try {
            const url = URL.createObjectURL(await campaignsService.getMediaBlob(media.id));
            if (cancelled) return URL.revokeObjectURL(url);
            // Skipped when the file was replaced while this one was loading.
            updateMessages(current =>
              current.map(item =>
                item.key === key && item.media?.id === media.id ? { ...item, media: { ...media, url } } : item,
              ),
            );
          } catch (error) {
            console.error('Error loading campaign media:', error);
          }
        });
      } catch (error) {
        console.error('Error loading campaign form:', error);
        toast.error('Não foi possível carregar os dados da campanha');
        if (campaignId) navigate('/campaigns');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [campaignId, navigate]);

  const typingSeconds = useMemo(
    () =>
      form.messages
        .filter(message => (message.type === 'text' ? message.text.trim() : message.media))
        .reduce((total, message) => total + estimateMessageSeconds(message), 0),
    [form.messages],
  );

  // What is still missing on a step, or null when it can be left.
  const stepError = (target: number): string | null => {
    if (target === 1) {
      if (form.name.trim().length < 3) return 'Informe um nome com pelo menos 3 caracteres';
      if (!form.inboxId) return 'Escolha o canal que fará o disparo';
      if (!inboxes.some(inbox => inbox.id === form.inboxId)) return 'Você não tem acesso ao canal desta campanha';
    }
    if (target === 2) {
      if (form.audience === 'labels' && form.labels.length === 0) return 'Escolha ao menos uma etiqueta';
      if (form.audience === 'csv' && !contactsImport?.count) return 'Importe a lista de contatos';
    }
    if (target === 3) {
      if (form.messages.some(message => message.uploading)) return 'Aguarde o envio dos arquivos terminar';
      const index = form.messages.findIndex(message =>
        message.type === 'text' ? !message.text.trim() : !message.media,
      );
      if (index !== -1) {
        return form.messages[index].type === 'text'
          ? `Escreva a mensagem ${index + 1} ou remova-a`
          : `Escolha o arquivo da mensagem ${index + 1} ou remova-a`;
      }
    }
    if (target === 4) {
      if (form.dailyLimit && !(Number(form.dailyLimit) >= 1)) return 'O limite diário precisa ser de ao menos 1';
    }
    return null;
  };

  const scheduleError = (): string | null => {
    if (form.timing !== 'later') return null;
    if (!form.scheduledAt) return 'Informe a data e a hora do agendamento';
    if (new Date(form.scheduledAt).getTime() <= Date.now()) return 'O agendamento precisa ser no futuro';
    return null;
  };

  // Stops at the first step with something missing and takes the user there.
  const firstInvalidStep = (upTo: number): boolean => {
    for (let target = 1; target <= upTo; target++) {
      const error = stepError(target);
      if (error) {
        setStep(target);
        toast.error(error);
        return true;
      }
    }
    return false;
  };

  const handleNext = () => {
    const error = stepError(step);
    if (error) toast.error(error);
    else setStep(step + 1);
  };

  const handleSubmit = async (mode: 'draft' | 'launch') => {
    if (firstInvalidStep(STEPS.length)) return;
    const error = mode === 'launch' ? scheduleError() : null;
    if (error) {
      setStep(STEPS.length);
      toast.error(error);
      return;
    }

    setSaving(true);
    try {
      const data: BroadcastCampaignData = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        inbox_id: form.inboxId,
        messages: toCampaignMessages(form.messages),
        pace: form.pace,
        send_to_all: form.audience === 'all',
        tags: form.audience === 'labels' ? form.labels : [],
        daily_limit: form.dailyLimit ? Number(form.dailyLimit) : null,
      };
      // A list saved earlier stays as it is unless another file was picked.
      if (form.audience === 'csv' && contactsImport?.csv) data.contacts_csv = contactsImport.csv;

      const campaign = isEditMode
        ? await campaignsService.updateBroadcast(campaignId, data)
        : await campaignsService.createBroadcast(data);

      if (mode === 'draft') {
        toast.success('Rascunho salvo');
      } else if (form.timing === 'later') {
        await campaignsService.scheduleCampaign(campaign.id, new Date(form.scheduledAt).toISOString());
        toast.success('Campanha agendada');
      } else {
        await campaignsService.executeCampaign(campaign.id);
        toast.success('Campanha iniciada');
      }
      navigate('/campaigns');
    } catch (error) {
      console.error('Error saving campaign:', error);
      toast.error(errorMessage(error, 'Não foi possível salvar a campanha'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  const isLastStep = step === STEPS.length;
  // The steps with a side-by-side preview need the room.
  const wide = step >= 3;

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b bg-background/95 backdrop-blur p-6 flex-shrink-0">
        <h2 className="text-2xl font-semibold">{isEditMode ? 'Editar campanha' : 'Nova campanha'}</h2>
        <p className="text-sm text-muted-foreground">
          Disparo em massa de mensagens de WhatsApp pela Evolution Go
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-6">
          <WizardProgress currentStep={step} totalSteps={STEPS.length} steps={STEPS} />
        </div>
        <div className={`w-full mx-auto pb-6 px-6 ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
          {step === 1 && <BasicsStep form={form} update={update} inboxes={inboxes} />}
          {step === 2 && (
            <AudienceStep
              form={form}
              update={update}
              labels={labels}
              contactsImport={contactsImport}
              onImport={setContactsImport}
              typingSeconds={typingSeconds}
            />
          )}
          {step === 3 && <MessagesStep messages={form.messages} onChange={updateMessages} />}
          {step === 4 && (
            <ReviewStep
              form={form}
              update={update}
              inboxes={inboxes}
              contactsImport={contactsImport}
              typingSeconds={typingSeconds}
              campaignId={campaignId}
            />
          )}
        </div>
      </div>

      <div className="flex justify-between flex-shrink-0 p-6 border-t">
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/campaigns')} disabled={saving}>
            Cancelar
          </Button>
          {step > 1 && (
            <Button variant="outline" className="gap-2" onClick={() => setStep(step - 1)} disabled={saving}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={saving}>
            Salvar rascunho
          </Button>
          {isLastStep ? (
            <Button className="gap-2" onClick={() => handleSubmit('launch')} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {form.timing === 'later' ? 'Agendar campanha' : 'Iniciar disparo'}
            </Button>
          ) : (
            <Button className="gap-2" onClick={handleNext} disabled={saving}>
              Próximo
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
