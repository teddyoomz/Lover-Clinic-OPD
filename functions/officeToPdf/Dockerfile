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
# PLUS: Thai fonts (V110 font-fidelity fix, 2026-05-23 EOD+1) — fonts-thai-tlwg
# ships TH Sarabun PSK + Loma + Garuda + Norasi + 7 other free Thai fonts. These
# are the metric-equivalent free substitutes for the MS-proprietary fonts
# (Cordia/Browallia/Angsana + UPC variants) that almost every Thai Word doc
# specifies via the document theme. Without them, LibreOffice falls back to
# Noto Sans Thai → different character widths → line-wrap doesn't match Word.
# fontconfig-thai.conf below installs the alias map (Cordia→Loma etc.).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       curl supervisor ca-certificates gnupg \
       fonts-thai-tlwg fonts-thai-tlwg-otf \
       fontconfig \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# V110 — Install fontconfig alias mapping Microsoft-proprietary Thai fonts to
# their free metric-equivalent counterparts. Refresh the fontconfig cache so
# LibreOffice picks up the new fonts + aliases at runtime.
COPY fontconfig-thai.conf /etc/fonts/conf.d/99-thai-substitute.conf
RUN fc-cache -f -v >/dev/null 2>&1 && fc-list :lang=th | head -10

# V110-bis (2026-05-23 EOD+1) — LibreOffice MS Word compatibility flags.
# After V110 fonts alone the layout was closer but not Word-equivalent; the
# remaining drift was LibreOffice's native paragraph/line/tab algorithm. This
# XCU enables every documented Word-compat option (UsePrinterMetrics,
# AddSpacing, UseLineSpacing, MsWordCompTrailingBlanks, NoExtLeading + CTL
# enabled by default for Thai). Deployed to the gotenberg user's home dir
# since supervisord runs LO as user=gotenberg.
RUN mkdir -p /home/gotenberg/.config/libreoffice/4/user
COPY libreoffice-compat.xcu /home/gotenberg/.config/libreoffice/4/user/registrymodifications.xcu
RUN chown -R gotenberg:gotenberg /home/gotenberg/.config

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
