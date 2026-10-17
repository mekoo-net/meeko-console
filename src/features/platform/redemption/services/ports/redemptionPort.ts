import type { AppResult } from '@/shared/api/httpTypes';

import type {
  AttemptFilter,
  BatchFilter,
  CodeFilter,
  CreateBatchInput,
  ExportedCodes,
  ExportScope,
  PageQuery,
  Paged,
  PlainCodes,
  RedemptionAttempt,
  RedemptionBatch,
  RedemptionCode,
  RedemptionOverview,
  UpdateBatchInput,
} from '../../model/redemption.types';

export interface RedemptionPort {
  overview(): Promise<AppResult<RedemptionOverview>>;

  listBatches(query: PageQuery<BatchFilter>): Promise<AppResult<Paged<RedemptionBatch>>>;
  /** 下拉选项用：全部批次的轻量列表。 */
  listBatchOptions(): Promise<AppResult<Pick<RedemptionBatch, 'id' | 'name' | 'faceValue'>[]>>;
  createBatch(input: CreateBatchInput): Promise<AppResult<PlainCodes>>;
  /** 编辑批次；数量增加时自动生成新卡密，`codes` 只含本次新增的明文（没有追加则为空）。 */
  updateBatch(batchId: string, input: UpdateBatchInput): Promise<AppResult<PlainCodes>>;
  /** 按范围导出明文卡密。只读，不改批次。 */
  exportBatch(batchId: string, scope: ExportScope): Promise<AppResult<ExportedCodes>>;
  /** 冻结要原因，记在连带冻结的卡上；解冻不要。 */
  setBatchFrozen(batchId: string, frozen: boolean, reason?: string): Promise<AppResult<RedemptionBatch>>;
  /** 作废批次内全部未兑换卡密，不可恢复；已兑换的不受影响。 */
  voidBatch(batchId: string, reason: string): Promise<AppResult<RedemptionBatch>>;

  listCodes(query: PageQuery<CodeFilter>): Promise<AppResult<Paged<RedemptionCode>>>;
  getCode(codeId: string): Promise<AppResult<RedemptionCode>>;
  setCodeFrozen(codeId: string, frozen: boolean, reason?: string): Promise<AppResult<RedemptionCode>>;
  voidCode(codeId: string, reason: string): Promise<AppResult<RedemptionCode>>;

  listAttempts(query: PageQuery<AttemptFilter>): Promise<AppResult<Paged<RedemptionAttempt>>>;
}
