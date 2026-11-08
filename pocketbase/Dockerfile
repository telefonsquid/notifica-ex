FROM alpine:3.24.1

ARG PB_VERSION=0.40.6

# Shown on the About page through pb_hooks/about.pb.js
ENV PB_VERSION=${PB_VERSION}

RUN apk add --no-cache \
    unzip \
    ca-certificates

# Download PocketBase in a cached step | ADD asks GitHub again on every build and a GitHub hiccup failed the deploy
# Retry by hand, busybox wget has no --tries
RUN for attempt in 1 2 3 4 5; do \
        wget -q -T 30 -O /tmp/pb.zip https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip && break; \
        rm -f /tmp/pb.zip; sleep 10; \
    done \
    && unzip /tmp/pb.zip -d /pb/ \
    && rm /tmp/pb.zip

# add cronjobs
COPY ./cronjobs /pb/pb_hooks

# create the superuser before serving
COPY ./entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh

EXPOSE 8080

# start PocketBase
ENTRYPOINT ["/pb/entrypoint.sh"]
