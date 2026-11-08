FROM alpine:3.24.1

ARG PB_VERSION=0.40.6

RUN apk add --no-cache \
    unzip \
    ca-certificates

# Download PocketBase in a cached step | ADD asks GitHub again on every build and a GitHub hiccup failed the deploy
RUN wget -q --tries=5 --waitretry=10 -O /tmp/pb.zip https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
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
