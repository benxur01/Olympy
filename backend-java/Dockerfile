# Multi-stage build for the Brain Battles Spring Boot service.
# NOTE: not built in the current sandbox (no Docker). Provided ready for the
# eventual Render `env: docker` web service. Local verification is done by
# running the jar directly with `java -jar`.

# --- Build stage ---
FROM eclipse-temurin:17-jdk AS build
WORKDIR /app
# Copy the Maven wrapper first for better layer caching.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B dependency:go-offline
COPY src/ src/
RUN ./mvnw -B clean package -DskipTests

# --- Runtime stage ---
FROM eclipse-temurin:17-jre AS runtime
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
# Render injects PORT; the app reads it via server.port=${PORT:8081}.
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
