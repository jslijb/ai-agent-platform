import baostock as bs
import time
import threading

_login_lock = threading.Lock()
_is_logged_in = False

def ensure_login():
    global _is_logged_in
    with _login_lock:
        if _is_logged_in:
            return
        lg = bs.login()
        print(f"登录: error_code={lg.error_code}, msg={lg.error_msg}")
        if lg.error_code != "0":
            raise ConnectionError(f"登录失败: {lg.error_msg}")
        _is_logged_in = True

def relogin():
    global _is_logged_in
    with _login_lock:
        try:
            bs.logout()
        except Exception:
            pass
        _is_logged_in = False
    ensure_login()

def safe_query(query_func, *args, max_retries=2, **kwargs):
    for attempt in range(max_retries + 1):
        try:
            ensure_login()
            rs = query_func(*args, **kwargs)
            if rs.error_code != "0":
                error_msg = rs.error_msg
                if any(kw in error_msg.lower() for kw in ["login", "connect", "网络", "超时", "timeout"]):
                    print(f"查询失败(尝试 {attempt + 1}/{max_retries + 1}): {error_msg}，重新登录")
                    relogin()
                    continue
                raise RuntimeError(f"查询失败: {error_msg}")
            return rs
        except ConnectionError:
            if attempt < max_retries:
                print(f"连接失败(尝试 {attempt + 1}/{max_retries + 1})，重新登录")
                relogin()
                continue
            raise
        except RuntimeError:
            raise
        except Exception as e:
            if attempt < max_retries:
                print(f"查询异常(尝试 {attempt + 1}/{max_retries + 1}): {e}，重新登录")
                relogin()
                continue
            raise

print("=== 测试1: 全局复用模式 - query_stock_basic ===")
t1 = time.time()
print(f"t1: {t1:.1f}")
rs = safe_query(bs.query_stock_basic, code="", code_name="")
print(f"查询: error_code={rs.error_code}, msg={rs.error_msg}, 耗时: {time.time()-t1:.1f}s")
if rs.error_code == "0":
    count = 0
    while rs.next():
        count += 1
    print(f"记录数: {count}, 总耗时: {time.time()-t1:.1f}s")

print()
print("=== 测试2: 全局复用模式 - query_trade_dates ===")
t2 = time.time()
rs = safe_query(bs.query_trade_dates, start_date="2024-01-01", end_date="2024-12-31")
print(f"查询: error_code={rs.error_code}, msg={rs.error_msg}, 耗时: {time.time()-t2:.1f}s")
if rs.error_code == "0":
    count = 0
    while rs.next():
        count += 1
    print(f"记录数: {count}, 总耗时: {time.time()-t2:.1f}s")

print()
print("=== 测试3: 每次 login/logout 模式 - query_stock_basic ===")
bs.logout()
_is_logged_in = False
lg = bs.login()
print(f"登录: error_code={lg.error_code}, msg={lg.error_msg}")
t3 = time.time()
rs = bs.query_stock_basic(code="", code_name="")
print(f"查询: error_code={rs.error_code}, msg={rs.error_msg}, 耗时: {time.time()-t3:.1f}s")
if rs.error_code == "0":
    count = 0
    while rs.next():
        count += 1
    print(f"记录数: {count}, 总耗时: {time.time()-t3:.1f}s")
bs.logout()

print("测试完成")
