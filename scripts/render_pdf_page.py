"""
R014：PDF 页面渲染为图片（OCR fallback 链路 Step 1）

用途：用 PyMuPDF 将 PDF 指定页渲染为 PNG 图片，供 PaddleOCR 识别。
运行环境：bigmodel（D:\ProgramData\Miniforge3\envs\bigmodel\python.exe）
  原因：agent 环境无 PyMuPDF（无法安装，权限拒绝），bigmodel 环境有 PyMuPDF 1.27.2.3。

CLI 接口：
    D:\ProgramData\Miniforge3\envs\bigmodel\python.exe scripts/render_pdf_page.py \
        --pdf-path "xxx.pdf" --page 9 --output "xxx.png" --dpi 200

参数说明：
    --pdf-path  PDF 文件绝对路径（必填）
    --page      0-based 页码（必填，即 PDF 的第 N 页，page=0 表示第一页）
    --output    输出 PNG 路径（必填）
    --dpi       渲染 DPI（默认 200，OCR 推荐 200-300）
    --quiet     静默模式（只输出错误）

退出码：
    0  成功
    1  参数错误
    2  PDF 文件不存在
    3  PyMuPDF 导入失败
    4  页码越界
    5  渲染失败
"""
import argparse
import os
import sys
import logging

logger = logging.getLogger("render_pdf_page")


def setup_logging(quiet: bool = False):
    level = logging.WARNING if quiet else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stderr,  # 日志走 stderr，stdout 留给调用方解析
    )


def render_page(pdf_path: str, page_idx: int, output_path: str, dpi: int = 200) -> bool:
    """渲染 PDF 指定页为 PNG

    参数：
        pdf_path: PDF 文件路径
        page_idx: 0-based 页码
        output_path: 输出 PNG 路径
        dpi: 渲染 DPI（默认 200）

    返回：True 成功，False 失败
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        logger.error(f"PyMuPDF 导入失败: {e}（请确保在 bigmodel 环境运行）")
        sys.exit(3)

    if not os.path.exists(pdf_path):
        logger.error(f"PDF 文件不存在: {pdf_path}")
        sys.exit(2)

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        logger.error(f"打开 PDF 失败: {pdf_path}, error={type(e).__name__}: {e}")
        sys.exit(5)

    try:
        n_pages = len(doc)
        if page_idx < 0 or page_idx >= n_pages:
            logger.error(
                f"页码越界: page={page_idx}, PDF 总页数={n_pages} "
                f"(有效范围 0-{n_pages - 1})"
            )
            sys.exit(4)

        page = doc[page_idx]

        # DPI 转换：PyMuPDF 默认 72 DPI，zoom = dpi / 72
        zoom = float(dpi) / 72.0
        matrix = fitz.Matrix(zoom, zoom)

        logger.info(
            f"渲染 PDF: {pdf_path}, page={page_idx}(1-based {page_idx + 1}), "
            f"dpi={dpi}, zoom={zoom:.3f}, 输出={output_path}"
        )

        pix = page.get_pixmap(matrix=matrix)
        pix.save(output_path)

        # 验证输出文件
        if not os.path.exists(output_path):
            logger.error(f"渲染完成但输出文件不存在: {output_path}")
            sys.exit(5)

        file_size = os.path.getsize(output_path)
        logger.info(
            f"渲染成功: {output_path}, 尺寸={pix.width}x{pix.height}, "
            f"文件大小={file_size} bytes"
        )
        return True
    except SystemExit:
        raise
    except Exception as e:
        logger.error(f"渲染失败: {type(e).__name__}: {e}", exc_info=True)
        sys.exit(5)
    finally:
        doc.close()


def main():
    parser = argparse.ArgumentParser(
        description="R014: 用 PyMuPDF 将 PDF 指定页渲染为 PNG（OCR fallback 链路 Step 1）"
    )
    parser.add_argument(
        "--pdf-path",
        required=True,
        help="PDF 文件绝对路径",
    )
    parser.add_argument(
        "--page",
        type=int,
        required=True,
        help="0-based 页码（page=0 表示第一页）",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="输出 PNG 文件路径",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=200,
        help="渲染 DPI（默认 200，OCR 推荐 200-300）",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="静默模式（只输出错误）",
    )

    args = parser.parse_args()
    setup_logging(args.quiet)

    if args.dpi < 72 or args.dpi > 600:
        logger.error(f"DPI 范围应为 72-600，实际: {args.dpi}")
        sys.exit(1)

    render_page(args.pdf_path, args.page, args.output, args.dpi)


if __name__ == "__main__":
    main()
