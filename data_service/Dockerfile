FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ \
    fastapi uvicorn pydantic pyyaml pandas baostock efinance mootdx tushare requests

COPY data_service/ ./data_service/
COPY config/ ./config/

EXPOSE 8001

CMD ["uvicorn", "data_service.main:app", "--host", "0.0.0.0", "--port", "8001"]
