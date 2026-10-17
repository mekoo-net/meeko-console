import { fail, ok, type AppResult } from '@/shared/api/httpTypes';
import { delay } from '@/shared/lib/delay';

import {
  batchDisplayStatus,
  CODE_ALPHABET,
  CODE_LENGTH,
  codePattern,
  formatCode,
  isBatchActive,
  maskCode,
  type AccountRef,
  type AttemptFilter,
  type AttemptResult,
  type BatchFilter,
  type CodeFilter,
  type CreateBatchInput,
  type ExportedCodes,
  type ExportScope,
  ExportScopeLabel,
  type PageQuery,
  type Paged,
  type PlainCodes,
  type RedemptionAttempt,
  type RedemptionBatch,
  type RedemptionCode,
  type RedemptionOverview,
  type UpdateBatchInput,
} from '../../model/redemption.types';
import type { RedemptionPort } from '../ports/redemptionPort';

// 固定种子：刷新页面后数据不变，方便对照演示。
let seed = 20261017;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

const ACCOUNTS: AccountRef[] = Array.from({ length: 28 }, (_, i) => ({
  uid: String(100_000_120 + i * 7),
  email: `user${120 + i * 7}@personal.test`,
  displayName: null,
}));
/** 用户在哪个业务里兑换：决定推荐返利按哪个产品的费率算。 */
const PRODUCTS = ['demux', 'tavern'] as const;

const RESELLER: AccountRef = { uid: '100000903', email: 'cardshop@reseller.test', displayName: null };
const PROBER: AccountRef = { uid: '100000917', email: 'tmp8841@mailbox.test', displayName: null };

const IPS: readonly string[] = [
  '113.87.142.21',
  '223.104.63.18',
  '117.136.12.90',
  '183.14.29.6',
  '36.112.88.4',
  '101.86.201.7',
  '14.155.66.231',
  '42.120.75.12',
  '120.229.18.73',
];
const PROBER_IP = '45.153.160.2';
const RESELLER_IP = '103.152.220.44';

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14; 23127PN0CC) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
] as const;
const SCRIPT_UA = 'python-requests/2.32.3';

// ─── 存储 ───────────────────────────────────────────────────────────

interface CodeRow extends RedemptionCode {
  plain: string;
  prefix: string;
  /** 由批次冻结连带冻结：解冻批次时只恢复这些，单张手工冻结的保持冻结。 */
  frozenByBatch: boolean;
}

const batches: RedemptionBatch[] = [];
const codes: CodeRow[] = [];
const attempts: RedemptionAttempt[] = [];
const plainIndex = new Map<string, CodeRow>();

let codeSeq = 1;
let attemptSeq = 1;
let rechargeSeq = 1;

/** 种子数据用固定序列；页面上新生成的批次用真随机，否则刷新后再生成会得到同一组卡密。 */
function newBody(rng: () => number = rand): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
}

function batchIdFor(createdAt: number): string {
  const d = new Date(createdAt);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seqOfDay = batches.filter((b) => b.id.startsWith(`RB${ymd}`)).length + 1;
  return `RB${ymd}${String(seqOfDay).padStart(3, '0')}`;
}

function rechargeIdFor(at: number): string {
  const d = new Date(at);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `RC${ymd}${String(rechargeSeq++).padStart(9, '0')}`;
}

function recount(b: RedemptionBatch): void {
  const own = codes.filter((c) => c.batchId === b.id);
  b.redeemedCount = own.filter((c) => c.status === 'redeemed').length;
  b.frozenCount = own.filter((c) => c.status === 'frozen').length;
  b.voidedCount = own.filter((c) => c.status === 'voided').length;
}

/** 追加卡密要沿用批次的前缀，批次 DTO 里只有展示用的 codePattern，这里另存一份。 */
const batchPrefix = new Map<string, string>();

function mintCodes(batch: RedemptionBatch, quantity: number, createdAt: number, rng: () => number): CodeRow[] {
  const prefix = batchPrefix.get(batch.id)!;
  const rows: CodeRow[] = [];
  while (rows.length < quantity) {
    const plain = formatCode(prefix, newBody(rng));
    if (plainIndex.has(plain)) continue;
    const row: CodeRow = {
      id: String(codeSeq++),
      batchId: batch.id,
      batchName: batch.name,
      codeMasked: maskCode(plain, prefix),
      faceValue: batch.faceValue,
      status: 'unused',
      redeemed: null,
      failedAttempts: 0,
      createdAtUtc: createdAt,
      plain,
      prefix,
      frozenByBatch: false,
    };
    plainIndex.set(plain, row);
    codes.push(row);
    rows.push(row);
  }
  return rows;
}

function generate(input: CreateBatchInput, createdAt: number, rng: () => number = rand): { batch: RedemptionBatch; rows: CodeRow[] } {
  const batch: RedemptionBatch = {
    id: batchIdFor(createdAt),
    name: input.name.trim(),
    salesChannel: input.salesChannel?.trim() || null,
    purpose: input.purpose,
    faceValue: input.faceValue,
    quantity: input.quantity,
    redeemedCount: 0,
    frozenCount: 0,
    voidedCount: 0,
    status: 'active',
    codePattern: codePattern(input.prefix),
    perAccountLimit: input.perAccountLimit,
    createdAtUtc: createdAt,
  };
  batches.push(batch);
  batchPrefix.set(batch.id, input.prefix);

  const rows = mintCodes(batch, input.quantity, createdAt, rng);
  return { batch, rows };
}

function logAttempt(
  at: number,
  account: AccountRef,
  ip: string,
  ua: string,
  result: AttemptResult,
  row: CodeRow | null,
  rawInput?: string,
): RedemptionAttempt {
  const a: RedemptionAttempt = {
    id: String(attemptSeq++),
    atUtc: at,
    account,
    inputMasked: row ? row.codeMasked : maskCode(rawInput ?? '', 'MK'),
    codeId: row?.id ?? null,
    batchId: row?.batchId ?? null,
    batchName: row?.batchName ?? null,
    result,
    amount: result === 'success' && row ? row.faceValue : null,
    ip,
    userAgent: ua,
    rechargeId: null,
    productCode: pick(PRODUCTS),
  };
  attempts.push(a);
  if (row && result !== 'success') row.failedAttempts += 1;
  return a;
}

function redeem(row: CodeRow, account: AccountRef, ip: string, ua: string, at: number): void {
  const rechargeId = rechargeIdFor(at);
  const attempt = logAttempt(at, account, ip, ua, 'success', row);
  attempt.rechargeId = rechargeId;
  row.status = 'redeemed';
  row.redeemed = { account, atUtc: at, ip, userAgent: ua, rechargeId, productCode: attempt.productCode };
}

// ─── 种子数据 ────────────────────────────────────────────────────────

interface SeedSpec {
  daysAgo: number;
  input: CreateBatchInput;
  redeemRatio: number;
  /** 批次在多少天前停止兑换（冻结 / 作废）；兑换时间不能晚于它。 */
  endsDaysAgo?: number;
}

const seedSpecs: SeedSpec[] = [
  {
    daysAgo: 92,
    input: { name: '30 元充值卡 · 暑期', salesChannel: '发卡网 · Meeko 官方小店', purpose: 'recharge', faceValue: 30, quantity: 100, prefix: 'MK', perAccountLimit: null },
    redeemRatio: 0.63,
    endsDaysAgo: 20,
  },
  {
    daysAgo: 120,
    input: { name: '20 元卡 · 618 活动', salesChannel: '发卡网 · 代理店 A', purpose: 'recharge', faceValue: 20, quantity: 80, prefix: 'MK', perAccountLimit: 2 },
    redeemRatio: 0.55,
  },
  {
    daysAgo: 42,
    input: { name: '100 元充值卡 · 9 月', salesChannel: '发卡网 · Meeko 官方小店', purpose: 'recharge', faceValue: 100, quantity: 200, prefix: 'MK', perAccountLimit: null },
    redeemRatio: 0.92,
  },
  {
    daysAgo: 27,
    input: { name: '50 元充值卡', salesChannel: '发卡网 · Meeko 官方小店', purpose: 'recharge', faceValue: 50, quantity: 300, prefix: 'MK', perAccountLimit: null },
    redeemRatio: 0.4,
  },
  {
    daysAgo: 16,
    input: { name: '10 元体验卡 · 国庆', salesChannel: '国庆社群活动', purpose: 'reward', faceValue: 10, quantity: 500, prefix: 'MK', perAccountLimit: 3 },
    redeemRatio: 0.82,
  },
  {
    daysAgo: 9,
    input: { name: '200 元充值卡', salesChannel: '发卡网 · 代理店 B', purpose: 'recharge', faceValue: 200, quantity: 50, prefix: 'MK', perAccountLimit: null },
    redeemRatio: 0.12,
    endsDaysAgo: 3,
  },
  {
    daysAgo: 2,
    input: { name: '500 元充值卡 · 双十一预售', salesChannel: '发卡网 · Meeko 官方小店', purpose: 'recharge', faceValue: 500, quantity: 20, prefix: 'MK', perAccountLimit: 1 },
    redeemRatio: 0,
  },
];

for (const spec of seedSpecs) {
  const createdAt = NOW - spec.daysAgo * DAY - Math.floor(rand() * 6 * HOUR);
  const { rows } = generate(spec.input, createdAt);

  // 兑换时间往近期偏：卡密售出后通常几天内就会被兑换。
  const endsAt = spec.endsDaysAgo !== undefined ? NOW - spec.endsDaysAgo * DAY : NOW;
  const span = endsAt - createdAt - 4 * HOUR;
  const redeemN = Math.round(rows.length * spec.redeemRatio);
  for (let i = 0; i < redeemN; i++) {
    const at = createdAt + 4 * HOUR + Math.floor(Math.pow(rand(), 0.6) * span);
    const ip = pick(IPS);
    redeem(rows[i]!, pick(ACCOUNTS), ip, pick(UAS), at);
  }
}

// 当天的兑换：保证「今日兑换」不为空。
for (const b of batches.filter((x) => x.name.startsWith('50 元') || x.name.startsWith('10 元'))) {
  const fresh = codes.filter((c) => c.batchId === b.id && c.status === 'unused').slice(0, b.faceValue === 50 ? 4 : 9);
  for (const row of fresh) redeem(row, pick(ACCOUNTS), pick(IPS), pick(UAS), NOW - Math.floor(rand() * 10 * HOUR));
}

// 二次倒卖：已兑换的卡又被另一账户输入。
for (const row of codes.filter((c) => c.status === 'redeemed' && c.batchId === batches[2]!.id).slice(0, 5)) {
  const at = (row.redeemed?.atUtc ?? NOW) + Math.floor(rand() * 2 * DAY);
  if (at < NOW) logAttempt(at, pick(ACCOUNTS), pick(IPS), pick(UAS), 'already_redeemed', row);
}

// 代理店 B 疑似泄露：同一 IP 短时间连兑多张后，批次被冻结。
{
  const b = batches.find((x) => x.salesChannel === '发卡网 · 代理店 B')!;
  const leak = codes.filter((c) => c.batchId === b.id && c.status === 'unused').slice(0, 3);
  leak.forEach((row, i) => redeem(row, RESELLER, RESELLER_IP, UAS[0], NOW - 3 * DAY + i * 90_000));
  const frozenAt = NOW - 3 * DAY + 2 * HOUR;
  for (const row of codes.filter((c) => c.batchId === b.id && c.status === 'unused')) {
    row.status = 'frozen';
    row.frozenByBatch = true;
  }
  b.status = 'frozen';
  const frozenCodes = codes.filter((c) => c.batchId === b.id && c.status === 'frozen');
  for (let i = 0; i < 4; i++) logAttempt(frozenAt + (i + 1) * 3 * HOUR, pick(ACCOUNTS), pick(IPS), pick(UAS), 'frozen', frozenCodes[i]!);
}

// 暑期批次下架：剩余未兑换卡密作废。
{
  const b = batches.find((x) => x.name.startsWith('30 元'))!;
  const at = NOW - 20 * DAY;
  for (const row of codes.filter((c) => c.batchId === b.id && c.status === 'unused')) row.status = 'voided';
  b.status = 'voided';
  const voided = codes.filter((c) => c.batchId === b.id && c.status === 'voided');
  logAttempt(at + 5 * DAY, pick(ACCOUNTS), pick(IPS), pick(UAS), 'voided', voided[0]!);
}

// 体验卡单账户限 3 张：超限被拒。
{
  const b = batches.find((x) => x.name.startsWith('10 元'))!;
  const row = codes.find((c) => c.batchId === b.id && c.status === 'unused')!;
  logAttempt(NOW - 5 * HOUR, ACCOUNTS[3]!, IPS[2]!, UAS[1], 'limit_exceeded', row);
}

// 枚举：脚本在 24h 内连续试错，被频控拦截。
for (let i = 0; i < 46; i++) {
  const at = NOW - 20 * HOUR + i * 4 * 60_000;
  const fake = formatCode('MK', newBody());
  logAttempt(at, PROBER, PROBER_IP, SCRIPT_UA, i < 30 ? 'not_found' : 'rate_limited', null, fake);
}
for (let i = 0; i < 12; i++) {
  const at = NOW - 40 * HOUR + i * 7 * 60_000;
  logAttempt(at, pick(ACCOUNTS), RESELLER_IP, SCRIPT_UA, 'not_found', null, formatCode('MK', newBody()));
}
// 零星手误。
for (let i = 0; i < 6; i++) {
  logAttempt(NOW - Math.floor(rand() * 6 * DAY), pick(ACCOUNTS), pick(IPS), pick(UAS), 'not_found', null, formatCode('MK', newBody()));
}

batches.forEach(recount);

// ─── 查询辅助 ────────────────────────────────────────────────────────

function page<T>(rows: T[], q: PageQuery<unknown>): Paged<T> {
  const start = (q.page - 1) * q.pageSize;
  return { items: rows.slice(start, start + q.pageSize), total: rows.length };
}

/** 明文与内部标记不出 mock 边界，和真实接口一样只给脱敏字段。 */
function toPublic(row: CodeRow): RedemptionCode {
  return structuredClone({
    id: row.id,
    batchId: row.batchId,
    batchName: row.batchName,
    codeMasked: row.codeMasked,
    faceValue: row.faceValue,
    status: row.status,
    redeemed: row.redeemed,
    failedAttempts: row.failedAttempts,
    createdAtUtc: row.createdAtUtc,
  });
}

/** 和后端一样只认字母数字：空格、横线怎么写都行。 */
function normalizeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function plainCodesOf(batch: RedemptionBatch): string[] {
  return codes.filter((c) => c.batchId === batch.id && c.status === 'unused').map((c) => c.plain);
}

// ─── Port 实现 ───────────────────────────────────────────────────────

export class RedemptionMock implements RedemptionPort {
  async overview(): Promise<AppResult<RedemptionOverview>> {
    await delay(120);
    const now = Date.now();
    const startOfDay = new Date(now).setHours(0, 0, 0, 0);
    const live = new Set(batches.filter(isBatchActive).map((b) => b.id));
    const redeemed = codes.filter((c) => c.status === 'redeemed');
    const outstanding = codes.filter((c) => c.status === 'unused' && live.has(c.batchId));
    const today = redeemed.filter((c) => (c.redeemed?.atUtc ?? 0) >= startOfDay);
    const failed24h = attempts.filter((a) => a.result !== 'success' && a.atUtc >= now - DAY);
    const failsByIp = new Map<string, number>();
    for (const a of failed24h) failsByIp.set(a.ip, (failsByIp.get(a.ip) ?? 0) + 1);
    const sum = (rows: RedemptionCode[]) => rows.reduce((s, c) => s + c.faceValue, 0);
    return ok({
      batchCount: batches.length,
      issuedCount: codes.length,
      issuedValue: sum(codes),
      redeemedCount: redeemed.length,
      redeemedValue: sum(redeemed),
      outstandingCount: outstanding.length,
      outstandingValue: sum(outstanding),
      todayRedeemedCount: today.length,
      todayRedeemedValue: sum(today),
      failedAttempts24h: failed24h.length,
      suspiciousIps24h: [...failsByIp.values()].filter((n) => n >= 10).length,
    });
  }

  async listBatches(q: PageQuery<BatchFilter>): Promise<AppResult<Paged<RedemptionBatch>>> {
    await delay(150);
    const f = q.filter;
    const has = (v: string | null, kw?: string) => !kw || (v ?? '').toLowerCase().includes(kw.trim().toLowerCase());
    const rows = batches
      .filter((b) => !f.batchId || b.id.toLowerCase().includes(f.batchId.trim().toLowerCase()))
      .filter((b) => has(b.name, f.name) && has(b.salesChannel, f.salesChannel))
      .filter((b) => !f.fromUtc || b.createdAtUtc >= f.fromUtc)
      .filter((b) => !f.toUtc || b.createdAtUtc <= f.toUtc)
      .filter((b) => !q.filter.status || q.filter.status === 'all' || b.status === q.filter.status)
      .filter((b) => !q.filter.purpose || q.filter.purpose === 'all' || b.purpose === q.filter.purpose)
      .sort((a, b) => b.createdAtUtc - a.createdAtUtc);
    return ok(structuredClone(page(rows, q)));
  }

  async listBatchOptions(): Promise<AppResult<Pick<RedemptionBatch, 'id' | 'name' | 'faceValue'>[]>> {
    await delay(60);
    return ok(
      [...batches]
        .sort((a, b) => b.createdAtUtc - a.createdAtUtc)
        .map(({ id, name, faceValue }) => ({ id, name, faceValue })),
    );
  }

  async createBatch(input: CreateBatchInput): Promise<AppResult<PlainCodes>> {
    await delay(400);
    if (!input.name.trim()) return fail({ code: 'validation', message: '批次名称必填' });
    if (!(input.faceValue > 0)) return fail({ code: 'validation', message: '面值必须大于 0' });
    if (input.quantity < 1 || input.quantity > 10_000) return fail({ code: 'validation', message: '单批数量 1–10000' });
    if (input.prefix && !/^[A-Z0-9]{2,6}$/.test(input.prefix)) return fail({ code: 'validation', message: '前缀须为 2–6 位大写字母或数字' });
    const { batch } = generate(input, Date.now(), Math.random);
    return ok({ batch: structuredClone(batch), codes: plainCodesOf(batch) });
  }

  async updateBatch(batchId: string, input: UpdateBatchInput): Promise<AppResult<PlainCodes>> {
    await delay(300);
    const b = batches.find((x) => x.id === batchId);
    if (!b) return fail({ code: 'not_found', message: `批次 ${batchId} 不存在` });
    if (!input.name.trim()) return fail({ code: 'validation', message: '批次名称必填' });
    if (!Number.isInteger(input.quantity) || input.quantity < b.quantity) return fail({ code: 'validation', message: `数量不能少于 ${b.quantity}` });
    const add = input.quantity - b.quantity;
    if (add > 10_000) return fail({ code: 'validation', message: '单次最多追加 10000 张' });
    if (add > 0 && !isBatchActive(b)) return fail({ code: 'conflict', message: `批次${batchDisplayStatus(b).label}，不能追加` });

    b.name = input.name.trim();
    b.salesChannel = input.salesChannel?.trim() || null;
    b.perAccountLimit = input.perAccountLimit;
    for (const c of codes.filter((x) => x.batchId === b.id)) c.batchName = b.name;

    const rows = add > 0 ? mintCodes(b, add, Date.now(), Math.random) : [];
    b.quantity += add;
    recount(b);
    return ok({ batch: structuredClone(b), codes: rows.map((r) => r.plain) });
  }

  async exportBatch(batchId: string, scope: ExportScope): Promise<AppResult<ExportedCodes>> {
    await delay(300);
    const b = batches.find((x) => x.id === batchId);
    if (!b) return fail({ code: 'not_found', message: `批次 ${batchId} 不存在` });
    if (scope === 'unused' && !isBatchActive(b)) {
      const message = b.status === 'frozen' ? '批次已冻结，解冻后才能导出未兑换卡密' : '批次已作废，没有可导出的未兑换卡密';
      return fail({ code: 'conflict', message });
    }
    const rows = codes.filter((c) => c.batchId === b.id && (scope === 'all' || c.status === scope));
    if (rows.length === 0) return fail({ code: 'conflict', message: `该批次没有${ExportScopeLabel[scope]}卡密` });
    return ok({
      batch: structuredClone(b),
      scope,
      items: rows.map((c) => ({
        code: c.plain,
        status: c.status,
        redeemedAtUtc: c.redeemed?.atUtc ?? null,
        redeemedBy: c.redeemed ? structuredClone(c.redeemed.account) : null,
      })),
    });
  }

  async setBatchFrozen(batchId: string, frozen: boolean): Promise<AppResult<RedemptionBatch>> {
    await delay(200);
    const b = batches.find((x) => x.id === batchId);
    if (!b) return fail({ code: 'not_found', message: `批次 ${batchId} 不存在` });
    if (frozen && b.status !== 'active') return fail({ code: 'conflict', message: '只有生效中的批次可以冻结' });
    if (!frozen && b.status !== 'frozen') return fail({ code: 'conflict', message: '批次未冻结' });
    const own = codes.filter((c) => c.batchId === b.id);
    if (frozen) {
      for (const c of own.filter((x) => x.status === 'unused')) {
        c.status = 'frozen';
        c.frozenByBatch = true;
      }
    } else {
      for (const c of own.filter((x) => x.status === 'frozen' && x.frozenByBatch)) {
        c.status = 'unused';
        c.frozenByBatch = false;
      }
    }
    b.status = frozen ? 'frozen' : 'active';
    recount(b);
    return ok(structuredClone(b));
  }

  async voidBatch(batchId: string): Promise<AppResult<RedemptionBatch>> {
    await delay(250);
    const b = batches.find((x) => x.id === batchId);
    if (!b) return fail({ code: 'not_found', message: `批次 ${batchId} 不存在` });
    if (b.status === 'voided') return fail({ code: 'conflict', message: '批次已作废' });
    for (const c of codes.filter((x) => x.batchId === b.id && (x.status === 'unused' || x.status === 'frozen'))) {
      c.status = 'voided';
      c.frozenByBatch = false;
    }
    b.status = 'voided';
    recount(b);
    return ok(structuredClone(b));
  }

  async listCodes(q: PageQuery<CodeFilter>): Promise<AppResult<Paged<RedemptionCode>>> {
    await delay(150);
    const f = q.filter;
    const input = f.code ? normalizeInput(f.code) : '';
    let rows: CodeRow[];
    if (input.length >= CODE_LENGTH) {
      // 完整卡密：只比末 16 位正文，前缀写不写都认。
      rows = codes.filter((c) => normalizeInput(c.plain).slice(-CODE_LENGTH) === input.slice(-CODE_LENGTH));
    } else if (input.length > 4) {
      return fail({ code: 'validation', message: '请输入完整卡密或末 4 位' });
    } else {
      rows = codes.filter((c) => !input || c.plain.endsWith(input));
    }
    rows = rows
      .filter((c) => !f.batchId || c.batchId === f.batchId)
      .filter((c) => !f.status || f.status === 'all' || c.status === f.status)
      .filter((c) => !f.accountUid || c.redeemed?.account.uid === f.accountUid.trim())
      .filter((c) => !f.accountEmail || (c.redeemed?.account.email ?? '').toLowerCase().includes(f.accountEmail.trim().toLowerCase()))
      .filter((c) => !f.ip || c.redeemed?.ip.startsWith(f.ip.trim()))
      .filter((c) => !f.fromUtc || (c.redeemed?.atUtc ?? 0) >= f.fromUtc)
      .filter((c) => !f.toUtc || (c.redeemed && c.redeemed.atUtc <= f.toUtc))
      .sort((a, b) => (b.redeemed?.atUtc ?? b.createdAtUtc) - (a.redeemed?.atUtc ?? a.createdAtUtc) || Number(b.id) - Number(a.id));
    const p = page(rows, q);
    return ok({ items: p.items.map(toPublic), total: p.total });
  }

  async getCode(codeId: string): Promise<AppResult<RedemptionCode>> {
    await delay(80);
    const c = codes.find((x) => x.id === codeId);
    return c ? ok(toPublic(c)) : fail({ code: 'not_found', message: '卡密不存在' });
  }

  async setCodeFrozen(codeId: string, frozen: boolean): Promise<AppResult<RedemptionCode>> {
    await delay(150);
    const c = codes.find((x) => x.id === codeId);
    if (!c) return fail({ code: 'not_found', message: '卡密不存在' });
    if (frozen && c.status !== 'unused') return fail({ code: 'conflict', message: '只有未兑换的卡密可以冻结' });
    if (!frozen && c.status !== 'frozen') return fail({ code: 'conflict', message: '卡密未冻结' });
    const b = batches.find((x) => x.id === c.batchId)!;
    if (!frozen && b.status === 'frozen') return fail({ code: 'conflict', message: '所属批次已冻结，请先解冻批次' });
    c.status = frozen ? 'frozen' : 'unused';
    c.frozenByBatch = false;
    recount(b);
    return ok(toPublic(c));
  }

  async voidCode(codeId: string): Promise<AppResult<RedemptionCode>> {
    await delay(150);
    const c = codes.find((x) => x.id === codeId);
    if (!c) return fail({ code: 'not_found', message: '卡密不存在' });
    if (c.status !== 'unused' && c.status !== 'frozen') return fail({ code: 'conflict', message: '只有未兑换或已冻结的卡密可以作废' });
    c.status = 'voided';
    c.frozenByBatch = false;
    recount(batches.find((x) => x.id === c.batchId)!);
    return ok(toPublic(c));
  }

  async listAttempts(q: PageQuery<AttemptFilter>): Promise<AppResult<Paged<RedemptionAttempt>>> {
    await delay(150);
    const f = q.filter;
    const rows = attempts
      .filter((a) => {
        if (!f.result || f.result === 'all') return true;
        if (f.result === 'failed') return a.result !== 'success';
        return a.result === f.result;
      })
      .filter((a) => !f.accountUid || a.account.uid === f.accountUid.trim())
      .filter((a) => !f.accountEmail || (a.account.email ?? '').toLowerCase().includes(f.accountEmail.trim().toLowerCase()))
      .filter((a) => !f.ip || a.ip.startsWith(f.ip.trim()))
      .filter((a) => !f.codeId || a.codeId === f.codeId)
      .filter((a) => !f.batchId || a.batchId === f.batchId)
      .filter((a) => !f.productCode || a.productCode === f.productCode)
      .filter((a) => !f.fromUtc || a.atUtc >= f.fromUtc)
      .filter((a) => !f.toUtc || a.atUtc <= f.toUtc)
      .sort((a, b) => b.atUtc - a.atUtc);
    return ok(structuredClone(page(rows, q)));
  }
}
