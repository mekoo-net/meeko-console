/**
 * 厂家侧栏图标。资源是 Lobe Icons（@lobehub/icons-static-svg），和 new-api 渠道列表同一套。
 *
 * 文件名跟 `maker.ts` 的 key 对齐；个别厂家 Lobe 用产品名（Claude / Gemini / 混元），
 * 下载时已经写进对应 key 的文件，这里不再二次映射。
 */
const files = import.meta.glob<string>('../assets/makers/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const byMaker: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop()?.replace(/\.svg$/, '');
  if (name) byMaker[name] = url;
}

/** 上游偶尔用产品名当厂家，对回我们的 key。 */
const ALIAS: Record<string, string> = {
  claude: 'anthropic',
  gemini: 'google',
  kimi: 'moonshot',
  hunyuan: 'tencent',
  flux: 'bfl',
  llama: 'meta',
  grok: 'xai',
};

function resolveKey(maker: string): string {
  const k = maker.trim().toLowerCase();
  if (!k) return 'other';
  if (byMaker[k]) return k;
  const aliased = ALIAS[k];
  if (aliased && byMaker[aliased]) return aliased;
  return 'other';
}

export function makerIconSrc(maker: string): string {
  return byMaker[resolveKey(maker)] ?? byMaker.other!;
}

export function hasMakerIcon(maker: string): boolean {
  return resolveKey(maker) !== 'other';
}
