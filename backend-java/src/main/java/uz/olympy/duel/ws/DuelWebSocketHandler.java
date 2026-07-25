package uz.olympy.duel.ws;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import uz.olympy.duel.model.MatchState;
import uz.olympy.duel.service.DuelService;
import uz.olympy.duel.service.MatchmakingService;

/**
 * WebSocket endpoint handler for {@code /ws/duel}. The handshake (auth + match
 * membership) is already enforced by {@link uz.olympy.duel.config.AuthHandshakeInterceptor};
 * by the time we get here, {@code userId} and {@code matchId} are trusted
 * session attributes.
 *
 * <p>Client -> server messages: {@code {"type":"answer","index":<int>,"answer":<int>}}.
 */
@Component
public class DuelWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(DuelWebSocketHandler.class);

    private final MatchmakingService matchmaking;
    private final DuelService duelService;
    private final ObjectMapper mapper = new ObjectMapper();

    public DuelWebSocketHandler(MatchmakingService matchmaking, DuelService duelService) {
        this.matchmaking = matchmaking;
        this.duelService = duelService;
    }

    private long userId(WebSocketSession session) {
        return (Long) session.getAttributes().get("userId");
    }

    private MatchState match(WebSocketSession session) {
        String matchId = (String) session.getAttributes().get("matchId");
        return matchmaking.getMatch(matchId);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        MatchState match = match(session);
        if (match == null) {
            safeClose(session);
            return;
        }
        duelService.onConnect(match, userId(session), session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        MatchState match = match(session);
        if (match == null) {
            return;
        }
        try {
            JsonNode node = mapper.readTree(message.getPayload());
            String type = node.path("type").asText("");
            if ("answer".equals(type)) {
                int index = node.path("index").asInt(-1);
                int answer = node.path("answer").asInt(-1);
                duelService.onAnswer(match, userId(session), index, answer);
            }
        } catch (Exception e) {
            log.warn("Bad message from session {}: {}", session.getId(), e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        MatchState match = match(session);
        if (match != null) {
            match.sessions.remove(userId(session), session);
        }
    }

    private void safeClose(WebSocketSession session) {
        try {
            session.close(CloseStatus.SERVER_ERROR);
        } catch (Exception ignored) {
            // best effort
        }
    }
}
