import axios from 'axios';
import { useAuthStore } from '@/store/authStore';
import { applySetupInterceptor } from '@/services/core/setupInterceptor';
import { CAMPAIGNS_API_URL } from '@/config/omnichannel';

// Dedicated axios instance for the campaigns service (gcen-campaigns), an
// optional add-on deployed next to the CRM. It validates the same session
// token against the auth service, so only the Authorization header is needed.
const campaignsApi = axios.create({
  baseURL: `${CAMPAIGNS_API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

campaignsApi.interceptors.request.use((config) => {
  const authHeader = useAuthStore.getState().getAuthHeader();
  if (authHeader) {
    config.headers.Authorization = authHeader.Authorization;
  }
  return config;
});

campaignsApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearUser();
    }
    return Promise.reject(error);
  }
);

applySetupInterceptor(campaignsApi);

export default campaignsApi;
