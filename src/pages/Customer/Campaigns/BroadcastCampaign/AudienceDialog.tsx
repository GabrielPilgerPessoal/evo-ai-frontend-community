import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@evoapi/design-system';
import { campaignsService } from '@/services/campaigns';
import type { AudienceContact, AudiencePreviewParams } from '@/types/campaigns';

const PAGE_SIZE = 50;

const SKIP_REASONS: Record<NonNullable<AudienceContact['reason']>, string> = {
  no_phone: 'Sem telefone',
  blocked: 'Bloqueado',
  group: 'Grupo',
};

interface AudienceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The audience as chosen in the form; the list is read again whenever it opens.
  audience: AudiencePreviewParams;
  description: string;
}

interface PageState {
  contacts: AudienceContact[];
  total: number;
  totalPages: number;
}

export default function AudienceDialog({ open, onOpenChange, audience, description }: AudienceDialogProps) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<PageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setPage(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    campaignsService
      .previewAudience({ ...audience, page, per_page: PAGE_SIZE })
      .then(result => {
        if (!cancelled) setState(result);
      })
      .catch(requestError => {
        console.error('Error loading campaign audience:', requestError);
        if (cancelled) return;
        setState(null);
        setError(
          requestError?.response?.status === 403
            ? 'Você não tem permissão para ver a lista de contatos.'
            : 'Não foi possível carregar a lista de contatos.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `audience` is rebuilt on every render of the form; it only matters when the dialog opens or the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page]);

  const skipped = state?.contacts.filter(contact => !contact.eligible).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Quem recebe</DialogTitle>
          <DialogDescription>
            {description}
            {state ? ` · ${state.total.toLocaleString('pt-BR')} ${state.total === 1 ? 'contato' : 'contatos'}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="h-[50vh] overflow-y-auto rounded-md border">
          {error ? (
            <p className="p-4 text-sm text-muted-foreground">{error}</p>
          ) : loading && !state ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : state && state.contacts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum contato nesta audiência.</p>
          ) : (
            <table className={`w-full text-sm ${loading ? 'opacity-50' : ''}`}>
              <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Telefone</th>
                </tr>
              </thead>
              <tbody>
                {state?.contacts.map((contact, index) => (
                  <tr key={`${contact.number}-${index}`} className={`border-b last:border-0 ${contact.eligible ? '' : 'text-muted-foreground'}`}>
                    <td className="px-3 py-2">{contact.name || 'Sem nome'}</td>
                    <td className="px-3 py-2">
                      {contact.number ? (contact.number.startsWith('+') ? contact.number : `+${contact.number}`) : '-'}
                      {contact.reason && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-500">
                          {SKIP_REASONS[contact.reason]} · não recebe
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {skipped > 0 && (
          <p className="text-xs text-muted-foreground">
            Contatos sem telefone, bloqueados e grupos aparecem na lista, mas ficam de fora do disparo.
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span>
              Página {page} de {state?.totalPages ?? 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= (state?.totalPages ?? 1)}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
