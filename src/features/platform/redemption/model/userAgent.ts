/**
 * 把 User-Agent 压成「浏览器 · 系统」短标签，表格里一眼区分真人浏览器与脚本。
 * 只认常见几种，认不出的原样截断，完整串在详情里看。
 */
export interface UaSummary {
  label: string;
  browser: string;
  os: string;
  /** 非浏览器客户端（curl / python-requests 等），兑换场景下基本等于脚本刷卡。 */
  isScript: boolean;
}

const SCRIPT_RE = /^(python-requests|curl|wget|go-http-client|okhttp|java|axios|node-fetch|postmanruntime)\/?([\d.]*)/i;

function os(ua: string): string | null {
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/iPhone OS (\d+)/))) return `iOS ${m[1]}`;
  if ((m = ua.match(/iPad; CPU OS (\d+)/))) return `iPadOS ${m[1]}`;
  if ((m = ua.match(/Android (\d+)/))) return `Android ${m[1]}`;
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

function browser(ua: string): string | null {
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/MicroMessenger\/(\d+)/))) return `微信 ${m[1]}`;
  if ((m = ua.match(/Edg\/(\d+)/))) return `Edge ${m[1]}`;
  if ((m = ua.match(/Firefox\/(\d+)/))) return `Firefox ${m[1]}`;
  if ((m = ua.match(/Chrome\/(\d+)/))) return `Chrome ${m[1]}`;
  if ((m = ua.match(/Version\/(\d+).*Safari/))) return `Safari ${m[1]}`;
  return null;
}

export function summarizeUserAgent(ua: string | null | undefined): UaSummary {
  if (!ua) return { label: '—', browser: '—', os: '', isScript: false };
  const script = ua.match(SCRIPT_RE);
  if (script) {
    const label = script[2] ? `${script[1]} ${script[2]}` : script[1]!;
    return { label, browser: script[1]!, os: '脚本客户端', isScript: true };
  }
  const b = browser(ua) ?? ua.slice(0, 24);
  const o = os(ua) ?? '';
  return { label: [b, o].filter(Boolean).join(' · '), browser: b, os: o, isScript: false };
}
