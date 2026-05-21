import { watch, type Ref } from 'vue';

import { fail, mapUnknownError, ok } from '@/shared/api/httpTypes';
import { useAsyncState } from '@/shared/composables/useAsyncState';

import type { EmailTemplateDto, EmailTemplateRevisionDto } from '../model/emailTemplate.types';
import { getNoticeAdminPort } from '../services';

export interface EmailTemplateEditorBundle {
  template: EmailTemplateDto | null;
  revisions: EmailTemplateRevisionDto[];
}

export function useEmailTemplateEditor(code: Ref<string>, locale: Ref<string>) {
  const state = useAsyncState<EmailTemplateEditorBundle, []>(async () => {
    try {
      const port = getNoticeAdminPort();
      const t = await port.getEmailTemplate(code.value, locale.value);
      if (!t.success) return t;
      if (!t.data) {
        return fail({ code: 'not_found', message: '模板不存在' });
      }
      const rev = await port.listEmailRevisions(t.data.id);
      if (!rev.success) return rev;
      return ok({ template: t.data, revisions: rev.data });
    } catch (e) {
      return fail(mapUnknownError(e));
    }
  });

  watch(
    [code, locale],
    () => {
      void state.run();
    },
    { immediate: true },
  );

  return state;
}
