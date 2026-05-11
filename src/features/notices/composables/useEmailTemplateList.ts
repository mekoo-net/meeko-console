import { onMounted } from 'vue';

import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { EmailTemplateDto } from '../model/emailTemplate.types';
import { getNoticeAdminPort } from '../services';

export function useEmailTemplateList() {
  const state = useAsyncState<EmailTemplateDto[], []>(
    async () => getNoticeAdminPort().listEmailTemplates(),
    { initial: [] },
  );

  onMounted(() => {
    void state.run();
  });

  return state;
}
