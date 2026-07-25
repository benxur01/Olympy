package uz.olympy.quiz.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.fasterxml.jackson.databind.ObjectMapper;

import uz.olympy.duel.client.DjangoClient;
import uz.olympy.quiz.model.QuizQuestion;
import uz.olympy.quiz.model.RoomState;

/**
 * Runs live "Kahoot-style" classroom quizzes: the host creates a room with a
 * set of questions, students join over a WebSocket with the room code, and the
 * host drives the flow (start -> question -> reveal -> next -> ... -> final
 * podium). Scoring copies Kahoot's shape: full points for an instant correct
 * answer, decaying toward a 50% floor as the timer elapses, zero for wrong.
 *
 * <p>All state is in-memory in a {@link java.util.concurrent.ConcurrentHashMap}
 * (single instance, v1). On completion the final leaderboard is POSTed to
 * Django (source of truth) and the room is discarded.
 */
@Service
public class RoomService {

    private static final Logger log = LoggerFactory.getLogger(RoomService.class);

    /** Max points for an instant correct answer, per Kahoot. */
    private static final int MAX_POINTS = 1000;
    /** How many entries the leaderboard broadcasts carry. */
    private static final int LEADERBOARD_TOP_N = 10;
    /** Unambiguous room-code alphabet (no 0/O/1/I to avoid typos). */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final int CODE_LENGTH = 6;

    private final DjangoClient djangoClient;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

    /** roomCode -> live room state. */
    private final Map<String, RoomState> rooms = new java.util.concurrent.ConcurrentHashMap<>();

    public RoomService(DjangoClient djangoClient) {
        this.djangoClient = djangoClient;
    }

    // ─── Room lifecycle ──────────────────────────────────────────────────────

    /** Create a room owned by {@code hostUserId}. Returns the generated code. */
    public synchronized RoomState createRoom(long hostUserId, String title, List<QuizQuestion> questions) {
        String code = uniqueCode();
        RoomState room = new RoomState(code, hostUserId, title, questions);
        rooms.put(code, room);
        log.info("Quiz room {} created by host {} with {} questions", code, hostUserId, questions.size());
        return room;
    }

    public RoomState getRoom(String roomCode) {
        return roomCode == null ? null : rooms.get(roomCode.toUpperCase());
    }

    private String uniqueCode() {
        for (int attempt = 0; attempt < 50; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET[ThreadLocalRandom.current().nextInt(CODE_ALPHABET.length)]);
            }
            String code = sb.toString();
            if (!rooms.containsKey(code)) {
                return code;
            }
        }
        // Astronomically unlikely; fall back to a longer random code.
        return "Q" + Long.toString(System.nanoTime(), 36).toUpperCase();
    }

    // ─── Connections ─────────────────────────────────────────────────────────

    /** Register the host's big-screen socket and send them the current state. */
    public void onHostConnect(RoomState room, WebSocketSession session) {
        synchronized (room) {
            room.hostSession = session;
            sendTo(session, hostStatePayload(room));
        }
    }

    /** Register a student's socket; put them in the lobby (or the live question). */
    public void onStudentConnect(RoomState room, long userId, String name, WebSocketSession session) {
        synchronized (room) {
            room.studentSessions.put(userId, session);
            room.names.put(userId, (name == null || name.isBlank()) ? ("O'quvchi #" + userId) : name.trim());
            room.totalScores.putIfAbsent(userId, 0);

            Map<String, Object> welcome = new LinkedHashMap<>();
            welcome.put("type", "joined");
            welcome.put("roomCode", room.roomCode);
            welcome.put("title", room.title);
            welcome.put("started", room.started);
            welcome.put("totalQuestions", room.questions.size());
            welcome.put("name", room.names.get(userId));
            welcome.put("userId", userId);
            sendTo(session, welcome);

            // If they joined mid-question (reconnect / late), catch them up.
            if (room.started && !room.finished && room.currentIndex >= 0 && !room.revealed) {
                sendTo(session, questionPayload(room));
            }

            broadcastLobby(room);
        }
    }

    public void onStudentDisconnect(RoomState room, long userId, WebSocketSession session) {
        synchronized (room) {
            room.studentSessions.remove(userId, session);
            broadcastLobby(room);
        }
    }

    // ─── Host controls (start / reveal / next / end) ───────────────────────────

    public void onHostCommand(RoomState room, long userId, String command) {
        synchronized (room) {
            if (!room.isHost(userId) || room.finished) {
                return;
            }
            switch (command) {
                case "start" -> { if (!room.started) startQuiz(room); }
                // "next": reveal the live question if it hasn't been revealed yet,
                // otherwise advance to the next question. One button, two meanings —
                // lets the host cut a question short and then move on.
                case "next" -> {
                    if (!room.started) {
                        return;
                    }
                    if (!room.revealed) {
                        reveal(room);
                    } else {
                        advance(room);
                    }
                }
                case "reveal" -> { if (room.started && !room.revealed) reveal(room); }
                case "end" -> finish(room);
                default -> log.debug("Unknown host command '{}' for room {}", command, room.roomCode);
            }
        }
    }

    private void startQuiz(RoomState room) {
        room.started = true;
        room.currentIndex = -1;
        broadcast(room, Map.of(
                "type", "quiz_start",
                "roomCode", room.roomCode,
                "totalQuestions", room.questions.size()));
        advance(room);
    }

    /** Move to the next question, or finish if the last one was already revealed. Caller holds the lock. */
    private void advance(RoomState room) {
        if (room.finished) {
            return;
        }
        room.currentIndex++;
        if (room.currentIndex >= room.questions.size()) {
            finish(room);
            return;
        }
        room.revealed = false;
        room.answeredThisRound.clear();
        room.roundPoints.clear();
        room.roundCorrect.clear();
        room.questionStartMillis = System.currentTimeMillis();
        broadcast(room, questionPayload(room));

        final int scheduledIndex = room.currentIndex;
        int timeLimit = Math.max(1, room.questions.get(scheduledIndex).timeLimitSeconds());
        room.questionTimer = scheduler.schedule(() -> {
            synchronized (room) {
                if (!room.finished && room.currentIndex == scheduledIndex && !room.revealed) {
                    reveal(room);
                }
            }
        }, timeLimit, TimeUnit.SECONDS);
    }

    /** Handle a student's answer. Ignores stale/duplicate answers safely. */
    public void onAnswer(RoomState room, long userId, int questionIndex, int answerIndex) {
        synchronized (room) {
            if (room.finished || !room.started || room.revealed) {
                return;
            }
            if (questionIndex != room.currentIndex) {
                return; // stale answer for a past/future question
            }
            if (!room.answeredThisRound.add(userId)) {
                return; // already answered this round
            }
            QuizQuestion q = room.questions.get(room.currentIndex);
            boolean correct = (answerIndex == q.correctIndex());
            long elapsedMs = System.currentTimeMillis() - room.questionStartMillis;
            int points = correct ? pointsFor(elapsedMs, q.timeLimitSeconds()) : 0;

            room.roundCorrect.put(userId, correct);
            room.roundPoints.put(userId, points);
            room.totalScores.merge(userId, points, Integer::sum);

            // Kahoot-style: the student only learns "answer received" now; the
            // correct/incorrect reveal + points come when the round ends.
            sendTo(room.studentSessions.get(userId), Map.of(
                    "type", "answer_received",
                    "index", questionIndex));

            // Tell the host the live "X of Y answered" counter.
            sendTo(room.hostSession, Map.of(
                    "type", "answer_count",
                    "index", questionIndex,
                    "answered", room.answeredThisRound.size(),
                    "total", room.studentSessions.size()));

            if (!room.studentSessions.isEmpty() && room.answeredThisRound.size() >= room.studentSessions.size()) {
                reveal(room); // everyone answered — reveal early
            }
        }
    }

    /**
     * Kahoot scoring: full {@link #MAX_POINTS} for an instant correct answer,
     * decaying linearly to a 50% floor as the timer elapses.
     * {@code points = round(MAX * (1 - (responseTime / timeLimit) / 2))}.
     */
    private int pointsFor(long elapsedMs, int timeLimitSeconds) {
        double limitMs = Math.max(1, timeLimitSeconds) * 1000.0;
        double fraction = Math.min(1.0, Math.max(0.0, elapsedMs / limitMs));
        return (int) Math.round(MAX_POINTS * (1.0 - fraction / 2.0));
    }

    /** Reveal the current question's results to everyone. Caller holds the lock. */
    private void reveal(RoomState room) {
        if (room.revealed || room.finished || room.currentIndex < 0) {
            return;
        }
        room.revealed = true;
        if (room.questionTimer != null) {
            room.questionTimer.cancel(false);
        }
        QuizQuestion q = room.questions.get(room.currentIndex);

        // Per-student result (their own correctness + points + running total).
        for (Map.Entry<Long, WebSocketSession> entry : room.studentSessions.entrySet()) {
            long uid = entry.getKey();
            boolean correct = room.roundCorrect.getOrDefault(uid, false);
            int gained = room.roundPoints.getOrDefault(uid, 0);
            int total = room.totalScores.getOrDefault(uid, 0);
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("type", "question_result");
            payload.put("index", room.currentIndex);
            payload.put("correct", correct);
            payload.put("answered", room.answeredThisRound.contains(uid));
            payload.put("correctIndex", q.correctIndex());
            payload.put("pointsThisRound", gained);
            payload.put("totalScore", total);
            payload.put("rank", rankOf(room, uid));
            sendTo(entry.getValue(), payload);
        }

        // Aggregate leaderboard + correct answer for the host big-screen.
        Map<String, Object> hostPayload = new LinkedHashMap<>();
        hostPayload.put("type", "reveal");
        hostPayload.put("index", room.currentIndex);
        hostPayload.put("correctIndex", q.correctIndex());
        hostPayload.put("isLast", room.currentIndex >= room.questions.size() - 1);
        hostPayload.put("leaderboard", leaderboard(room, LEADERBOARD_TOP_N));
        sendTo(room.hostSession, hostPayload);
    }

    private void finish(RoomState room) {
        if (room.finished) {
            return;
        }
        room.finished = true;
        if (room.questionTimer != null) {
            room.questionTimer.cancel(false);
        }
        List<Map<String, Object>> full = leaderboard(room, Integer.MAX_VALUE);
        broadcast(room, Map.of(
                "type", "final",
                "roomCode", room.roomCode,
                "title", room.title,
                "leaderboard", full));

        // Persist the finished quiz to Django (source of truth). Best-effort.
        List<Map<String, Object>> participants = new ArrayList<>();
        for (Map<String, Object> row : full) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("user_id", row.get("userId"));
            p.put("name", row.get("name"));
            p.put("score", row.get("score"));
            p.put("rank", row.get("rank"));
            participants.add(p);
        }
        djangoClient.postQuizResult(room.roomCode, room.title, room.hostUserId, participants);

        rooms.remove(room.roomCode);
        log.info("Quiz room {} finished with {} participants", room.roomCode, participants.size());
    }

    // ─── Leaderboard helpers ───────────────────────────────────────────────────

    /** Descending-by-score leaderboard rows: {rank, userId, name, score}. */
    private List<Map<String, Object>> leaderboard(RoomState room, int limit) {
        List<Long> ordered = new ArrayList<>(room.totalScores.keySet());
        ordered.sort(Comparator.comparingInt((Long id) -> room.totalScores.getOrDefault(id, 0)).reversed());
        List<Map<String, Object>> rows = new ArrayList<>();
        int rank = 0;
        for (Long uid : ordered) {
            if (rows.size() >= limit) {
                break;
            }
            rank++;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rank", rank);
            row.put("userId", uid);
            row.put("name", room.names.getOrDefault(uid, "O'quvchi #" + uid));
            row.put("score", room.totalScores.getOrDefault(uid, 0));
            rows.add(row);
        }
        return rows;
    }

    /** 1-based rank of a single student by current total score. */
    private int rankOf(RoomState room, long userId) {
        int myScore = room.totalScores.getOrDefault(userId, 0);
        int rank = 1;
        for (Map.Entry<Long, Integer> e : room.totalScores.entrySet()) {
            if (e.getValue() > myScore) {
                rank++;
            }
        }
        return rank;
    }

    // ─── Payload builders / transport ──────────────────────────────────────────

    private Map<String, Object> questionPayload(RoomState room) {
        QuizQuestion q = room.questions.get(room.currentIndex);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "question");
        payload.put("index", room.currentIndex);
        payload.put("totalQuestions", room.questions.size());
        payload.put("text", q.text());
        payload.put("options", q.options());
        payload.put("timeLimitSeconds", q.timeLimitSeconds());
        return payload;
    }

    private Map<String, Object> hostStatePayload(RoomState room) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "host_state");
        payload.put("roomCode", room.roomCode);
        payload.put("title", room.title);
        payload.put("started", room.started);
        payload.put("finished", room.finished);
        payload.put("totalQuestions", room.questions.size());
        payload.put("participants", lobbyNames(room));
        return payload;
    }

    private void broadcastLobby(RoomState room) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "lobby");
        payload.put("count", room.studentSessions.size());
        payload.put("participants", lobbyNames(room));
        sendTo(room.hostSession, payload);
    }

    private List<String> lobbyNames(RoomState room) {
        List<String> out = new ArrayList<>();
        for (Long uid : room.studentSessions.keySet()) {
            out.add(room.names.getOrDefault(uid, "O'quvchi #" + uid));
        }
        return out;
    }

    private void broadcast(RoomState room, Map<String, Object> message) {
        sendTo(room.hostSession, message);
        for (WebSocketSession s : room.studentSessions.values()) {
            sendTo(s, message);
        }
    }

    private void sendTo(WebSocketSession session, Map<String, Object> message) {
        if (session == null || !session.isOpen()) {
            return;
        }
        try {
            session.sendMessage(new TextMessage(mapper.writeValueAsString(message)));
        } catch (IOException e) {
            log.warn("Failed to send message to session {}: {}", session.getId(), e.getMessage());
        }
    }
}
