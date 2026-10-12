import api from '@/services/core/apiCampaigns';
import { CAMPAIGNS_API_URL } from '@/config/omnichannel';
import { extractData, extractResponse } from '@/utils/apiHelpers';
import type {
  AudienceContact,
  AudiencePreviewParams,
  BroadcastCampaignData,
  Campaign,
  CampaignMedia,
  CampaignRecipient,
  CampaignRecipientStatus,
  ContactsImportPreview,
  CampaignsResponse,
  CampaignsListParams,
  CampaignCreateData,
  CampaignUpdateData,
  CampaignStatsResponse,
  BulkCampaignActionParams,
  BulkCampaignActionResponse,
} from '@/types/campaigns';

// EVO-1838: envelope unwrapping goes through the shared apiHelpers (extractData /
// extractResponse), like journeyService (EVO-1836). The hand-rolled response.data.data
// had no bare-body fallback and would yield undefined if an endpoint stopped passing
// through the ResponseTransformInterceptor (e.g. @SkipResponseTransform). The two
// methods that return the raw StandardResponse envelope on purpose (object `data`, not
// an array) stay as-is — extractResponse hard-types `data` as an array.
//
// Caveat worth knowing before you rely on it: only extractData has the bare-body
// fallback. extractResponse reads response.data.{success,data,meta} unconditionally,
// so getCampaigns below gains consistency with journeyService but NOT robustness.
// Hardening the shared helper is a follow-up on apiHelpers, not on this service.
class CampaignsService {
  // List campaigns with pagination and filters
  async getCampaigns(params?: CampaignsListParams): Promise<CampaignsResponse> {
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.per_page) queryParams.append('per_page', params.per_page.toString());
    if (params?.sort) queryParams.append('sort', params.sort);
    if (params?.order) queryParams.append('order', params.order);
    if (params?.search) queryParams.append('search', params.search);

    // Array parameters
    if (params?.status) {
      params.status.forEach(s => queryParams.append('status[]', s.toString()));
    }
    if (params?.type) {
      params.type.forEach(t => queryParams.append('type[]', t));
    }
    if (params?.channel_type) {
      params.channel_type.forEach(c => queryParams.append('channel_type[]', c));
    }

    const response = await api.get<CampaignsResponse>(`/campaigns?${queryParams.toString()}`);
    return extractResponse<Campaign>(response) as CampaignsResponse;
  }

  // Get single campaign
  async getCampaign(campaignId: string): Promise<Campaign> {
    const response = await api.get<{ success: boolean; data: Campaign }>(`/campaigns/${campaignId}`);
    return extractData<Campaign>(response);
  }

  // Create campaign
  async createCampaign(data: CampaignCreateData): Promise<Campaign> {
    const response = await api.post<{ success: boolean; data: Campaign }>('/campaigns', data);
    return extractData<Campaign>(response);
  }

  // Evolution Go broadcasts: free-text message, label audience and a send pace.
  async createBroadcast(data: BroadcastCampaignData): Promise<Campaign> {
    const response = await api.post<{ success: boolean; data: Campaign }>('/campaigns', data);
    return extractData<Campaign>(response);
  }

  async updateBroadcast(campaignId: string, data: Partial<BroadcastCampaignData>): Promise<Campaign> {
    const response = await api.patch<{ success: boolean; data: Campaign }>(`/campaigns/${campaignId}`, data);
    return extractData<Campaign>(response);
  }

  // True when the service is only simulating sends (its DRY_RUN setting).
  async isDryRun(): Promise<boolean> {
    const response = await api.get(`${CAMPAIGNS_API_URL}/health`);
    const body = response.data?.data ?? response.data;
    return body?.dry_run === true;
  }

  // Files sent as campaign messages are uploaded first and referenced by id.
  async uploadMedia(file: File): Promise<CampaignMedia> {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post<{ success: boolean; data: CampaignMedia }>('/campaigns/media', form, {
      // Lets the browser set the multipart boundary.
      headers: { 'Content-Type': undefined },
    });
    return extractData<CampaignMedia>(response);
  }

  async getMediaBlob(mediaId: string): Promise<Blob> {
    const response = await api.get<Blob>(`/campaigns/media/${mediaId}`, { responseType: 'blob' });
    return response.data;
  }

  // What importing this contact list would bring in; nothing is saved.
  async previewContactsImport(csv: string): Promise<ContactsImportPreview> {
    const response = await api.post<{ success: boolean; data: ContactsImportPreview }>(
      '/campaigns/import/preview',
      { csv },
    );
    return extractData<ContactsImportPreview>(response);
  }

  // One page of who an audience reaches, before or after the campaign is saved.
  async previewAudience(
    params: AudiencePreviewParams,
  ): Promise<{ contacts: AudienceContact[]; total: number; totalPages: number }> {
    const response = await api.post('/campaigns/audience/preview', params);
    const { data, meta } = extractResponse<AudienceContact>(response);
    return {
      contacts: data ?? [],
      total: meta?.pagination?.total ?? data?.length ?? 0,
      totalPages: meta?.pagination?.total_pages ?? 1,
    };
  }

  async getRecipients(
    campaignId: string,
    status: CampaignRecipientStatus[],
    perPage = 50,
  ): Promise<{ recipients: CampaignRecipient[]; total: number }> {
    const queryParams = new URLSearchParams({ per_page: perPage.toString() });
    status.forEach(s => queryParams.append('status[]', s));
    const response = await api.get(`/campaigns/${campaignId}/recipients?${queryParams.toString()}`);
    const { data, meta } = extractResponse<CampaignRecipient>(response);
    return { recipients: data ?? [], total: meta?.pagination?.total ?? data?.length ?? 0 };
  }

  // Update campaign
  async updateCampaign(campaignId: string, data: CampaignUpdateData): Promise<Campaign> {
    const response = await api.patch<{ success: boolean; data: Campaign }>(`/campaigns/${campaignId}`, data);
    return extractData<Campaign>(response);
  }

  // Delete campaign
  async deleteCampaign(campaignId: string): Promise<void> {
    await api.delete(`/campaigns/${campaignId}`);
  }

  // Campaign Actions
  async scheduleCampaign(campaignId: string, scheduleDate: string): Promise<Campaign> {
    const response = await api.post<{ success: boolean; data: Campaign }>(
      `/campaigns/${campaignId}/schedule`,
      { scheduleTo: scheduleDate }
    );
    return extractData<Campaign>(response);
  }

  async pauseCampaign(campaignId: string): Promise<Campaign> {
    const response = await api.post<{ success: boolean; data: Campaign }>(`/campaigns/${campaignId}/pause`);
    return extractData<Campaign>(response);
  }

  async resumeCampaign(campaignId: string): Promise<Campaign> {
    const response = await api.post<{ success: boolean; data: Campaign }>(`/campaigns/${campaignId}/resume`);
    return extractData<Campaign>(response);
  }

  async stopCampaign(campaignId: string): Promise<Campaign> {
    const response = await api.post<{ success: boolean; data: Campaign }>(`/campaigns/${campaignId}/stop`);
    return extractData<Campaign>(response);
  }

  async executeCampaign(campaignId: string): Promise<{ workflow_id: string; run_id: string; message: string }> {
    const response = await api.post<{
      success: boolean;
      data: { workflow_id: string; run_id: string; message: string };
    }>(`/campaigns/${campaignId}/execute`);
    return extractData<{ workflow_id: string; run_id: string; message: string }>(response);
  }

  // Statistics — returns the raw StandardResponse envelope by contract (object `data`).
  async getCampaignStats(campaignId: string): Promise<CampaignStatsResponse> {
    const response = await api.get<CampaignStatsResponse>(`/campaigns/${campaignId}/stats`);
    return response.data;
  }

  // Bulk Actions — returns the raw StandardResponse envelope by contract (object `data`).
  async bulkAction(params: BulkCampaignActionParams): Promise<BulkCampaignActionResponse> {
    const response = await api.post<BulkCampaignActionResponse>('/campaigns/bulk-action', params);
    return response.data;
  }

  // Duplicate campaign
  async duplicateCampaign(campaignId: string): Promise<Campaign> {
    const response = await api.post<{ success: boolean; data: Campaign }>(`/campaigns/${campaignId}/duplicate`);
    return extractData<Campaign>(response);
  }
}

export const campaignsService = new CampaignsService();
