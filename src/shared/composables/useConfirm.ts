import { ElMessageBox } from 'element-plus';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info';
}

/**
 * 危险操作统一二次确认。所有删除 / 解绑 / 撤销订阅 / 高金额充值都必须经过此处。
 */
export async function confirmDanger(opts: ConfirmOptions): Promise<boolean> {
  try {
    await ElMessageBox.confirm(opts.message, opts.title ?? '请确认', {
      confirmButtonText: opts.confirmText ?? '确认',
      cancelButtonText: opts.cancelText ?? '取消',
      type: opts.type === 'info' ? 'info' : 'warning',
    });
    return true;
  } catch {
    return false;
  }
}
