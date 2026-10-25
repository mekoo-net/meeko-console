import type { AppResult } from '@/shared/api/httpTypes';

import type {
  ActivityInput,
  ActivityListQuery,
  ActivityListResult,
  ActivityImage,
  YomiActivity,
} from '../../model/activity.types';
import type { ActivityMessages } from '../../model/activityMessages';

export interface YomiActivityPort {
  list(query: ActivityListQuery): Promise<AppResult<ActivityListResult>>;
  get(id: string): Promise<AppResult<YomiActivity>>;
  /** 全部语言包 { 语言: { key: 文案 } }；没建的语言给空包。改动随活动 / 奖励的保存提交。 */
  messages(id: string): Promise<AppResult<ActivityMessages>>;
  create(input: ActivityInput): Promise<AppResult<YomiActivity>>;
  update(id: string, input: ActivityInput): Promise<AppResult<YomiActivity>>;
  setPublished(id: string, isPublished: boolean): Promise<AppResult<YomiActivity>>;
  remove(id: string): Promise<AppResult<void>>;
  /** 封面、Hero、素材共用：校验 → 哈希 → 签名 → 直传对象存储 → 确认，返回可落库的 key。 */
  uploadImage(file: File): Promise<AppResult<ActivityImage>>;
}
