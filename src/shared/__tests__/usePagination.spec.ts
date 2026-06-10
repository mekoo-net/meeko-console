import { describe, expect, it } from 'vitest';

import { clientPaginate, usePagination } from '../composables/usePagination';

describe('usePagination', () => {
  it('初始页 1，pageSize 20', () => {
    const p = usePagination();
    expect(p.state.page).toBe(1);
    expect(p.state.pageSize).toBe(20);
    expect(p.totalPages.value).toBe(1);
  });

  it('setTotal 后 totalPages 正确', () => {
    const p = usePagination({ pageSize: 10 });
    p.setTotal(35);
    expect(p.totalPages.value).toBe(4);
  });

  it('setPage 越界被夹住', () => {
    const p = usePagination({ pageSize: 10 });
    p.setTotal(35);
    p.setPage(99);
    expect(p.state.page).toBe(4);
    p.setPage(-3);
    expect(p.state.page).toBe(1);
  });

  it('改 pageSize 时回到第一页', () => {
    const p = usePagination({ pageSize: 10 });
    p.setTotal(50);
    p.setPage(3);
    p.setPageSize(25);
    expect(p.state.page).toBe(1);
    expect(p.state.pageSize).toBe(25);
  });

  it('reset 清空', () => {
    const p = usePagination();
    p.setTotal(42);
    p.setPage(2);
    p.reset();
    expect(p.state.page).toBe(1);
    expect(p.state.total).toBe(0);
  });
});

describe('clientPaginate', () => {
  it('按 page/pageSize 切片', () => {
    const items = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(clientPaginate(items, 1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(clientPaginate(items, 3, 5)).toEqual([11, 12]);
    expect(clientPaginate(items, 4, 5)).toEqual([]);
  });

  it('pageSize 为 0 时返回空', () => {
    expect(clientPaginate([1, 2], 1, 0)).toEqual([]);
  });
});
