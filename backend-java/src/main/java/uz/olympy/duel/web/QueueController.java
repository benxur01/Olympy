package uz.olympy.duel.web;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import uz.olympy.duel.client.DjangoClient;
import uz.olympy.duel.service.MatchmakingService;

/**
 * Matchmaking REST entry point. A client posts its JWT here to join the queue;
 * when paired, it receives a {@code matchId} and then opens the WebSocket at
 * {@code /ws/duel?token=<jwt>&matchId=<id>}.
 */
@RestController
@RequestMapping("/api/duel")
public class QueueController {

    private final DjangoClient djangoClient;
    private final MatchmakingService matchmaking;

    public QueueController(DjangoClient djangoClient, MatchmakingService matchmaking) {
        this.djangoClient = djangoClient;
        this.matchmaking = matchmaking;
    }

    /**
     * POST /api/duel/queue — body: {@code {"token":"<jwt>","subject":"<optional>"}}.
     * Returns {@code {status:"waiting"}} or {@code {status:"matched", matchId, userId}}.
     */
    @PostMapping("/queue")
    public ResponseEntity<Map<String, Object>> queue(@RequestBody Map<String, Object> body) {
        String token = body.get("token") == null ? "" : String.valueOf(body.get("token"));
        String subject = body.get("subject") == null ? "" : String.valueOf(body.get("subject"));

        DjangoClient.Introspection introspection = djangoClient.introspect(token);
        if (!introspection.valid() || introspection.userId() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("detail", "Invalid token"));
        }

        long userId = introspection.userId();
        MatchmakingService.QueueResult result = matchmaking.enqueue(userId, subject);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("status", result.status());
        resp.put("userId", userId);
        if (result.matchId() != null) {
            resp.put("matchId", result.matchId());
        }
        return ResponseEntity.ok(resp);
    }
}
