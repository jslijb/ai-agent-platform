const PARENT_CHUNK_SIZE = 2000;
const CHILD_CHUNK_SIZE = 500;
const OVERLAP_SIZE = 100;

interface ParentChildMapping {
  parentId: string;
  parentText: string;
  childIds: string[];
}

const parentStore: Map<string, string> = new Map();
const childToParentMap: Map<string, string> = new Map();

export function buildParentChildMapping(
  chunks: Array<{ id: string; text: string }>
): void {
  console.log(`[父子文档] 开始构建映射, 子块数: ${chunks.length}`);

  parentStore.clear();
  childToParentMap.clear();

  let currentParentId = `parent_${Date.now()}_0`;
  let currentParentText = "";
  let currentChildIds: string[] = [];
  let parentIndex = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    currentParentText += (currentParentText ? "\n" : "") + chunk.text;
    currentChildIds.push(chunk.id);
    childToParentMap.set(chunk.id, currentParentId);

    if (currentParentText.length >= PARENT_CHUNK_SIZE || i === chunks.length - 1) {
      parentStore.set(currentParentId, currentParentText);

      parentIndex++;
      currentParentId = `parent_${Date.now()}_${parentIndex}`;
      currentParentText = "";
      currentChildIds = [];
    }
  }

  console.log(`[父子文档] 映射构建完成, 父块数: ${parentStore.size}, 子块映射数: ${childToParentMap.size}`);
}

export async function retrieveParentChunks(
  childChunks: Array<{ id: string; text: string }>
): Promise<string[]> {
  console.log(`[父子文档] 开始检索父块, 子块数: ${childChunks.length}`);

  const seenParentIds = new Set<string>();
  const results: string[] = [];

  for (const child of childChunks) {
    const parentId = childToParentMap.get(child.id);

    if (parentId && !seenParentIds.has(parentId)) {
      const parentText = parentStore.get(parentId);
      if (parentText) {
        seenParentIds.add(parentId);
        results.push(parentText);
      }
    } else if (!parentId) {
      results.push(child.text);
    }
  }

  console.log(`[父子文档] 检索完成, 返回 ${results.length} 个父块`);
  return results;
}

export function getParentChunkSize(): number {
  return PARENT_CHUNK_SIZE;
}

export function getChildChunkSize(): number {
  return CHILD_CHUNK_SIZE;
}

export function getOverlapSize(): number {
  return OVERLAP_SIZE;
}
