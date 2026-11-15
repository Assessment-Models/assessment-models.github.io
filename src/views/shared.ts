/** Shared helpers for the views. */
import { fetchManifest, findNode } from '../data/loader';
import type { IndexNode } from '../types';

export { h } from '../ui/dom';
export {
  conformanceBadge,
  errorPanel,
  repoUrl,
  toast,
} from '../ui/dom';

export async function fetchNodeSafe(id: string): Promise<IndexNode> {
  const manifest = await fetchManifest();
  const node = findNode(manifest, id);
  if (!node) throw new Error(`Unknown asset “${id}” — is it registered in assessment-registry?`);
  return node;
}
