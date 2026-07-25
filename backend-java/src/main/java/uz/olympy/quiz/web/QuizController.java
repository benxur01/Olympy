package uz.olympy.quiz.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import uz.olympy.duel.client.DjangoClient;
import uz.olympy.quiz.model.QuizQuestion;
import uz.olympy.quiz.model.RoomState;
import uz.olympy.quiz.service.RoomService;

/**
 * REST entry points for the live classroom quiz.
 *
 * <ul>
 *   <li>{@code POST /api/quiz/rooms} — the host posts its JWT + question set and
 *       gets back a short human-typeable room code. The host then opens the
 *       WebSocket at {@code /ws/quiz?token=<jwt>&roomCode=<code>&role=host}.</li>
 *   <li>{@code GET /api/quiz/rooms/{code}} — a lightweight existence/status probe
 *       so the student join screen can show a clear "no such room" message
 *       before attempting the (auth-gated) WebSocket handshake.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/quiz")
public class QuizController {

    private final DjangoClient djangoClient;
    private final RoomService roomService;

    public QuizController(DjangoClient djangoClient, RoomService roomService) {
        this.djangoClient = djangoClient;
        this.roomService = roomService;
    }

    @PostMapping("/rooms")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> createRoom(@RequestBody Map<String, Object> body) {
        String token = body.get("token") == null ? "" : String.valueOf(body.get("token"));

        DjangoClient.Introspection introspection = djangoClient.introspect(token);
        if (!introspection.valid() || introspection.userId() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("detail", "Invalid token"));
        }

        String title = body.get("title") == null ? "" : String.valueOf(body.get("title")).trim();
        if (title.isEmpty()) {
            title = "Jonli viktorina";
        }

        Object rawQuestions = body.get("questions");
        if (!(rawQuestions instanceof List) || ((List<?>) rawQuestions).isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("detail", "questions bo'sh bo'lmasligi kerak"));
        }

        List<QuizQuestion> questions = new ArrayList<>();
        for (Object o : (List<Object>) rawQuestions) {
            if (!(o instanceof Map)) {
                return ResponseEntity.badRequest().body(Map.of("detail", "Har bir savol obyekt bo'lishi kerak"));
            }
            Map<String, Object> qm = (Map<String, Object>) o;
            String text = qm.get("text") == null ? "" : String.valueOf(qm.get("text")).trim();
            Object rawOptions = qm.get("options");
            if (text.isEmpty() || !(rawOptions instanceof List) || ((List<?>) rawOptions).size() != 4) {
                return ResponseEntity.badRequest()
                        .body(Map.of("detail", "Har bir savolda matn va aynan 4 ta variant bo'lishi kerak"));
            }
            List<String> options = new ArrayList<>();
            for (Object opt : (List<Object>) rawOptions) {
                options.add(opt == null ? "" : String.valueOf(opt));
            }
            int correctIndex = toInt(qm.get("correctIndex"), -1);
            if (correctIndex < 0 || correctIndex > 3) {
                return ResponseEntity.badRequest()
                        .body(Map.of("detail", "correctIndex 0..3 oralig'ida bo'lishi kerak"));
            }
            int timeLimit = toInt(qm.get("timeLimitSeconds"), 20);
            if (timeLimit < 5) {
                timeLimit = 5;
            } else if (timeLimit > 120) {
                timeLimit = 120;
            }
            questions.add(new QuizQuestion(text, options, correctIndex, timeLimit));
        }

        RoomState room = roomService.createRoom(introspection.userId(), title, questions);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("roomCode", room.roomCode);
        resp.put("hostId", room.hostUserId);
        resp.put("title", room.title);
        resp.put("totalQuestions", questions.size());
        return ResponseEntity.status(HttpStatus.CREATED).body(resp);
    }

    @GetMapping("/rooms/{code}")
    public ResponseEntity<Map<String, Object>> roomStatus(@PathVariable String code) {
        RoomState room = roomService.getRoom(code);
        if (room == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("exists", false, "detail", "Bunday xona topilmadi"));
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("exists", true);
        resp.put("roomCode", room.roomCode);
        resp.put("title", room.title);
        resp.put("started", room.started);
        resp.put("finished", room.finished);
        return ResponseEntity.ok(resp);
    }

    private static int toInt(Object value, int fallback) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception e) {
            return fallback;
        }
    }
}
