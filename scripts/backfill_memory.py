"""
回填记忆摘要脚本 (L2 MemorySummary + L3 MemoryFragment)
为已有会话生成滚动摘要和记忆碎片
"""
import asyncio
import sys
import os
import re
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get("DATABASE_URL", "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb")

SUMMARY_THRESHOLD = 2

def get_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def get_conversations_with_messages(cur):
    """获取所有有消息但没摘要的会话"""
    cur.execute("""
        SELECT c.id, c."userId", c.title,
               COUNT(m.id) as msg_count
        FROM "Conversation" c
        JOIN "Message" m ON m."conversationId" = c.id
        LEFT JOIN "MemorySummary" ms ON ms."conversationId" = c.id
        WHERE ms.id IS NULL
        GROUP BY c.id, c."userId", c.title
        HAVING COUNT(m.id) >= %s
        ORDER BY msg_count DESC
    """, (SUMMARY_THRESHOLD,))
    return cur.fetchall()

def get_conversation_messages(cur, conversation_id):
    """获取会话的所有消息"""
    cur.execute("""
        SELECT id, role, content, "createdAt"
        FROM "Message"
        WHERE "conversationId" = %s
        ORDER BY "createdAt" ASC
    """, (conversation_id,))
    return cur.fetchall()

def estimate_tokens(text):
    return max(1, len(text) // 2)

def generate_summary_text(messages_batch):
    """从消息批次生成摘要文本（不依赖LLM的简单版本）"""
    parts = []
    for msg in messages_batch:
        role = "用户" if msg["role"] == "user" else "助手"
        content = msg["content"][:500] if msg["content"] else ""
        parts.append(f"{role}: {content}")
    
    conversation_text = "\n".join(parts)
    
    user_msgs = [m for m in messages_batch if m["role"] == "user"]
    assistant_msgs = [m for m in messages_batch if m["role"] == "assistant"]
    
    summary_parts = []
    summary_parts.append(f"摘要：本次对话包含{len(user_msgs)}条用户提问和{len(assistant_msgs)}条助手回复。")
    
    topics = []
    for um in user_msgs:
        content = um["content"][:100] if um["content"] else ""
        if content:
            topics.append(content)
    
    if topics:
        summary_parts.append("关键数据点：")
        for i, t in enumerate(topics[:5], 1):
            summary_parts.append(f"- 话题{i}: {t}")
    
    return "\n".join(summary_parts)

def extract_key_points(summary_text):
    """从摘要文本提取关键数据点"""
    key_points = []
    kp_match = re.search(r'关键数据点[：:]\s*([\s\S]*?)$', summary_text)
    if kp_match:
        lines = kp_match.group(1).split("\n")
        for line in lines:
            line = line.strip()
            if line.startswith("-"):
                match = re.match(r"-\s*\[?([^\]]*)\]?\s*[：:]\s*(.*)", line)
                if match:
                    key_points.append({"topic": match.group(1).strip(), "data": match.group(2).strip()})
                else:
                    key_points.append({"topic": line.replace("- ", ""), "data": ""})
    return key_points

def backfill_summaries():
    """主回填函数"""
    conn = get_connection()
    cur = conn.cursor()
    
    conversations = get_conversations_with_messages(cur)
    print(f"找到 {len(conversations)} 个需要回填摘要的会话")
    
    success_count = 0
    error_count = 0
    
    for conv in conversations:
        conv_id = conv["id"]
        user_id = conv["userId"]
        title = conv["title"]
        
        try:
            messages = get_conversation_messages(cur, conv_id)
            if len(messages) < SUMMARY_THRESHOLD:
                continue
            
            print(f"\n处理会话: {conv_id[:8]}... (标题: {title}, 消息数: {len(messages)})")
            
            for start in range(0, len(messages), SUMMARY_THRESHOLD):
                end = min(start + SUMMARY_THRESHOLD - 1, len(messages) - 1)
                batch = messages[start:end + 1]
                
                if len(batch) < SUMMARY_THRESHOLD // 2:
                    continue
                
                summary_text = generate_summary_text(batch)
                key_points = extract_key_points(summary_text)
                token_count = estimate_tokens(summary_text)
                
                cur.execute("""
                    INSERT INTO "MemorySummary" 
                    ("conversationId", "userId", "messageRangeStart", "messageRangeEnd", 
                     summary, "keyPoints", "tokenCount", "createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT DO NOTHING
                """, (conv_id, user_id, start, end, summary_text, 
                      json.dumps(key_points), token_count))
                
                for kp in key_points:
                    if not kp.get("data") or len(kp["data"]) < 10:
                        continue
                    content = f"{kp['topic']}: {kp['data']}"
                    cur.execute("""
                        INSERT INTO "MemoryFragment" 
                        ("userId", scope, "sourceConversationId", "sourceType", content, metadata, "createdAt")
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """, (user_id, "personal", conv_id, "data_point", content,
                          json.dumps({"topic": kp["topic"]})))
                
                cur.execute("""
                    INSERT INTO "MemoryFragment" 
                    ("userId", scope, "sourceConversationId", "sourceType", content, metadata, "createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                """, (user_id, "personal", conv_id, "conclusion", 
                      summary_text[:1000], json.dumps({"type": "summary"})))
                
                success_count += 1
                print(f"  生成摘要: 消息范围 {start}-{end}, tokens: {token_count}, 关键点: {len(key_points)}")
            
            conn.commit()
            
        except Exception as e:
            error_count += 1
            print(f"  错误: {e}")
            conn.rollback()
    
    cur.close()
    conn.close()
    
    print(f"\n=== 回填完成 ===")
    print(f"成功: {success_count}, 失败: {error_count}")
    
    return success_count, error_count

def verify_backfill():
    """验证回填结果"""
    conn = get_connection()
    cur = conn.cursor()
    
    cur.execute('SELECT COUNT(*) as cnt FROM "MemorySummary"')
    summary_count = cur.fetchone()["cnt"]
    
    cur.execute('SELECT COUNT(*) as cnt FROM "MemoryFragment"')
    fragment_count = cur.fetchone()["cnt"]
    
    cur.execute("""
        SELECT "userId", COUNT(*) as cnt 
        FROM "MemorySummary" 
        GROUP BY "userId" 
        ORDER BY cnt DESC
    """)
    by_user = cur.fetchall()
    
    print(f"\n=== 验证结果 ===")
    print(f"MemorySummary: {summary_count} 条")
    print(f"MemoryFragment: {fragment_count} 条")
    print(f"\n按用户分布:")
    for row in by_user:
        print(f"  {row['userId'][:20]}...: {row['cnt']} 条摘要")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    print("=== 记忆摘要回填脚本 ===")
    print(f"摘要触发阈值: {SUMMARY_THRESHOLD} 条消息")
    
    backfill_summaries()
    verify_backfill()