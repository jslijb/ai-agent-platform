const DEEPWIKI_API_BASE = "https://api.deepwiki.com";
const REQUEST_TIMEOUT_MS = 15000;

interface DeepWikiSearchResult {
  title: string;
  content: string;
  url?: string;
  repository?: string;
}

interface DeepWikiResponse {
  success: boolean;
  data?: DeepWikiSearchResult[];
  error?: string;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function searchDeepWiki(
  repository: string,
  query: string
): Promise<string> {
  console.log(
    `[deepwiki-tool] 搜索 DeepWiki, repository: "${repository}", query: "${query.slice(0, 50)}..."`
  );

  try {
    const searchUrl = `${DEEPWIKI_API_BASE}/search`;
    const searchParams = new URLSearchParams({
      q: query,
      repository: repository,
    });

    console.log(
      `[deepwiki-tool] 请求 URL: ${searchUrl}?${searchParams.toString()}`
    );

    const response = await fetchWithTimeout(
      `${searchUrl}?${searchParams.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[deepwiki-tool] API 请求失败: ${response.status} ${errorText}`
      );
      return getFallbackResponse(repository, query);
    }

    const data = (await response.json()) as DeepWikiResponse;

    if (!data.success || !data.data || data.data.length === 0) {
      console.log(
        `[deepwiki-tool] 未找到相关结果, repository: "${repository}"`
      );
      return getFallbackResponse(repository, query);
    }

    const results = data.data
      .map(
        (item, index) =>
          `【结果${index + 1}】${item.title}\n${item.content}${item.url ? `\n来源: ${item.url}` : ""}`
      )
      .join("\n\n");

    console.log(
      `[deepwiki-tool] 搜索完成, 返回 ${data.data.length} 条结果`
    );

    return results;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error(
        `[deepwiki-tool] 请求超时 (${REQUEST_TIMEOUT_MS}ms), repository: "${repository}"`
      );
    } else {
      console.error(
        `[deepwiki-tool] 搜索异常, repository: "${repository}":`,
        error
      );
    }

    return getFallbackResponse(repository, query);
  }
}

function getFallbackResponse(repository: string, query: string): string {
  console.log(
    `[deepwiki-tool] 降级返回提示信息, repository: "${repository}"`
  );

  return (
    `DeepWiki 服务暂时不可用，无法查询仓库 "${repository}" 的相关信息。\n\n` +
    `建议：\n` +
    `1. 稍后重试\n` +
    `2. 直接访问 https://deepwiki.com/${repository} 查看文档\n` +
    `3. 使用其他搜索工具获取 "${query}" 的相关信息\n\n` +
    `注意：DeepWiki 是一个开源项目文档搜索平台，可以帮助理解代码库的结构和用法。`
  );
}

export async function getRepositoryInfo(
  repository: string
): Promise<string> {
  console.log(
    `[deepwiki-tool] 获取仓库信息, repository: "${repository}"`
  );

  try {
    const infoUrl = `${DEEPWIKI_API_BASE}/repositories/${encodeURIComponent(repository)}`;

    const response = await fetchWithTimeout(
      infoUrl,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
      console.error(
        `[deepwiki-tool] 获取仓库信息失败: ${response.status}`
      );
      return getFallbackResponse(repository, "仓库信息");
    }

    const data = await response.json();
    console.log(
      `[deepwiki-tool] 仓库信息获取成功, repository: "${repository}"`
    );

    return JSON.stringify(data, null, 2);
  } catch (error) {
    console.error(
      `[deepwiki-tool] 获取仓库信息异常, repository: "${repository}":`,
      error
    );
    return getFallbackResponse(repository, "仓库信息");
  }
}

export type { DeepWikiSearchResult, DeepWikiResponse };
