<script setup lang="ts">
import type { EmailTemplateRevisionDto } from '../model/emailTemplate.types';
import { formatDateTime } from '@/shared/lib/date';

defineProps<{ revisions: readonly EmailTemplateRevisionDto[] }>();
</script>

<template>
  <section class="rev">
    <h3 class="rev__title">修订时间线</h3>
    <el-timeline v-if="revisions.length">
      <el-timeline-item
        v-for="r in revisions"
        :key="r.version"
        :timestamp="formatDateTime(r.changedAtUtc)"
        placement="top"
      >
        <p class="rev__meta">
          <strong>v{{ r.version }}</strong>
          <span v-if="r.changedBy" class="rev__by">{{ r.changedBy }}</span>
          <span v-if="r.changeNote" class="rev__note">{{ r.changeNote }}</span>
        </p>
        <p class="rev__subj">{{ r.subject }}</p>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else description="暂无修订记录" />
  </section>
</template>

<style scoped>
.rev {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.rev__title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}
.rev__meta {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.rev__subj {
  margin: 0;
  font-size: 13px;
}
.rev__by::before {
  content: '· ';
}
.rev__note::before {
  content: '· ';
}
</style>
