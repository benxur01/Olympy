FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /olympy-api ./cmd/api

FROM alpine:latest

WORKDIR /app
RUN apk add --no-cache ca-certificates curl tzdata

COPY --from=builder /olympy-api /app/olympy-api

EXPOSE 8000

CMD ["/app/olympy-api"]
