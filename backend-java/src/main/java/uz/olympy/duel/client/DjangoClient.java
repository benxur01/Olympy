package uz.olympy.duel.client;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Thin client over Django's internal (shared-secret gated) endpoints.
 *
 * <p>Django is the source of truth: this service never verifies JWTs itself
 * and never writes to Django's DB directly.
 *
 * <p>Uses the JDK {@link HttpClient} with a string body publisher so requests
 * carry an explicit {@code Content-Length} (not chunked transfer-encoding).
 * Spring's {@code RestTemplate}/{@code SimpleClientHttpRequestFactory} chunk
 * request bodies as of Spring 6.1, which Django's WSGI dev server used for
 * local verification cannot read.
 */
@Component
public class DjangoClient {

    private static final Logger log = LoggerFactory.getLogger(DjangoClient.class);

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final String introspectUrl;
    private final String duelResultUrl;
    private final String quizResultUrl;
    private final String serviceSecret;

    public DjangoClient(
            @Value("${django.base-url}") String baseUrl,
            @Value("${internal.service-secret}") String serviceSecret) {
        String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.introspectUrl = base + "/api/accounts/introspect/";
        this.duelResultUrl = base + "/api/attempts/duel-result/";
        this.quizResultUrl = base + "/api/attempts/quiz-result/";
        this.serviceSecret = serviceSecret;
    }

    /** Result of a token introspection call. */
    public record Introspection(boolean valid, Long userId, String phone) {
        static Introspection invalid() {
            return new Introspection(false, null, null);
        }
    }

    private HttpRequest.Builder internalRequest(String url, String jsonBody) {
        return HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(5))
                .header("Content-Type", "application/json")
                .header("X-Internal-Service-Secret", serviceSecret)
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody));
    }

    /**
     * Validate a JWT against Django. Any failure (network, invalid token, 403)
     * is treated as "not valid" — the caller rejects the connection.
     */
    @SuppressWarnings("unchecked")
    public Introspection introspect(String token) {
        try {
            String body = mapper.writeValueAsString(Map.of("token", token));
            HttpResponse<String> resp = http.send(
                    internalRequest(introspectUrl, body).build(),
                    HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                return Introspection.invalid();
            }
            Map<String, Object> parsed = mapper.readValue(resp.body(), Map.class);
            if (!Boolean.TRUE.equals(parsed.get("valid"))) {
                return Introspection.invalid();
            }
            Number userId = (Number) parsed.get("user_id");
            String phone = (String) parsed.get("phone");
            return new Introspection(true, userId == null ? null : userId.longValue(), phone);
        } catch (Exception e) {
            log.warn("Introspection call failed: {}", e.getMessage());
            return Introspection.invalid();
        }
    }

    /**
     * POST a finished duel's result to Django. Best-effort: logs on failure but
     * does not throw (the in-memory match is already over).
     */
    public void postDuelResult(String matchId, long player1Id, long player2Id,
                               int player1Score, int player2Score,
                               Long winnerId, String subject) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("match_id", matchId);
            body.put("player1_id", player1Id);
            body.put("player2_id", player2Id);
            body.put("player1_score", player1Score);
            body.put("player2_score", player2Score);
            body.put("winner_id", winnerId); // null => draw
            body.put("subject", subject == null ? "" : subject);
            HttpResponse<String> resp = http.send(
                    internalRequest(duelResultUrl, mapper.writeValueAsString(body)).build(),
                    HttpResponse.BodyHandlers.ofString());
            log.info("Posted duel result to Django (match {}), status {}", matchId, resp.statusCode());
        } catch (Exception e) {
            log.error("Failed to post duel result for match {}: {}", matchId, e.getMessage());
        }
    }

    /**
     * POST a finished classroom quiz's final leaderboard to Django. Best-effort:
     * logs on failure but does not throw (the in-memory room is already over).
     *
     * @param participants ordered leaderboard rows, each a map of
     *                     {@code {user_id, name, score, rank}}.
     */
    public void postQuizResult(String roomCode, String title, long hostId,
                               java.util.List<Map<String, Object>> participants) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("room_code", roomCode);
            body.put("title", title == null ? "" : title);
            body.put("host_id", hostId);
            body.put("participants", participants);
            HttpResponse<String> resp = http.send(
                    internalRequest(quizResultUrl, mapper.writeValueAsString(body)).build(),
                    HttpResponse.BodyHandlers.ofString());
            log.info("Posted quiz result to Django (room {}), status {}", roomCode, resp.statusCode());
        } catch (Exception e) {
            log.error("Failed to post quiz result for room {}: {}", roomCode, e.getMessage());
        }
    }
}
