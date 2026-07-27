package uz.olympy.quiz.ws;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import uz.olympy.quiz.model.RoomState;
import uz.olympy.quiz.service.RoomService;

/**
 * WebSocket endpoint handler for {@code /ws/quiz}. The handshake (auth + room
 * membership) is already enforced by
 * {@link uz.olympy.quiz.config.QuizAuthHandshakeInterceptor}; by the time we get
 * here, {@code userId}, {@code roomCode}, {@code role}, {@code name} and
 * {@code avatar} are trusted session attributes.
 *
 * <p>Host -> server: {@code {"type":"start|next|reveal|end"}}.
 * <p>Student -> server: {@code {"type":"answer","index":<int>,"answer":<value>}}
 * — {@code index} joriy savol indeksi, {@code answer} esa savol turiga qarab
 * o'zgaradi (turni klient {@code question} xabaridagi {@code questionType} dan
 * biladi):
 * <ul>
 *   <li>{@code mcq} — variant indeksi, int 0..3</li>
 *   <li>{@code true_false} — variant indeksi, int 0 yoki 1</li>
 *   <li>{@code type_answer} — o'quvchi yozgan matn (string)</li>
 *   <li>{@code slider} — tanlangan raqam (number)</li>
 * </ul>
 * Turga qarab ajratish {@link RoomService#onAnswer} da bajariladi — savol turi
 * u yerda mavjud, shu sababli bu handler xom JSON qiymatni uzatadi.
 */
@Component
public class QuizWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(QuizWebSocketHandler.class);

    private final RoomService roomService;
    private final ObjectMapper mapper = new ObjectMapper();

    public QuizWebSocketHandler(RoomService roomService) {
        this.roomService = roomService;
    }

    private long userId(WebSocketSession session) {
        return (Long) session.getAttributes().get("userId");
    }

    private boolean isHost(WebSocketSession session) {
        return "host".equals(session.getAttributes().get("role"));
    }

    private RoomState room(WebSocketSession session) {
        String roomCode = (String) session.getAttributes().get("roomCode");
        return roomService.getRoom(roomCode);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        RoomState room = room(session);
        if (room == null) {
            safeClose(session);
            return;
        }
        if (isHost(session)) {
            roomService.onHostConnect(room, session);
        } else {
            String name = (String) session.getAttributes().get("name");
            String avatar = (String) session.getAttributes().get("avatar");
            roomService.onStudentConnect(room, userId(session), name, avatar, session);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        RoomState room = room(session);
        if (room == null) {
            return;
        }
        try {
            JsonNode node = mapper.readTree(message.getPayload());
            String type = node.path("type").asText("");
            if (isHost(session)) {
                // start / next / reveal / end
                roomService.onHostCommand(room, userId(session), type);
            } else if ("answer".equals(type)) {
                int index = node.path("index").asInt(-1);
                roomService.onAnswer(room, userId(session), index, node.path("answer"));
            }
        } catch (Exception e) {
            log.warn("Bad quiz message from session {}: {}", session.getId(), e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        RoomState room = room(session);
        if (room == null) {
            return;
        }
        if (isHost(session)) {
            // Keep room alive; the host may reconnect its big-screen socket.
            if (room.hostSession == session) {
                room.hostSession = null;
            }
        } else {
            roomService.onStudentDisconnect(room, userId(session), session);
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
