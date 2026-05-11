export function debounce<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => void,
  wait: number,
): {
  (...args: TArgs): void;
  cancel(): void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: TArgs) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return wrapped;
}
