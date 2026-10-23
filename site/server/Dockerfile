# Self-updating web server for the generator site. The image holds only server.mjs; the site itself is
# downloaded from the GitHub releases of the repository into the /data volume (see site/DEPLOY.md).
FROM node:22-alpine
ENV NODE_ENV=production PORT=8642 DATA_DIR=/data
WORKDIR /app
COPY server.mjs ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8642
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "server.mjs"]
