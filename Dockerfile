# CiteBeam has zero runtime dependencies, so the image is just Node plus source.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY brands ./brands
COPY docs ./docs
COPY README.md LICENSE ./

RUN mkdir -p data audits && addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app
USER app

ENV CITEBEAM_DATA_DIR=/app/data \
    CITEBEAM_OUT_DIR=/app/audits \
    PORT=4317
EXPOSE 4317

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4317)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Bind to all interfaces inside the container; publish it behind your own auth.
CMD ["node", "bin/citebeam.js", "serve", "--host", "0.0.0.0"]
