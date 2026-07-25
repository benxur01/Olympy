package uz.olympy.quiz.config;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import uz.olympy.duel.client.DjangoClient;
import uz.olympy.quiz.model.RoomState;
import uz.olympy.quiz.service.RoomService;

/**
 * Validates the quiz WebSocket handshake BEFORE the connection is accepted.
 * Reuses the exact same Django JWT introspection as the duel handshake
 * ({@link uz.olympy.duel.config.AuthHandshakeInterceptor}) — this service never
 * verifies tokens itself — but applies room-specific membership rules:
 * <ol>
 *   <li>Introspect the JWT — reject if invalid.</li>
 *   <li>Require a known {@code roomCode} — reject unknown rooms clearly.</li>
 *   <li>{@code role=host} must match the room's host user id; students may join
 *       any known room (including before it starts — the lobby).</li>
 * </ol>
 */
@Component
public class QuizAuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(QuizAuthHandshakeInterceptor.class);

    private final DjangoClient djangoClient;
    private final RoomService roomService;

    public QuizAuthHandshakeInterceptor(DjangoClient djangoClient, RoomService roomService) {
        this.djangoClient = djangoClient;
        this.roomService = roomService;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        Map<String, String> params = UriComponentsBuilder.fromUri(request.getURI())
                .build().getQueryParams().toSingleValueMap();
        String token = params.get("token");
        String roomCode = params.get("roomCode");
        String role = params.getOrDefault("role", "student");

        if (token == null || token.isBlank() || roomCode == null || roomCode.isBlank()) {
            log.info("Quiz handshake rejected: missing token or roomCode");
            return false;
        }

        DjangoClient.Introspection introspection = djangoClient.introspect(token);
        if (!introspection.valid() || introspection.userId() == null) {
            log.info("Quiz handshake rejected: token not valid");
            return false;
        }

        RoomState room = roomService.getRoom(roomCode);
        if (room == null) {
            log.info("Quiz handshake rejected: unknown room {}", roomCode);
            return false;
        }

        boolean isHost = "host".equals(role);
        if (isHost && !room.isHost(introspection.userId())) {
            log.info("Quiz handshake rejected: user {} is not the host of room {}",
                    introspection.userId(), room.roomCode);
            return false;
        }

        String name = params.get("name");
        if (name != null) {
            name = URLDecoder.decode(name, StandardCharsets.UTF_8);
        }

        attributes.put("userId", introspection.userId());
        attributes.put("roomCode", room.roomCode);
        attributes.put("role", isHost ? "host" : "student");
        attributes.put("name", name == null ? "" : name);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // no-op
    }
}
