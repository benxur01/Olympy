package uz.olympy.duel.config;

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
import uz.olympy.duel.model.MatchState;
import uz.olympy.duel.service.MatchmakingService;

/**
 * Validates the WebSocket handshake BEFORE the connection is accepted:
 * <ol>
 *   <li>Extract the JWT from the {@code token} query param.</li>
 *   <li>Introspect it against Django — reject if invalid.</li>
 *   <li>Require a {@code matchId} the user actually belongs to.</li>
 * </ol>
 * On success, {@code userId} and {@code matchId} are stashed in the session
 * attributes for the handler.
 */
@Component
public class AuthHandshakeInterceptor implements HandshakeInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuthHandshakeInterceptor.class);

    private final DjangoClient djangoClient;
    private final MatchmakingService matchmaking;

    public AuthHandshakeInterceptor(DjangoClient djangoClient, MatchmakingService matchmaking) {
        this.djangoClient = djangoClient;
        this.matchmaking = matchmaking;
    }

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        Map<String, String> params = UriComponentsBuilder.fromUri(request.getURI())
                .build().getQueryParams().toSingleValueMap();
        String token = params.get("token");
        String matchId = params.get("matchId");

        if (token == null || token.isBlank() || matchId == null || matchId.isBlank()) {
            log.info("Handshake rejected: missing token or matchId");
            return false;
        }

        DjangoClient.Introspection introspection = djangoClient.introspect(token);
        if (!introspection.valid() || introspection.userId() == null) {
            log.info("Handshake rejected: token not valid");
            return false;
        }

        MatchState match = matchmaking.getMatch(matchId);
        if (match == null || !match.isParticipant(introspection.userId())) {
            log.info("Handshake rejected: user {} not a participant of match {}",
                    introspection.userId(), matchId);
            return false;
        }

        attributes.put("userId", introspection.userId());
        attributes.put("matchId", matchId);
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
        // no-op
    }
}
