import { describe, expect, it } from 'vitest';

import { failureToAppError } from '../problemDetails';

/**
 * 平台回的失败里没有给人看的那句话：界面上说什么是按原因码（没有就按种类）从 @platform/contracts 取的。
 * 这里钉住的是「后台看到的字」——平台改了失败的形状、契约包漏了某个原因码的文案，这里先红。
 */
describe('failureToAppError', () => {
  it('ProblemDetails 带原因码：按原因码出文案，原因码留在错误对象上', () => {
    const error = failureToAppError(
      { type: 'https://meeko.dev/errors/GEN_03', title: 'Conflict', status: 409, code: 'GEN_03', reason: 'role_in_use' },
      409,
    );

    expect(error).toEqual({ code: 'conflict', message: '该角色下还有成员，不能删除', reason: 'role_in_use' });
  });

  it('后台各块的失败都说得出具体是什么', () => {
    const say = (reason: string) => failureToAppError({ status: 400, code: 'GEN_01', reason }, 400).message;

    expect(say('staff_invalid_credentials')).toBe('用户名或密码错误');
    expect(say('voucher_template_archived')).toBe('代金券模板已归档');
    expect(say('redemption_batch_frozen')).toBe('批次已冻结，请先解冻');
    expect(say('payment_channel_not_configured')).toBe('请先保存渠道配置再启用');
    expect(say('refund_balance_insufficient')).toBe('可用余额不足');
    expect(say('withdrawal_state_invalid')).toBe('该提现当前状态不能执行此操作');
  });

  it('没有原因码：按种类说一句', () => {
    expect(failureToAppError({ status: 404, code: 'GEN_02' }, 404)).toEqual({ code: 'not_found', message: '内容不存在' });
    expect(failureToAppError({ status: 502, code: 'GEN_07' }, 502).code).toBe('upstream');
  });

  it('后端那句话（detail）即使还在回复里也不读', () => {
    const error = failureToAppError(
      { status: 409, code: 'GEN_03', detail: 'Error connecting to subchannel 10.0.3.17:7031' },
      409,
    );

    expect(error.message).toBe('内容已存在');
    expect(JSON.stringify(error)).not.toContain('10.0.3.17');
  });

  it('带逐字段的错', () => {
    const error = failureToAppError({ status: 400, code: 'GEN_01', errors: { name: ['fields_required'] } }, 400);

    expect(error.code).toBe('validation');
    expect(error.details).toEqual({ name: ['fields_required'] });
  });

  it('信封的失败（HTTP 200，种类在 error.code 里）', () => {
    const error = failureToAppError(
      { success: false, data: null, error: { code: 'GEN_01', reason: 'password_too_short' } },
      200,
    );

    expect(error).toEqual({ code: 'validation', message: '密码至少 8 位', reason: 'password_too_short' });
  });

  it('回复读不出来：只按状态码算种类，不会没字', () => {
    expect(failureToAppError(null, 403)).toEqual({ code: 'forbidden', message: '没有权限' });
    expect(failureToAppError('<html>', 500).message.length).toBeGreaterThan(0);
  });
});
