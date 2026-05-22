# functions/officeToPdf/Dockerfile
#
# (2026-05-22 EOD+2 — T4) Two-tier image: Gotenberg 8 (bundled LibreOffice 24.x
# + Chromium) as the base + Node 20 runtime for the Firebase Functions handler.
# supervisord runs both processes inside the same container:
#   - Gotenberg HTTP API on localhost:3000 (officeToPdf POSTs here)
#   - Functions Framework HTTP server on $PORT (default 8080)
#
# Firebase Functions 2nd Gen with this Dockerfile present deploys as a Cloud
# Run service. The Storage onObjectFinalized trigger is wired via Eventarc by
# Firebase Functions itself — no manual Eventarc plumbing needed.

FROM gotenberg/gotenberg:8

# Run as root for the install steps; supervisord drops to gotenberg user for
# its child process.
USER root

# Install Node 20 + supervisord (Gotenberg base is Debian-based).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl supervisor ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .

# supervisord starts BOTH the Gotenberg HTTP server (localhost:3000) AND the
# Functions Framework HTTP server (default $PORT=8080). See supervisord.conf.
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Cloud Run requires PORT env (defaults to 8080).
EXPOSE 8080

# Functions Framework reads FUNCTION_TARGET to know which export to serve.
ENV FUNCTION_TARGET=officeToPdf
ENV FUNCTION_SIGNATURE_TYPE=cloudevent

# Container entrypoint — supervisord, NOT the Gotenberg default.
ENTRYPOINT []
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
