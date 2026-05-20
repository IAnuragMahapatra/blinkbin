FROM nginx:1.27-alpine

# Patch OS-level security vulnerabilities
RUN apk update && apk upgrade --no-cache

RUN adduser -D -H blinkbin

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
