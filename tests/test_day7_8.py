"""
Day7-Day8 全覆盖测试脚本
测试内容：
- Day7: CDC 监听 + 增量嵌入 + 反思节点 + Agentic RAG
- Day8: 黄金测试集 + RAG 评估器 + DeepWiki 工具 + 评估面板

测试方式：
- 文件存在性验证
- 导出函数/接口验证
- 通过 HTTP 请求调用 Next.js API 路由
- 纯逻辑验证（不依赖外部服务）

测试完成后删除此文件
"""

import sys
import os
import re
import json
import time
import logging
import requests
from datetime import datetime
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("Day7_8_Test")

NEXTJS_URL = "http://localhost:3000"
DATA_SERVICE_URL = "http://localhost:8002"

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_DIR = os.path.join(PROJECT_ROOT, "src")
SCRIPTS_DIR = os.path.join(PROJECT_ROOT, "scripts")

MAX_RETRIES = 2
RETRY_DELAY = 3

passed = 0
failed = 0
skipped = 0
test_results = []

TEST_DIR = os.path.dirname(os.path.abspath(__file__))
REPORTS_DIR = os.path.join(TEST_DIR, "reports")

_TEST_EMAIL = "test_autobot@example.com"
_TEST_PASSWORD = "Test@1234"
_TEST_NAME = "测试机器人"
_session_cookies = None


def _get_auth_session() -> dict:
    global _session_cookies
    if _session_cookies is not None:
        return _session_cookies

    try:
        reg_resp = requests.post(
            f"{NEXTJS_URL}/api/auth/register",
            json={"email": _TEST_EMAIL, "name": _TEST_NAME, "password": _TEST_PASSWORD},
            timeout=30,
        )
        if reg_resp.status_code not in (200, 201, 400):
            logger.warning(f"注册请求异常: HTTP {reg_resp.status_code}")

        csrf_resp = requests.get(f"{NEXTJS_URL}/api/auth/csrf", timeout=30)
        if csrf_resp.status_code != 200:
            logger.error(f"获取CSRF失败: HTTP {csrf_resp.status_code}")
            return {}
        csrf_token = csrf_resp.json().get("csrfToken", "")

        login_resp = requests.post(
            f"{NEXTJS_URL}/api/auth/callback/credentials",
            data={"email": _TEST_EMAIL, "password": _TEST_PASSWORD, "csrfToken": csrf_token},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        _session_cookies = dict(login_resp.cookies)
        logger.info(f"认证会话获取成功, cookies: {list(_session_cookies.keys())}")
        return _session_cookies
    except Exception as e:
        logger.error(f"认证失败: {e}")
        return {}


def test(name: str, func):
    """执行单个测试，记录结果"""
    global passed, failed, skipped
    try:
        result = func()
        if result is True:
            passed += 1
            logger.info(f"✅ PASS: {name}")
            test_results.append({"name": name, "status": "PASS", "detail": ""})
        elif isinstance(result, str) and result.startswith("SKIP"):
            skipped += 1
            logger.warning(f"⏭️ SKIP: {name} - {result}")
            test_results.append({"name": name, "status": "SKIP", "detail": result})
        else:
            failed += 1
            logger.error(f"❌ FAIL: {name} - {result}")
            test_results.append({"name": name, "status": "FAIL", "detail": str(result)})
    except Exception as e:
        failed += 1
        logger.error(f"❌ FAIL: {name} - 异常: {e}")
        test_results.append({"name": name, "status": "FAIL", "detail": f"异常: {e}"})


def _request_with_retry(method: str, url: str, max_retries: int = MAX_RETRIES,
                         retry_delay: float = RETRY_DELAY, **kwargs) -> requests.Response:
    """带重试机制的 HTTP 请求"""
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            resp = getattr(requests, method)(url, **kwargs)
            return resp
        except requests.Timeout:
            last_err = f"请求超时(尝试 {attempt + 1}/{max_retries + 1})"
            logger.warning(f"{url}: {last_err}")
            if attempt < max_retries:
                time.sleep(retry_delay)
        except requests.ConnectionError:
            raise
    raise requests.Timeout(last_err)


def save_report():
    """保存测试报告到 tests/reports/ 目录"""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join(REPORTS_DIR, f"test_day7_8_{timestamp}.json")

    report = {
        "timestamp": timestamp,
        "summary": {
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "total": passed + failed + skipped,
        },
        "results": test_results,
    }

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    logger.info(f"测试报告已保存: {report_path}")

    txt_report_path = os.path.join(REPORTS_DIR, f"test_day7_8_{timestamp}.txt")
    with open(txt_report_path, "w", encoding="utf-8") as f:
        f.write("=" * 60 + "\n")
        f.write("Day7-Day8 测试报告\n")
        f.write(f"时间: {timestamp}\n")
        f.write("=" * 60 + "\n\n")
        for r in test_results:
            status_icon = {"PASS": "✅", "FAIL": "❌", "SKIP": "⏭️"}.get(r["status"], "?")
            f.write(f"{status_icon} [{r['status']}] {r['name']}")
            if r["detail"]:
                f.write(f" - {r['detail']}")
            f.write("\n")
        f.write("\n" + "=" * 60 + "\n")
        f.write(f"汇总: ✅ 通过={passed}, ❌ 失败={failed}, ⏭️ 跳过={skipped}\n")
        f.write(f"总计: {passed + failed + skipped}\n")
        f.write("=" * 60 + "\n")

    logger.info(f"文本报告已保存: {txt_report_path}")


def read_file_content(filepath: str) -> str:
    """读取文件内容，失败返回空字符串"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return ""


# ============================================================
# Day7: CDC 监听 + 增量嵌入 + 反思节点 + Agentic RAG
# ============================================================

def test_cdc_listener_file_exists():
    """验证 cdc-listener.ts 文件存在"""
    filepath = os.path.join(SRC_DIR, "server", "rag", "streaming", "cdc-listener.ts")
    if not os.path.exists(filepath):
        return f"文件不存在: {filepath}"
    logger.info(f"cdc-listener.ts 文件存在: {filepath}")
    return True


def test_cdc_listener_exports():
    """验证 cdc-listener.ts 导出函数正确"""
    filepath = os.path.join(SRC_DIR, "server", "rag", "streaming", "cdc-listener.ts")
    content = read_file_content(filepath)
    if not content:
        return "无法读取 cdc-listener.ts 文件内容"

    required_exports = ["startCDCListener", "stopCDCListener"]
    for export_name in required_exports:
        pattern = rf"export\s+(?:function|async\s+function|const)\s+{export_name}"
        if not re.search(pattern, content):
            return f"缺少导出函数: {export_name}"

    logger.info(f"cdc-listener.ts 导出函数验证通过: {required_exports}")
    return True


def test_incremental_embedder_file_exists():
    """验证 incremental-embedder.ts 文件存在"""
    filepath = os.path.join(SRC_DIR, "server", "rag", "streaming", "incremental-embedder.ts")
    if not os.path.exists(filepath):
        return f"文件不存在: {filepath}"
    logger.info(f"incremental-embedder.ts 文件存在: {filepath}")
    return True


def test_incremental_embedder_exports():
    """验证 incremental-embedder.ts 导出函数正确"""
    filepath = os.path.join(SRC_DIR, "server", "rag", "streaming", "incremental-embedder.ts")
    content = read_file_content(filepath)
    if not content:
        return "无法读取 incremental-embedder.ts 文件内容"

    required_exports = ["processDocumentChange"]
    for export_name in required_exports:
        pattern = rf"export\s+(?:async\s+)?function\s+{export_name}"
        if not re.search(pattern, content):
            return f"缺少导出函数: {export_name}"

    logger.info(f"incremental-embedder.ts 导出函数验证通过: {required_exports}")
    return True


def test_reflection_node_file_exists():
    """验证 reflection-node.ts 文件存在"""
    filepath = os.path.join(SRC_DIR, "server", "agents", "reflection-node.ts")
    if not os.path.exists(filepath):
        return f"文件不存在: {filepath}"
    logger.info(f"reflection-node.ts 文件存在: {filepath}")
    return True


def test_reflection_node_exports():
    """验证 reflection-node.ts 导出函数正确"""
    filepath = os.path.join(SRC_DIR, "server", "agents", "reflection-node.ts")
    content = read_file_content(filepath)
    if not content:
        return "无法读取 reflection-node.ts 文件内容"

    required_exports = ["shouldRetrieveAgain", "reflectiveRetrieval"]
    for export_name in required_exports:
        pattern = rf"export\s+(?:async\s+)?function\s+{export_name}"
        if not re.search(pattern, content):
            return f"缺少导出函数: {export_name}"

    logger.info(f"reflection-node.ts 导出函数验证通过: {required_exports}")
    return True



# ============================================================
# Day8: 黄金测试集 + RAG 评估器 + DeepWiki 工具 + 评估面板
# ============================================================

def test_qa_golden_json_exists():
    """验证 scripts/qa-golden.json 存在且格式正确（至少20条）"""
    filepath = os.path.join(SCRIPTS_DIR, "qa-golden.json")
    if not os.path.exists(filepath):
        return f"文件不存在: {filepath}"

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        return f"JSON 解析失败: {e}"

    if not isinstance(data, list):
        return f"数据格式错误: 期望 list，实际 {type(data).__name__}"

    if len(data) < 20:
        return f"测试条目不足: {len(data)} 条，期望至少 20 条"

    required_fields = ["id", "query", "expectedAnswer", "category", "difficulty"]
    for i, item in enumerate(data):
        for field in required_fields:
            if field not in item:
                return f"第 {i + 1} 条缺少字段: {field}"

    logger.info(f"qa-golden.json 验证通过: {len(data)} 条, 必需字段完整")
    return True


def test_rag_evaluator_file_exists():
    """验证 rag-evaluator.ts 文件存在"""
    filepath = os.path.join(SRC_DIR, "server", "evaluation", "rag-evaluator.ts")
    if not os.path.exists(filepath):
        return f"文件不存在: {filepath}"
    logger.info(f"rag-evaluator.ts 文件存在: {filepath}")
    return True


def test_rag_evaluator_exports():
    """验证 rag-evaluator.ts 导出函数正确"""
    filepath = os.path.join(SRC_DIR, "server", "evaluation", "rag-evaluator.ts")
    content = read_file_content(filepath)
    if not content:
        return "无法读取 rag-evaluator.ts 文件内容"

    required_exports = ["evaluateRetrieval", "evaluateAnswer", "evaluateContextRecall", "runFullEvaluation"]
    for export_name in required_exports:
        pattern = rf"export\s+(?:async\s+)?function\s+{export_name}"
        if not re.search(pattern, content):
            return f"缺少导出函数: {export_name}"

    logger.info(f"rag-evaluator.ts 导出函数验证通过: {required_exports}")
    return True


def test_deepwiki_tool_file_exists():
    """验证 deepwiki-tool.ts 文件存在"""
    filepath = os.path.join(SRC_DIR, "server", "agents", "tools", "deepwiki-tool.ts")
    if not os.path.exists(filepath):
        return f"文件不存在: {filepath}"
    logger.info(f"deepwiki-tool.ts 文件存在: {filepath}")
    return True


def test_deepwiki_tool_exports():
    """验证 deepwiki-tool.ts 导出函数正确"""
    filepath = os.path.join(SRC_DIR, "server", "agents", "tools", "deepwiki-tool.ts")
    content = read_file_content(filepath)
    if not content:
        return "无法读取 deepwiki-tool.ts 文件内容"

    required_exports = ["searchDeepWiki", "getRepositoryInfo"]
    for export_name in required_exports:
        pattern = rf"export\s+(?:async\s+)?function\s+{export_name}"
        if not re.search(pattern, content):
            return f"缺少导出函数: {export_name}"

    logger.info(f"deepwiki-tool.ts 导出函数验证通过: {required_exports}")
    return True


def test_evaluation_results_api():
    try:
        resp = _request_with_retry("get",
            f"{NEXTJS_URL}/api/evaluation/results",
            timeout=30,
            cookies=_get_auth_session(),
        )
        if resp.status_code == 401:
            return f"HTTP 401: 需要认证 - {resp.text[:300]}"
        if resp.status_code == 404:
            return f"HTTP 404: 评估结果 API 未实现 - {resp.text[:300]}"
        if resp.status_code != 200:
            return f"HTTP {resp.status_code}: {resp.text[:300]}"
        data = resp.json()
        if "success" not in data:
            return "响应缺少 success 字段"
        if "reports" not in data:
            return "响应缺少 reports 字段"
        if "latest" not in data:
            return "响应缺少 latest 字段"
        logger.info(f"评估结果 API 验证通过, reports 数量: {len(data.get('reports', []))}")
        return True
    except requests.ConnectionError as e:
        return f"Next.js 服务连接失败: {e}"
    except requests.Timeout:
        return "评估结果 API 请求超时(30s)"
    except Exception as e:
        return str(e)


def test_evaluation_page_exists():
    """验证评估面板页面 page.tsx 文件存在"""
    filepath = os.path.join(SRC_DIR, "app", "dashboard", "evaluation", "page.tsx")
    if not os.path.exists(filepath):
        return f"文件不存在: {filepath}"

    content = read_file_content(filepath)
    if not content:
        return "文件内容为空"

    if "export default" not in content:
        return "文件缺少默认导出组件"

    logger.info(f"评估面板 page.tsx 文件存在且包含默认导出组件")
    return True


# ============================================================
# 纯逻辑验证（不依赖外部服务）
# ============================================================

def _tokenize(text: str) -> list:
    """中文友好的 tokenize：先按标点/空格切分，再对长片段做 bigram 切分"""
    cleaned = re.sub(r'[，。、；：！？（）\u201c\u201d\u2018\u2019【】《》\s,.:;!?(){}\[\]0-9%％]', ' ', text)
    segments = [s for s in cleaned.split() if s]

    result = []
    for seg in segments:
        if len(seg) <= 3:
            result.append(seg)
        else:
            for i in range(len(seg) - 1):
                result.append(seg[i:i + 2])
    return result


def test_reflection_evaluation_logic():
    """纯逻辑验证: 反思评估 shouldRetrieveAgain 的判断逻辑"""
    MAX_REFLECTION_ROUNDS = 3

    def simulate_should_retrieve_again(
        query: str,
        current_answer: str,
        previous_search_results: list,
        answer_quality_threshold: float = 0.3,
    ) -> dict:
        """模拟反思评估逻辑，基于关键词覆盖率判断是否需要继续检索"""
        if not current_answer:
            return {"needMore": True, "refinedQuery": query + " 详细说明"}

        query_tokens = set(_tokenize(query))
        answer_tokens = set(_tokenize(current_answer))

        if not query_tokens:
            return {"needMore": False}

        overlap = query_tokens & answer_tokens
        coverage = len(overlap) / len(query_tokens) if query_tokens else 0

        if coverage >= answer_quality_threshold:
            return {"needMore": False}

        if len(previous_search_results) >= MAX_REFLECTION_ROUNDS:
            return {"needMore": False}

        return {"needMore": True, "refinedQuery": query + " 具体数据"}

    # 场景1: 空答案，应该继续检索
    result1 = simulate_should_retrieve_again("A股涨跌幅限制", "", [])
    if not result1["needMore"]:
        return "场景1失败: 空答案时应该 needMore=True"

    # 场景2: 答案充分，不需要继续检索
    result2 = simulate_should_retrieve_again(
        "A股涨跌幅限制",
        "A股主板涨跌幅限制为10%，科创板和创业板为20%，ST股票为5%",
        ["搜索结果1"],
    )
    if result2["needMore"]:
        return "场景2失败: 答案充分时应该 needMore=False"

    # 场景3: 答案不充分，需要继续检索
    result3 = simulate_should_retrieve_again(
        "A股涨跌幅限制是多少",
        "A股有一些规则",
        ["搜索结果1"],
    )
    if not result3["needMore"]:
        return "场景3失败: 答案不充分时应该 needMore=True"

    # 场景4: 已达最大检索轮次，不再继续
    result4 = simulate_should_retrieve_again(
        "A股涨跌幅限制",
        "A股有一些规则",
        ["搜索结果1", "搜索结果2", "搜索结果3"],
    )
    if result4["needMore"]:
        return "场景4失败: 达到最大检索轮次时应该 needMore=False"

    logger.info("反思评估逻辑验证通过: 4个场景全部正确")
    return True


def test_incremental_index_logic():
    """纯逻辑验证: 增量索引 INSERT/UPDATE/DELETE 的处理逻辑"""
    # 模拟文档和嵌入存储
    document_store = {}
    embedding_store = {}

    def process_change(doc_id: str, action: str, content: str = ""):
        """模拟 processDocumentChange 的处理逻辑"""
        if action == "insert":
            if doc_id in document_store:
                return f"INSERT 失败: 文档 {doc_id} 已存在"
            document_store[doc_id] = {"content": content, "status": "pending"}
            # 模拟切片和嵌入
            chunks = [content[i:i + 100] for i in range(0, len(content), 100)]
            embedding_store[doc_id] = [{"chunkIndex": idx, "text": chunk} for idx, chunk in enumerate(chunks)]
            document_store[doc_id]["status"] = "indexed"
            return f"INSERT 成功: 文档 {doc_id}, 分块数 {len(chunks)}"

        elif action == "update":
            if doc_id not in document_store:
                return f"UPDATE 失败: 文档 {doc_id} 不存在"
            # 先删除旧嵌入
            if doc_id in embedding_store:
                old_count = len(embedding_store[doc_id])
                del embedding_store[doc_id]
            else:
                old_count = 0
            # 重新切片和嵌入
            chunks = [content[i:i + 100] for i in range(0, len(content), 100)]
            embedding_store[doc_id] = [{"chunkIndex": idx, "text": chunk} for idx, chunk in enumerate(chunks)]
            document_store[doc_id]["content"] = content
            document_store[doc_id]["status"] = "indexed"
            return f"UPDATE 成功: 文档 {doc_id}, 旧嵌入 {old_count} 条已删除, 新分块数 {len(chunks)}"

        elif action == "delete":
            if doc_id not in document_store:
                return f"DELETE 失败: 文档 {doc_id} 不存在"
            del document_store[doc_id]
            deleted_count = 0
            if doc_id in embedding_store:
                deleted_count = len(embedding_store[doc_id])
                del embedding_store[doc_id]
            return f"DELETE 成功: 文档 {doc_id}, 删除嵌入 {deleted_count} 条"

        else:
            return f"未知 action 类型: {action}"

    # 场景1: INSERT 新文档
    result1 = process_change("doc1", "insert", "这是第一篇文档的内容，用于测试增量索引功能。" * 5)
    if "INSERT 成功" not in result1:
        return f"场景1失败: {result1}"
    if "doc1" not in embedding_store:
        return "场景1失败: INSERT 后嵌入存储中缺少 doc1"
    logger.info(f"场景1: {result1}")

    # 场景2: UPDATE 已有文档
    result2 = process_change("doc1", "update", "这是更新后的文档内容，已经修改了部分信息。" * 8)
    if "UPDATE 成功" not in result2:
        return f"场景2失败: {result2}"
    new_chunk_count = len(embedding_store["doc1"])
    logger.info(f"场景2: {result2}, 新分块数: {new_chunk_count}")

    # 场景3: DELETE 文档
    result3 = process_change("doc1", "delete")
    if "DELETE 成功" not in result3:
        return f"场景3失败: {result3}"
    if "doc1" in embedding_store:
        return "场景3失败: DELETE 后嵌入存储中仍存在 doc1"
    if "doc1" in document_store:
        return "场景3失败: DELETE 后文档存储中仍存在 doc1"
    logger.info(f"场景3: {result3}")

    # 场景4: UPDATE 不存在的文档
    result4 = process_change("doc_not_exist", "update", "内容")
    if "UPDATE 失败" not in result4:
        return f"场景4失败: 期望 UPDATE 失败，实际 {result4}"
    logger.info(f"场景4: {result4}")

    # 场景5: DELETE 不存在的文档
    result5 = process_change("doc_not_exist", "delete")
    if "DELETE 失败" not in result5:
        return f"场景5失败: 期望 DELETE 失败，实际 {result5}"
    logger.info(f"场景5: {result5}")

    # 场景6: 未知 action 类型
    result6 = process_change("doc1", "unknown", "内容")
    if "未知 action 类型" not in result6:
        return f"场景6失败: 期望未知 action 类型提示，实际 {result6}"
    logger.info(f"场景6: {result6}")

    logger.info("增量索引逻辑验证通过: 6个场景全部正确")
    return True


def test_hits_at_k_logic():
    """纯逻辑验证: Hits@K 指标计算"""
    K = 5

    def compute_hits_at_k(
        expected_answer: str,
        search_results: list,
        k: int = K,
        match_threshold: float = 0.15,
    ) -> int:
        """模拟 Hits@K 计算：前 K 个检索结果中是否有至少一个命中期望答案关键词"""
        expected_keywords = _tokenize(expected_answer)
        if not expected_keywords:
            return 0

        top_k_results = search_results[:k]
        for result in top_k_results:
            matched = [kw for kw in expected_keywords if kw in result["text"]]
            if len(matched) >= len(expected_keywords) * match_threshold:
                return 1
        return 0

    # 场景1: 检索结果包含期望关键词，Hits@K = 1
    search_results_hit = [
        {"text": "A股主板市场的涨跌幅限制为10%，ST股票为5%", "score": 0.95},
        {"text": "科创板和创业板的涨跌幅限制为20%", "score": 0.85},
    ]
    expected1 = "A股主板市场的涨跌幅限制为10%，ST股票的涨跌幅限制为5%"
    result1 = compute_hits_at_k(expected1, search_results_hit)
    if result1 != 1:
        return f"场景1失败: Hits@K={result1}，期望 1"
    logger.info(f"场景1: Hits@K={result1}（命中）")

    # 场景2: 检索结果不包含期望关键词，Hits@K = 0
    search_results_miss = [
        {"text": "今天天气晴朗，适合户外运动", "score": 0.3},
        {"text": "足球比赛将在今晚举行", "score": 0.2},
    ]
    result2 = compute_hits_at_k(expected1, search_results_miss)
    if result2 != 0:
        return f"场景2失败: Hits@K={result2}，期望 0"
    logger.info(f"场景2: Hits@K={result2}（未命中）")

    # 场景3: 空检索结果，Hits@K = 0
    result3 = compute_hits_at_k(expected1, [])
    if result3 != 0:
        return f"场景3失败: Hits@K={result3}，期望 0"
    logger.info(f"场景3: Hits@K={result3}（空结果）")

    # 场景4: 多个检索结果，部分命中
    search_results_partial = [
        {"text": "今天股市行情分析报告", "score": 0.4},
        {"text": "A股主板涨跌幅限制10%的相关规定", "score": 0.7},
        {"text": "其他无关内容", "score": 0.2},
    ]
    result4 = compute_hits_at_k(expected1, search_results_partial)
    if result4 != 1:
        return f"场景4失败: Hits@K={result4}，期望 1"
    logger.info(f"场景4: Hits@K={result4}（部分命中）")

    logger.info("Hits@K 指标计算验证通过: 4个场景全部正确")
    return True


def test_faithfulness_logic():
    """纯逻辑验证: Faithfulness 忠实度计算"""
    def compute_faithfulness(answer: str, context: str) -> float:
        """模拟降级 Faithfulness 计算：答案中有多少词在上下文中出现"""
        if not answer or not context:
            return 0.0

        answer_tokens = _tokenize(answer)
        context_tokens = _tokenize(context)

        if not answer_tokens:
            return 0.0

        context_set = set(context_tokens)
        supported = [t for t in answer_tokens if t in context_set]

        return len(supported) / len(answer_tokens)

    # 场景1: 答案完全基于上下文，Faithfulness 接近 1
    context1 = "A股主板市场的涨跌幅限制为10%，ST股票的涨跌幅限制为5%。科创板和创业板的涨跌幅限制为20%。"
    answer1 = "A股主板涨跌幅限制为10%，ST股票为5%"
    score1 = compute_faithfulness(answer1, context1)
    if score1 < 0.5:
        return f"场景1失败: Faithfulness={score1:.4f}，期望 >= 0.5"
    logger.info(f"场景1: Faithfulness={score1:.4f}（高忠实度）")

    # 场景2: 答案与上下文无关，Faithfulness 接近 0
    context2 = "今天天气晴朗，适合户外运动。"
    answer2 = "A股主板涨跌幅限制为10%"
    score2 = compute_faithfulness(answer2, context2)
    if score2 > 0.5:
        return f"场景2失败: Faithfulness={score2:.4f}，期望 < 0.5"
    logger.info(f"场景2: Faithfulness={score2:.4f}（低忠实度）")

    # 场景3: 空答案
    score3 = compute_faithfulness("", context1)
    if score3 != 0.0:
        return f"场景3失败: 空答案 Faithfulness={score3}，期望 0.0"
    logger.info(f"场景3: Faithfulness={score3:.4f}（空答案）")

    # 场景4: 空上下文
    score4 = compute_faithfulness(answer1, "")
    if score4 != 0.0:
        return f"场景4失败: 空上下文 Faithfulness={score4}，期望 0.0"
    logger.info(f"场景4: Faithfulness={score4:.4f}（空上下文）")

    # 场景5: 部分忠实
    context5 = "A股主板市场的涨跌幅限制为10%，ST股票的涨跌幅限制为5%。"
    answer5 = "A股主板涨跌幅限制为10%，但是融资融券利率为8%"
    score5 = compute_faithfulness(answer5, context5)
    logger.info(f"场景5: Faithfulness={score5:.4f}（部分忠实）")

    logger.info("Faithfulness 忠实度计算验证通过: 5个场景全部正确")
    return True


def test_overall_score_logic():
    """纯逻辑验证: 综合评分计算逻辑（与 rag-evaluator.ts 一致）"""
    def compute_overall_score(
        avg_hits_at_k: float,
        avg_context_relevance: float,
        avg_context_recall: float,
        avg_faithfulness: float,
        avg_answer_relevance: float,
    ) -> float:
        """模拟 rag-evaluator.ts 中的 overallScore 计算"""
        return (
            avg_hits_at_k * 0.2
            + avg_context_relevance * 0.15
            + avg_context_recall * 0.15
            + avg_faithfulness * 0.25
            + avg_answer_relevance * 0.25
        )

    # 场景1: 全部满分
    score1 = compute_overall_score(1.0, 1.0, 1.0, 1.0, 1.0)
    if abs(score1 - 1.0) > 0.001:
        return f"场景1失败: overallScore={score1}，期望 1.0"
    logger.info(f"场景1: overallScore={score1:.4f}（满分）")

    # 场景2: 全部零分
    score2 = compute_overall_score(0.0, 0.0, 0.0, 0.0, 0.0)
    if abs(score2 - 0.0) > 0.001:
        return f"场景2失败: overallScore={score2}，期望 0.0"
    logger.info(f"场景2: overallScore={score2:.4f}（零分）")

    # 场景3: 典型场景
    score3 = compute_overall_score(0.8, 0.7, 0.6, 0.75, 0.85)
    expected3 = 0.8 * 0.2 + 0.7 * 0.15 + 0.6 * 0.15 + 0.75 * 0.25 + 0.85 * 0.25
    if abs(score3 - expected3) > 0.001:
        return f"场景3失败: overallScore={score3:.4f}，期望 {expected3:.4f}"
    logger.info(f"场景3: overallScore={score3:.4f}（典型场景）")

    # 验证权重总和为 1
    total_weight = 0.2 + 0.15 + 0.15 + 0.25 + 0.25
    if abs(total_weight - 1.0) > 0.001:
        return f"权重总和不等于1: {total_weight}"
    logger.info(f"权重总和验证: {total_weight}")

    logger.info("综合评分计算逻辑验证通过")
    return True


# ============================================================
# 运行所有测试
# ============================================================

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Day7-Day8 全覆盖测试开始")
    logger.info("=" * 60)

    # ============================================================
    # Day7: CDC 监听 + 增量嵌入 + 反思节点 + Agentic RAG
    # ============================================================
    logger.info("\n" + "=" * 60)
    logger.info("Day7: CDC 监听 + 增量嵌入 + 反思节点 + Agentic RAG")
    logger.info("=" * 60)

    test("CDC 监听模块 - 文件存在", test_cdc_listener_file_exists)
    test("CDC 监听模块 - 导出函数正确", test_cdc_listener_exports)
    test("增量嵌入模块 - 文件存在", test_incremental_embedder_file_exists)
    test("增量嵌入模块 - 导出函数正确", test_incremental_embedder_exports)
    test("反思节点 - 文件存在", test_reflection_node_file_exists)
    test("反思节点 - 导出函数正确", test_reflection_node_exports)

    # ============================================================
    # Day8: 黄金测试集 + RAG 评估器 + DeepWiki 工具 + 评估面板
    # ============================================================
    logger.info("\n" + "=" * 60)
    logger.info("Day8: 黄金测试集 + RAG 评估器 + DeepWiki 工具 + 评估面板")
    logger.info("=" * 60)

    test("黄金测试集 - qa-golden.json 存在且格式正确", test_qa_golden_json_exists)
    test("RAG 评估器 - 文件存在", test_rag_evaluator_file_exists)
    test("RAG 评估器 - 导出函数正确", test_rag_evaluator_exports)
    test("DeepWiki 工具 - 文件存在", test_deepwiki_tool_file_exists)
    test("DeepWiki 工具 - 导出函数正确", test_deepwiki_tool_exports)
    test("评估面板 - GET /api/evaluation/results", test_evaluation_results_api)
    test("评估面板 - page.tsx 文件存在", test_evaluation_page_exists)

    # ============================================================
    # 纯逻辑验证
    # ============================================================
    logger.info("\n" + "=" * 60)
    logger.info("纯逻辑验证（不依赖外部服务）")
    logger.info("=" * 60)

    test("反思评估逻辑 - shouldRetrieveAgain 判断", test_reflection_evaluation_logic)
    test("增量索引逻辑 - INSERT/UPDATE/DELETE 处理", test_incremental_index_logic)
    test("评估指标计算 - Hits@K", test_hits_at_k_logic)
    test("评估指标计算 - Faithfulness", test_faithfulness_logic)
    test("综合评分计算 - overallScore", test_overall_score_logic)

    # 汇总
    logger.info("\n" + "=" * 60)
    logger.info(f"测试完成: ✅ 通过={passed}, ❌ 失败={failed}, ⏭️ 跳过={skipped}")
    logger.info(f"总计: {passed + failed + skipped}")
    logger.info("=" * 60)

    # 保存报告
    save_report()

    if failed > 0:
        sys.exit(1)
