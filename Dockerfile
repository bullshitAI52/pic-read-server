FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=8765 TESSERACT_CMD=/usr/bin/tesseract TESSDATA_DIR=/usr/share/tesseract-ocr/5/tessdata OCR_LANG=chi_sim NEWSPAPER_RUNTIME_DIR=/data/newspaper_reader

RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-chi-sim && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /data/newspaper_reader
EXPOSE 8765
VOLUME ["/data/newspaper_reader"]
CMD ["python", "-m", "newspaper_reader", "--host", "0.0.0.0", "--port", "8765"]
