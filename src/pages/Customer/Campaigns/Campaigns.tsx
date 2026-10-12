import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
} from '@evoapi/design-system';
import { AlertTriangle, Megaphone } from 'lucide-react';
import EmptyState from '@/components/base/EmptyState';

import { usePermissions } from '@/contexts/PermissionsContext';
import { campaignsService } from '@/services/campaigns';
import {
  Campaign,
  CampaignRecipient,
  CampaignStatus,
  CampaignsState,
  CampaignsListParams,
} from '@/types/campaigns';
import CampaignStatusBadge from '@/components/campaigns/CampaignStatusBadge';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';

import {
  CampaignsHeader,
  CampaignsPagination,
  CampaignsTable,
} from '@/components/campaigns';

// How often campaigns that are sending are re-read to show their progress.
const LIVE_REFRESH_MS = 5000;

const PACE_LABELS: Record<string, string> = { fast: 'Rápido', moderate: 'Moderado', slow: 'Lento' };

const audienceLabel = (campaign: Campaign): string => {
  if (campaign.audience === 'csv') {
    return `Lista importada (${(campaign.imported_contacts_count ?? 0).toLocaleString('pt-BR')} contatos)`;
  }
  if (campaign.send_to_all) return 'Todos os contatos';
  return campaign.tags?.length ? `Etiquetas: ${campaign.tags.join(', ')}` : '-';
};

const isEditable = (campaign: Campaign): boolean =>
  campaign.status === CampaignStatus.DRAFT || campaign.status === CampaignStatus.SCHEDULED;

const INITIAL_STATE: CampaignsState = {
  campaigns: [],
  selectedCampaignIds: [],
  meta: {
    pagination: {
      page: 1,
      page_size: DEFAULT_PAGE_SIZE,
      total: 0,
      total_pages: 0,
    },
  },
  loading: {
    list: false,
    create: false,
    update: false,
    delete: false,
    schedule: false,
    pause: false,
    resume: false,
  },
  filters: {
    status: [],
    type: [],
    channel_type: [],
  },
  searchQuery: '',
  sortBy: 'created_at',
  sortOrder: 'desc',
};

export default function Campaigns() {
  const { t } = useLanguage('campaigns');
  const navigate = useNavigate();
  const { can, isReady: permissionsReady } = usePermissions();
  const [state, setState] = useState<CampaignsState>(INITIAL_STATE);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsCampaign, setDetailsCampaign] = useState<Campaign | null>(null);
  const [failedRecipients, setFailedRecipients] = useState<{ recipients: CampaignRecipient[]; total: number }>({
    recipients: [],
    total: 0,
  });
  const [statsCampaign, setStatsCampaign] = useState<Campaign | null>(null);
  const [statsData, setStatsData] = useState<Campaign['stats'] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Load campaigns
  const loadCampaigns = useCallback(
    async (params?: Partial<CampaignsListParams>) => {
      setState(prev => ({ ...prev, loading: { ...prev.loading, list: true } }));

      try {
        const requestParams: CampaignsListParams = {
          page: 1,
          per_page: DEFAULT_PAGE_SIZE,
          sort: 'created_at',
          order: 'desc',
          ...params,
        };

        const response = await campaignsService.getCampaigns(requestParams);

        const total = response.meta?.pagination?.total || 0;
        const pageSize = response.meta?.pagination?.page_size || DEFAULT_PAGE_SIZE;

        setState(prev => ({
          ...prev,
          campaigns: response.data ?? [],
          meta: {
            pagination: {
              page: response.meta?.pagination?.page || 1,
              page_size: pageSize,
              total: total,
              total_pages: response.meta?.pagination?.total_pages || Math.ceil(total / pageSize),
              has_next_page: response.meta?.pagination?.has_next_page,
              has_previous_page: response.meta?.pagination?.has_previous_page,
            },
          },
          loading: { ...prev.loading, list: false },
        }));
      } catch (error) {
        console.error('Error loading campaigns:', error);
        toast.error(t('messages.loadError'));
        setState(prev => ({ ...prev, loading: { ...prev.loading, list: false } }));
      }
    },
    [t],
  );

  // Initial load
  useEffect(() => {
    if (!permissionsReady) {
      return;
    }

    loadCampaigns();
  }, [permissionsReady, loadCampaigns]);

  const [dryRun, setDryRun] = useState(false);
  useEffect(() => {
    campaignsService
      .isDryRun()
      .then(setDryRun)
      .catch(() => setDryRun(false));
  }, []);

  // Keeps the progress of sending campaigns moving without reloading the list.
  const liveCampaigns = useRef<{ list: Campaign[]; details: Campaign | null }>({ list: [], details: null });
  liveCampaigns.current = { list: state.campaigns, details: detailsDialogOpen ? detailsCampaign : null };

  useEffect(() => {
    const timer = setInterval(async () => {
      const { list, details } = liveCampaigns.current;
      const ids = new Set(list.filter(c => c.status === CampaignStatus.SENDING).map(c => c.id));
      if (details?.status === CampaignStatus.SENDING) ids.add(details.id);
      if (ids.size === 0) return;

      const results = await Promise.allSettled([...ids].map(id => campaignsService.getCampaign(id)));
      const fresh = new Map<string, Campaign>();
      results.forEach(result => {
        if (result.status === 'fulfilled') fresh.set(result.value.id, result.value);
      });
      if (fresh.size === 0) return;

      setState(prev => ({ ...prev, campaigns: prev.campaigns.map(c => fresh.get(c.id) ?? c) }));
      setDetailsCampaign(prev => (prev && fresh.get(prev.id)) || prev);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  // Handlers
  const handleSearchChange = (query: string) => {
    setState(prev => ({
      ...prev,
      searchQuery: query,
      meta: {
        ...prev.meta,
        pagination: { ...prev.meta.pagination, page: 1 },
      },
    }));

    // Debounce search
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        loadCampaigns({ page: 1, search: query.trim() });
      } else {
        loadCampaigns({ page: 1 });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const handlePageChange = (page: number) => {
    setState(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        pagination: { ...prev.meta.pagination, page },
      },
    }));

    loadCampaigns({ page });
  };

  const handlePerPageChange = (perPage: number) => {
    setState(prev => ({
      ...prev,
      meta: {
        ...prev.meta,
        pagination: { ...prev.meta.pagination, page_size: perPage, page: 1 },
      },
    }));

    loadCampaigns({ page: 1, per_page: perPage });
  };

  // Campaign actions
  const handleCampaignClick = async (campaign: Campaign) => {
    setDetailsDialogOpen(true);
    setDetailsLoading(true);
    try {
      setFailedRecipients({ recipients: [], total: 0 });
      const fullCampaign = await campaignsService.getCampaign(campaign.id);
      setDetailsCampaign(fullCampaign);
      if (fullCampaign.failed_contacts) {
        setFailedRecipients(await campaignsService.getRecipients(campaign.id, ['failed'], 20));
      }
    } catch (error) {
      console.error('Error loading campaign details:', error);
      setDetailsCampaign(campaign);
      toast.error(t('messages.detailsError'));
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCreateCampaign = () => {
    if (!can('campaigns', 'create')) {
      toast.error(t('messages.noPermissionToCreate'));
      return;
    }
    navigate('/campaigns/new');
  };

  const handleEditCampaign = (campaign: Campaign) => {
    navigate(`/campaigns/${campaign.id}/edit`);
  };

  const handleDeleteCampaign = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  const handlePauseCampaign = async (campaign: Campaign) => {
    try {
      await campaignsService.pauseCampaign(campaign.id);
      toast.success(t('messages.pauseSuccess'));
      loadCampaigns();
    } catch (error) {
      console.error('Error pausing campaign:', error);
      toast.error(t('messages.pauseError'));
    }
  };

  const handleStartCampaign = async (campaign: Campaign) => {
    try {
      if (campaign.status === 3) {
        await campaignsService.resumeCampaign(campaign.id);
      } else {
        await campaignsService.executeCampaign(campaign.id);
      }
      toast.success(t('messages.startSuccess'));
      loadCampaigns();
    } catch (error) {
      console.error('Error starting campaign:', error);
      toast.error(t('messages.startError'));
    }
  };

  const handleDuplicateCampaign = async (campaign: Campaign) => {
    try {
      await campaignsService.duplicateCampaign(campaign.id);
      toast.success(t('messages.duplicateSuccess'));
      loadCampaigns();
    } catch (error) {
      console.error('Error duplicating campaign:', error);
      toast.error(t('messages.duplicateError'));
    }
  };

  const handleViewStats = (campaign: Campaign) => {
    setStatsCampaign(campaign);
    setStatsDialogOpen(true);
    setStatsLoading(true);
    campaignsService
      .getCampaignStats(campaign.id)
      .then(response => {
        setStatsData(response.data);
      })
      .catch(error => {
        console.error('Error loading campaign stats:', error);
        toast.error(t('messages.statsError'));
      })
      .finally(() => setStatsLoading(false));
  };

  const handleStopCampaign = async (campaign: Campaign) => {
    try {
      await campaignsService.stopCampaign(campaign.id);
      toast.success(t('messages.stopSuccess'));
      loadCampaigns();
    } catch (error) {
      console.error('Error stopping campaign:', error);
      toast.error(t('messages.stopError'));
    }
  };

  // Bulk actions
  const handleBulkDelete = () => {
    setBulkDeleteDialogOpen(true);
  };

  const handleBulkPause = async () => {
    if (state.selectedCampaignIds.length === 0) return;

    try {
      await campaignsService.bulkAction({
        campaign_ids: state.selectedCampaignIds,
        action: 'pause',
      });
      toast.success(t('messages.bulkPauseSuccess', { count: state.selectedCampaignIds.length }));
      setState(prev => ({ ...prev, selectedCampaignIds: [] }));
      loadCampaigns();
    } catch (error) {
      console.error('Error bulk pausing campaigns:', error);
      toast.error(t('messages.bulkPauseError'));
    }
  };

  const handleBulkResume = async () => {
    if (state.selectedCampaignIds.length === 0) return;

    try {
      await campaignsService.bulkAction({
        campaign_ids: state.selectedCampaignIds,
        action: 'resume',
      });
      toast.success(t('messages.bulkResumeSuccess', { count: state.selectedCampaignIds.length }));
      setState(prev => ({ ...prev, selectedCampaignIds: [] }));
      loadCampaigns();
    } catch (error) {
      console.error('Error bulk resuming campaigns:', error);
      toast.error(t('messages.bulkResumeError'));
    }
  };

  const handleBulkDuplicate = () => {
    toast.info(t('messages.bulkDuplicateInDevelopment'));
  };

  const handleOpenFilter = () => {
    toast.info(t('messages.filtersInDevelopment'));
  };

  // Confirm delete single campaign
  const confirmDeleteCampaign = async () => {
    if (!campaignToDelete) return;

    setState(prev => ({ ...prev, loading: { ...prev.loading, delete: true } }));

    try {
      await campaignsService.deleteCampaign(campaignToDelete.id);
      toast.success(t('messages.deleteSuccess'));

      loadCampaigns();

      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error(t('messages.deleteError'));
    } finally {
      setState(prev => ({ ...prev, loading: { ...prev.loading, delete: false } }));
    }
  };

  // Confirm bulk delete
  const confirmBulkDelete = async () => {
    if (state.selectedCampaignIds.length === 0) return;

    try {
      await campaignsService.bulkAction({
        campaign_ids: state.selectedCampaignIds,
        action: 'delete',
      });
      toast.success(t('messages.bulkDeleteSuccess', { count: state.selectedCampaignIds.length }));

      setState(prev => ({ ...prev, selectedCampaignIds: [] }));
      loadCampaigns();

      setBulkDeleteDialogOpen(false);
    } catch (error) {
      console.error('Error bulk deleting campaigns:', error);
      toast.error(t('messages.bulkDeleteError'));
    }
  };

  return (
    <div className="h-full flex flex-col p-4">
      {dryRun && (
        <div className="mb-4 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
          <p>
            <strong>Modo de teste ativo:</strong> as campanhas rodam até o fim, mas nenhuma mensagem é
            enviada ao WhatsApp. &quot;Enviadas&quot; aqui significa apenas simuladas.
          </p>
        </div>
      )}
      <CampaignsHeader
        totalCount={state.meta.pagination.total}
        selectedCount={state.selectedCampaignIds.length}
        searchValue={state.searchQuery}
        onSearchChange={handleSearchChange}
        onNewCampaign={handleCreateCampaign}
        onFilter={handleOpenFilter}
        onBulkDelete={handleBulkDelete}
        onBulkPause={handleBulkPause}
        onBulkResume={handleBulkResume}
        onBulkDuplicate={handleBulkDuplicate}
        onClearSelection={() => setState(prev => ({ ...prev, selectedCampaignIds: [] }))}
        activeFilters={[]}
        showFilters={true}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {state.loading.list ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-muted-foreground">{t('loading.campaigns')}</div>
          </div>
        ) : state.campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={t('empty.title')}
            description={t('empty.description')}
            action={{
              label: t('empty.action'),
              onClick: handleCreateCampaign,
            }}
            className="h-full"
          />
        ) : (
          <CampaignsTable
            campaigns={state.campaigns}
            selectedCampaigns={state.campaigns.filter(c => state.selectedCampaignIds.includes(c.id))}
            loading={state.loading.list}
            onSelectionChange={selected =>
              setState(prev => ({ ...prev, selectedCampaignIds: selected.map(c => c.id) }))
            }
            onCampaignClick={handleCampaignClick}
            onEditCampaign={handleEditCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            onStartCampaign={handleStartCampaign}
            onPauseCampaign={handlePauseCampaign}
            onStopCampaign={handleStopCampaign}
            onDuplicateCampaign={handleDuplicateCampaign}
            onViewStats={handleViewStats}
            onCreateCampaign={handleCreateCampaign}
            sortBy={state.sortBy}
            sortOrder={state.sortOrder}
            onSort={column => {
              // Type guard to ensure column is a valid sort key
              type SortKey = 'name' | 'created_at' | 'status' | 'schedule_to';
              const validSortKeys: SortKey[] = ['name', 'created_at', 'status', 'schedule_to'];
              const sortKey = (validSortKeys as string[]).includes(column)
                ? (column as SortKey)
                : 'created_at';

              setState(prev => ({
                ...prev,
                sortBy: sortKey,
                sortOrder: prev.sortBy === sortKey && prev.sortOrder === 'desc' ? 'asc' : 'desc',
              }));
              loadCampaigns({
                sort: sortKey,
                order: state.sortBy === sortKey && state.sortOrder === 'desc' ? 'asc' : 'desc',
              });
            }}
          />
        )}
      </div>

      {/* Pagination */}
      {state.meta.pagination.total > 0 && (
        <CampaignsPagination
          currentPage={state.meta.pagination.page}
          totalPages={state.meta.pagination.total_pages}
          totalCount={state.meta.pagination.total}
          perPage={state.meta.pagination.page_size}
          onPageChange={handlePageChange}
          onPerPageChange={handlePerPageChange}
          loading={state.loading.list}
        />
      )}

      {/* Delete Campaign Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.deleteCampaign.title')}</DialogTitle>
            <DialogDescription>
              {t('dialog.deleteCampaign.description', { name: campaignToDelete?.title })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={state.loading.delete}
            >
              {t('dialog.deleteCampaign.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteCampaign}
              disabled={state.loading.delete}
            >
              {state.loading.delete
                ? t('dialog.deleteCampaign.deleting')
                : t('dialog.deleteCampaign.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.bulkDelete.title')}</DialogTitle>
            <DialogDescription>
              {t('dialog.bulkDelete.description', { count: state.selectedCampaignIds.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteDialogOpen(false)}
            >
              {t('dialog.bulkDelete.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmBulkDelete}>
              {t('dialog.bulkDelete.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.details.title')}</DialogTitle>
            <DialogDescription>
              {detailsCampaign
                ? t('dialog.details.description', { name: detailsCampaign.title })
                : t('dialog.details.descriptionEmpty')}
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <div className="py-6 text-sm text-muted-foreground">{t('dialog.details.loading')}</div>
          ) : detailsCampaign ? (
            <div className="grid grid-cols-1 gap-3 max-h-[65vh] overflow-y-auto pr-1">
              <div className="rounded-md border border-sidebar-border p-3">
                <Label className="text-xs text-muted-foreground">{t('dialog.details.fields.name')}</Label>
                <div className="mt-1 text-sm font-semibold">{detailsCampaign.name}</div>
              </div>
              <div className="rounded-md border border-sidebar-border p-3">
                <Label className="text-xs text-muted-foreground">
                  {t('dialog.details.fields.description')}
                </Label>
                <div className="mt-1 text-sm">{detailsCampaign.description || '-'}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-sidebar-border p-3">
                  <Label className="text-xs text-muted-foreground">
                    {t('dialog.details.fields.status')}
                  </Label>
                  <div className="mt-1">
                    <CampaignStatusBadge status={detailsCampaign.status} />
                  </div>
                </div>
                <div className="rounded-md border border-sidebar-border p-3">
                  <Label className="text-xs text-muted-foreground">Ritmo</Label>
                  <div className="mt-1 text-sm font-semibold">
                    {PACE_LABELS[detailsCampaign.pace ?? ''] ?? '-'}
                    {detailsCampaign.daily_limit ? ` · até ${detailsCampaign.daily_limit}/dia` : ''}
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-sidebar-border p-3">
                <Label className="text-xs text-muted-foreground">Quem recebe</Label>
                <div className="mt-1 text-sm">{audienceLabel(detailsCampaign)}</div>
              </div>
              {(detailsCampaign.notice || detailsCampaign.last_error) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  {detailsCampaign.notice || detailsCampaign.last_error}
                </div>
              )}
              {detailsCampaign.status !== CampaignStatus.DRAFT &&
                detailsCampaign.status !== CampaignStatus.SCHEDULED && (
                  <div className="rounded-md border border-sidebar-border p-3">
                    <Label className="text-xs text-muted-foreground">Progresso</Label>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${detailsCampaign.sent_percentage ?? 0}%` }}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
                      {[
                        ['Enviadas', detailsCampaign.stats?.total_sent],
                        ['Entregues', detailsCampaign.stats?.total_delivered],
                        ['Lidas', detailsCampaign.stats?.total_read],
                        ['Falhas', detailsCampaign.stats?.total_errors],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <div className="text-base font-semibold text-foreground">
                            {(value ?? 0).toLocaleString('pt-BR')}
                          </div>
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      de {(detailsCampaign.contacts_count ?? 0).toLocaleString('pt-BR')} contatos
                    </div>
                  </div>
                )}
              {failedRecipients.recipients.length > 0 && (
                <div className="rounded-md border border-sidebar-border p-3">
                  <Label className="text-xs text-muted-foreground">
                    Falhas ({failedRecipients.total.toLocaleString('pt-BR')})
                  </Label>
                  <ul className="mt-1 max-h-32 overflow-y-auto text-xs space-y-1">
                    {failedRecipients.recipients.map(recipient => (
                      <li key={recipient.id} className="truncate" title={recipient.error ?? ''}>
                        <span className="font-medium">{recipient.name || `+${recipient.number}`}</span>
                        {recipient.error ? `: ${recipient.error}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-md border border-sidebar-border p-3">
                <Label className="text-xs text-muted-foreground">Mensagem</Label>
                <div className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm">
                  {detailsCampaign.message || '-'}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            {detailsCampaign && isEditable(detailsCampaign) && (
              <Button
                onClick={() => {
                  setDetailsDialogOpen(false);
                  navigate(`/campaigns/${detailsCampaign.id}/edit`);
                }}
              >
                {t('dialog.details.edit')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              {t('dialog.details.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={statsDialogOpen}
        onOpenChange={open => {
          setStatsDialogOpen(open);
          if (!open) {
            setStatsCampaign(null);
            setStatsData(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialog.stats.title')}</DialogTitle>
            <DialogDescription>
              {statsCampaign
                ? t('dialog.stats.description', { name: statsCampaign.title })
                : t('dialog.stats.descriptionEmpty')}
            </DialogDescription>
          </DialogHeader>

          {statsLoading ? (
            <div className="py-6 text-sm text-muted-foreground">{t('dialog.stats.loading')}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-sidebar-border p-3">
                <div className="text-xs text-muted-foreground">{t('dialog.stats.totalSent')}</div>
                <div className="mt-1 text-lg font-semibold">
                  {statsData?.total_sent?.toLocaleString() || 0}
                </div>
              </div>
              <div className="rounded-md border border-sidebar-border p-3">
                <div className="text-xs text-muted-foreground">{t('dialog.stats.totalDelivered')}</div>
                <div className="mt-1 text-lg font-semibold">
                  {statsData?.total_delivered?.toLocaleString() || 0}
                </div>
              </div>
              <div className="rounded-md border border-sidebar-border p-3">
                <div className="text-xs text-muted-foreground">{t('dialog.stats.totalRead')}</div>
                <div className="mt-1 text-lg font-semibold">
                  {statsData?.total_read?.toLocaleString() || 0}
                </div>
              </div>
              <div className="rounded-md border border-sidebar-border p-3">
                <div className="text-xs text-muted-foreground">{t('dialog.stats.totalErrors')}</div>
                <div className="mt-1 text-lg font-semibold">
                  {statsData?.total_errors?.toLocaleString() || 0}
                </div>
              </div>
              <div className="rounded-md border border-sidebar-border p-3">
                <div className="text-xs text-muted-foreground">{t('dialog.stats.deliveryRate')}</div>
                <div className="mt-1 text-lg font-semibold">
                  {statsData?.delivery_rate?.toFixed(2) || '0.00'}%
                </div>
              </div>
              <div className="rounded-md border border-sidebar-border p-3">
                <div className="text-xs text-muted-foreground">{t('dialog.stats.readRate')}</div>
                <div className="mt-1 text-lg font-semibold">
                  {statsData?.read_rate?.toFixed(2) || '0.00'}%
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {statsCampaign &&
              (statsCampaign.status === 0 ||
                statsCampaign.status === 1 ||
                statsCampaign.status === 3) && (
                <Button
                  variant="outline"
                  onClick={() => handleStartCampaign(statsCampaign)}
                >
                  {statsCampaign.status === 3
                    ? t('dialog.stats.actions.resume')
                    : t('dialog.stats.actions.start')}
                </Button>
              )}
            {statsCampaign &&
              statsCampaign.status === 2 && (
                <Button
                  variant="outline"
                  onClick={() => handlePauseCampaign(statsCampaign)}
                >
                  {t('dialog.stats.actions.pause')}
                </Button>
              )}
            {statsCampaign &&
              (statsCampaign.status === 0 ||
                statsCampaign.status === 1 ||
                statsCampaign.status === 2 ||
                statsCampaign.status === 3) && (
                <Button
                  variant="destructive"
                  onClick={() => handleStopCampaign(statsCampaign)}
                >
                  {t('dialog.stats.actions.cancel')}
                </Button>
              )}
            <Button variant="outline" onClick={() => setStatsDialogOpen(false)}>
              {t('dialog.stats.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
