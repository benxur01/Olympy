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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PostConstruct;
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
 * <p>Rooms are served from an in-memory {@link java.util.concurrent.ConcurrentHashMap}
 * and mirrored into Redis by {@link RoomStore} after every mutation, so a crash
 * or redeploy no longer drops running quizzes: {@link #restorePersistedRooms()}
 * reloads them at startup and reschedules the pending reveal timers, and the
 * clients reconnect on their own. Single instance still — Redis is durability,
 * not coordination; two instances must not own the same rooms. On completion the
 * final leaderboard is POSTed to Django (source of truth).
 */
@Service
public class RoomService {

    private static final Logger log = LoggerFactory.getLogger(RoomService.class);

    /** Max points for an instant correct answer, per Kahoot. */
    private static final int MAX_POINTS = 1000;
    /** How many entries the leaderboard broadcasts carry. */
    private static final int LEADERBOARD_TOP_N = 10;

    // Room codes are PURE DIGITS, exactly like a Kahoot game PIN: the join
    // screen can then open the phone's numeric keypad instead of the full
    // QWERTY keyboard, which is where most mistyped codes came from. The range
    // deliberately starts at 100000 so every code is 6 digits with no leading
    // zero — a leading zero is the one digit a student reliably drops when
    // copying the code off the teacher's screen.
    private static final int CODE_MIN = 100_000;
    private static final int CODE_MAX = 999_999;
    private static final int CODE_SPACE = CODE_MAX - CODE_MIN + 1; // 900_000

    /** How long a finished room stays joinable before it is discarded. */
    private static final long FINISHED_GRACE_MS = TimeUnit.MINUTES.toMillis(5);
    /**
     * How long a room with no activity at all survives before it is discarded.
     * Also the TTL {@link RoomStore} puts on the Redis copy — the two must not
     * drift apart, so they read the same constant.
     */
    static final long IDLE_ROOM_TTL_MS = TimeUnit.HOURS.toMillis(4);
    /** How often abandoned/finished rooms are swept. */
    private static final long SWEEP_INTERVAL_MS = TimeUnit.MINUTES.toMillis(5);

    private final DjangoClient djangoClient;
    private final RoomStore roomStore;
    private final ObjectMapper mapper = new ObjectMapper();
    // 3 threads: per-question auto-reveal timers plus the periodic room sweep.
    // The sweep briefly takes each room's lock, and finish() holds that lock
    // across a (bounded) HTTP call to Django, so the sweep must never be able
    // to starve a question timer.
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(3);

    /** roomCode -> live room state. */
    private final Map<String, RoomState> rooms = new java.util.concurrent.ConcurrentHashMap<>();

    public RoomService(DjangoClient djangoClient, RoomStore roomStore) {
        this.djangoClient = djangoClient;
        this.roomStore = roomStore;
        // Rooms were only ever removed by finish(), so a host who just closed
        // the tab left the room in this map forever: the memory never came
        // back and, worse, the stale code still passed the join probe — a
        // student typing yesterday's code landed in a lobby whose host was
        // long gone and waited there indefinitely.
        scheduler.scheduleWithFixedDelay(this::sweepDeadRooms,
                SWEEP_INTERVAL_MS, SWEEP_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }

    /**
     * Bring back the rooms this service was running before it restarted. A
     * deploy (or a crash) used to end every live quiz instantly: the map was
     * empty, so reconnecting students got "no such room" mid-lesson.
     *
     * <p>A room caught mid-question also lost its auto-reveal timer with the old
     * scheduler, so the question would hang until the host pressed a button —
     * the timer is therefore rescheduled for whatever is left of the answer
     * window (0 = reveal immediately, i.e. the window elapsed while we were down).
     */
    @PostConstruct
    void restorePersistedRooms() {
        List<RoomState> restored = roomStore.loadAll();
        if (restored.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        for (RoomState room : restored) {
            rooms.put(room.roomCode, room);
            if (room.started && !room.finished && !room.revealed
                    && room.currentIndex >= 0 && room.currentIndex < room.questions.size()) {
                long remainingMs = Math.max(0L,
                        room.questionStartMillis + questionWindowMillis(room, room.currentIndex) - now);
                scheduleReveal(room, room.currentIndex, remainingMs);
            }
        }
        log.info("Restored {} quiz room(s) from Redis", restored.size());
    }

    // ─── Room lifecycle ──────────────────────────────────────────────────────

    /** Create a room owned by {@code hostUserId}. Returns the generated code. */
    public synchronized RoomState createRoom(long hostUserId, String title, List<QuizQuestion> questions) {
        String code = uniqueCode();
        RoomState room = new RoomState(code, hostUserId, title, questions);
        rooms.put(code, room);
        roomStore.save(room);
        log.info("Quiz room {} created by host {} with {} questions", code, hostUserId, questions.size());
        return room;
    }

    public RoomState getRoom(String roomCode) {
        if (roomCode == null) {
            return null;
        }
        // Trim only: codes are digits, so there is no case to fold. A stray
        // space (query strings and copy-pasted codes pick them up easily) used
        // to be reported to the student as "no such room".
        return rooms.get(roomCode.trim());
    }

    /**
     * Free 6-digit code. Random first — with at most a few hundred live rooms
     * against 900k codes the first draw practically always wins.
     */
    private String uniqueCode() {
        for (int attempt = 0; attempt < 50; attempt++) {
            String code = Integer.toString(ThreadLocalRandom.current().nextInt(CODE_MIN, CODE_MAX + 1));
            if (!rooms.containsKey(code)) {
                return code;
            }
        }
        // Effectively unreachable — it needs the code space to be nearly full.
        // Probe sequentially from a random offset rather than switching to a
        // wider alphabet: the join screen accepts digits only, so the letter
        // code this branch used to return could not be typed in at all.
        int start = ThreadLocalRandom.current().nextInt(CODE_SPACE);
        for (int i = 0; i < CODE_SPACE; i++) {
            String code = Integer.toString(CODE_MIN + (start + i) % CODE_SPACE);
            if (!rooms.containsKey(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Bo'sh xona kodi qolmadi");
    }

    /**
     * Discards rooms nobody can use any more: finished ones past their grace
     * window (see {@link #finish}) and rooms that saw no activity for hours
     * because the host closed the tab without ending the quiz.
     */
    private void sweepDeadRooms() {
        try {
            long now = System.currentTimeMillis();
            rooms.values().removeIf(room -> {
                synchronized (room) {
                    boolean expired = room.finished
                            ? now - room.finishedAtMillis > FINISHED_GRACE_MS
                            : now - room.lastActivityMillis > IDLE_ROOM_TTL_MS;
                    if (expired) {
                        log.info("Discarding {} quiz room {}", room.finished ? "finished" : "abandoned", room.roomCode);
                        // Drop the Redis copy too, or the next restart would
                        // rehydrate a room this sweep just decided is dead.
                        roomStore.delete(room.roomCode);
                    }
                    return expired;
                }
            });
        } catch (Exception e) {
            // Never let a sweep failure kill the scheduled task.
            log.warn("Quiz room sweep failed: {}", e.getMessage());
        }
    }

    // ─── Connections ─────────────────────────────────────────────────────────

    /** Register the host's big-screen socket and send them the current state. */
    public void onHostConnect(RoomState room, WebSocketSession session) {
        synchronized (room) {
            room.touch();
            room.hostSession = session;
            sendTo(session, hostStatePayload(room));
            roomStore.save(room);
        }
    }

    /** Register a student's socket; put them in the lobby (or the live question). */
    public void onStudentConnect(RoomState room, long userId, String name, String avatar, WebSocketSession session) {
        synchronized (room) {
            room.touch();

            // Reconnecting into an already-finished room (the socket dropped
            // while the last round was being scored): replay the podium and
            // change nothing else — a newcomer must not be appended to a
            // leaderboard that was already posted to Django. Without this the
            // student stayed on the "next question soon" screen with a red
            // "connection lost" banner and never saw their final place: the
            // room used to be dropped the instant the quiz ended, so every
            // reconnect attempt was refused.
            if (room.finished) {
                sendTo(session, finalPayload(room));
                return;
            }

            room.studentSessions.put(userId, session);
            room.names.put(userId, (name == null || name.isBlank()) ? ("O'quvchi #" + userId) : name.trim());
            // Avatar ixtiyoriy: eski klient yubormasa bo'sh qoladi va host
            // ekranida zaxira belgi ko'rsatiladi.
            room.avatars.put(userId, avatar == null ? "" : avatar.trim());
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
            if (room.started && room.currentIndex >= 0 && !room.revealed) {
                sendTo(session, questionPayload(room));
            }

            broadcastLobby(room);
            roomStore.save(room);
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
            room.touch();
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
            roomStore.save(room);
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

        scheduleReveal(room, room.currentIndex, questionWindowMillis(room, room.currentIndex));
    }

    /** The answer window of one question, in millis. The single source for it. */
    private long questionWindowMillis(RoomState room, int index) {
        return TimeUnit.SECONDS.toMillis(Math.max(1, room.questions.get(index).timeLimitSeconds()));
    }

    /**
     * Arm the auto-reveal timer for {@code scheduledIndex}. {@code delayMillis}
     * is the full answer window for a fresh question, or whatever is left of it
     * for a room rehydrated after a restart.
     */
    private void scheduleReveal(RoomState room, int scheduledIndex, long delayMillis) {
        room.questionTimer = scheduler.schedule(() -> {
            synchronized (room) {
                if (!room.finished && room.currentIndex == scheduledIndex && !room.revealed) {
                    reveal(room);
                    roomStore.save(room);
                }
            }
        }, delayMillis, TimeUnit.MILLISECONDS);
    }

    /**
     * Handle a student's answer. Ignores stale/duplicate answers safely.
     *
     * <p>{@code answer} — {@code {"type":"answer",...}} xabaridagi xom
     * {@code answer} qiymati (int / string / number). Turga qarab ajratish
     * {@link #isCorrect} da — WebSocket handler'da takrorlanmasligi uchun.
     */
    public void onAnswer(RoomState room, long userId, int questionIndex, JsonNode answer) {
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
            room.touch();
            QuizQuestion q = room.questions.get(room.currentIndex);
            boolean correct = isCorrect(q, answer);
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
            roomStore.save(room);
        }
    }

    /**
     * Savol turiga qarab javobning to'g'riligini tekshiradi. Har bir tur uchun
     * xom JSON qiymatdan kerakli tipni o'zi ajratib oladi.
     *
     * <ul>
     *   <li>mcq / true_false — variant indeksi (int) aynan mos kelishi kerak</li>
     *   <li>type_answer — normalizatsiyadan (trim, kichik harf, ichki bo'shliqlar
     *       bittaga) keyin ruxsat etilgan javoblardan biriga mos kelishi kerak</li>
     *   <li>slider — |javob - to'g'ri qiymat| &lt;= tolerance</li>
     * </ul>
     */
    private boolean isCorrect(QuizQuestion q, JsonNode answer) {
        if (answer == null || answer.isNull() || answer.isMissingNode()) {
            return false;
        }
        switch (q.type()) {
            case QuizQuestion.TYPE_TYPE_ANSWER -> {
                String submitted = normalizeText(answer.asText(""));
                if (submitted.isEmpty() || q.acceptableAnswers() == null) {
                    return false;
                }
                for (String candidate : q.acceptableAnswers()) {
                    if (submitted.equals(normalizeText(candidate))) {
                        return true;
                    }
                }
                return false;
            }
            case QuizQuestion.TYPE_SLIDER -> {
                // 1-bosqichda ataylab soddalashtirilgan baholash: tolerance
                // ichida bo'lsa to'g'ri, aks holda xato (Kahoot'dagi masofaga
                // proporsional ball keyingi bosqichga qoldirildi).
                if (q.correctValue() == null) {
                    return false;
                }
                double submitted = answer.asDouble(Double.NaN);
                if (Double.isNaN(submitted)) {
                    return false;
                }
                int tolerance = q.tolerance() == null ? 0 : q.tolerance();
                return Math.abs(submitted - q.correctValue()) <= tolerance;
            }
            default -> {
                // mcq / true_false — indeks solishtirish. `asInt` avvalgi
                // (bir turli) mantiq bilan aynan bir xil ishlaydi, shu sababli
                // mavjud 4 variantli test yo'li o'zgarmaydi.
                return answer.asInt(-1) == q.correctIndex();
            }
        }
    }

    /** type_answer solishtirish normalizatsiyasi: trim + kichik harf + bitta bo'shliq. */
    private static String normalizeText(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().toLowerCase().replaceAll("\\s+", " ");
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
            putCorrectAnswer(payload, q);
            payload.put("pointsThisRound", gained);
            payload.put("totalScore", total);
            payload.put("rank", rankOf(room, uid));
            sendTo(entry.getValue(), payload);
        }

        // Aggregate leaderboard + correct answer for the host big-screen.
        Map<String, Object> hostPayload = new LinkedHashMap<>();
        hostPayload.put("type", "reveal");
        hostPayload.put("index", room.currentIndex);
        putCorrectAnswer(hostPayload, q);
        hostPayload.put("isLast", room.currentIndex >= room.questions.size() - 1);
        hostPayload.put("leaderboard", leaderboard(room, LEADERBOARD_TOP_N));
        sendTo(room.hostSession, hostPayload);
    }

    private void finish(RoomState room) {
        if (room.finished) {
            return;
        }
        room.finished = true;
        room.finishedAtMillis = System.currentTimeMillis();
        room.touch();
        if (room.questionTimer != null) {
            room.questionTimer.cancel(false);
        }
        List<Map<String, Object>> full = leaderboard(room, Integer.MAX_VALUE);
        broadcast(room, finalPayload(room));

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

        // The room is intentionally NOT dropped here. It used to be, which
        // meant a student whose socket was mid-reconnect when the quiz ended
        // could never get back in (unknown room => handshake refused) and a
        // late joiner got "no such room" instead of "already finished". The
        // sweeper discards it after FINISHED_GRACE_MS.
        log.info("Quiz room {} finished with {} participants", room.roomCode, participants.size());
    }

    // ─── Leaderboard helpers ───────────────────────────────────────────────────

    /** Descending-by-score leaderboard rows: {rank, userId, name, avatar, score}. */
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
            row.put("avatar", room.avatars.getOrDefault(uid, ""));
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

    /**
     * Savol jonli bo'lgan paytda hammaga (host + o'quvchilar) ketadigan payload.
     * Bu yerga to'g'ri javobga tegishli hech narsa (correctIndex,
     * acceptableAnswers, correctValue, tolerance) QO'SHILMAYDI — javob faqat
     * {@link #reveal} da oshkor bo'ladi. Har bir tur uchun faqat javob berish
     * uchun zarur maydonlar yuboriladi.
     *
     * <p>Xabar konverti allaqachon {@code type: "question"} ni ishlatgani uchun
     * savol turi {@code questionType} nomi bilan boradi.
     */
    private Map<String, Object> questionPayload(RoomState room) {
        QuizQuestion q = room.questions.get(room.currentIndex);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "question");
        payload.put("questionType", q.type());
        payload.put("index", room.currentIndex);
        payload.put("totalQuestions", room.questions.size());
        payload.put("text", q.text());
        // mcq/true_false uchun variantlar; qolgan turlarda bo'sh ro'yxat
        // (klient variant tugmalari o'rniga input/slayder ko'rsatadi).
        payload.put("options", q.options());
        if (QuizQuestion.TYPE_SLIDER.equals(q.type())) {
            payload.put("sliderMin", q.sliderMin());
            payload.put("sliderMax", q.sliderMax());
            payload.put("sliderStep", q.sliderStep());
        }
        payload.put("timeLimitSeconds", q.timeLimitSeconds());
        return payload;
    }

    /**
     * Reveal payload'iga savol turiga mos "to'g'ri javob" maydonini qo'shadi:
     * mcq/true_false → {@code correctIndex}, type_answer → {@code correctAnswer}
     * (ko'rsatish uchun birinchi ruxsat etilgan javob), slider →
     * {@code correctValue}. Klient turni {@code question} xabaridan biladi.
     */
    private void putCorrectAnswer(Map<String, Object> payload, QuizQuestion q) {
        switch (q.type()) {
            case QuizQuestion.TYPE_TYPE_ANSWER -> {
                List<String> answers = q.acceptableAnswers();
                payload.put("correctAnswer", (answers == null || answers.isEmpty()) ? "" : answers.get(0));
            }
            case QuizQuestion.TYPE_SLIDER -> payload.put("correctValue", q.correctValue());
            default -> payload.put("correctIndex", q.correctIndex());
        }
    }

    /**
     * Final podium message. Built here (not inline in {@link #finish}) because
     * a student reconnecting after the quiz ended has to receive the exact
     * same message to render the podium.
     */
    private Map<String, Object> finalPayload(RoomState room) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "final");
        payload.put("roomCode", room.roomCode);
        payload.put("title", room.title);
        payload.put("leaderboard", leaderboard(room, Integer.MAX_VALUE));
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
        payload.put("participants", lobbyParticipants(room));
        return payload;
    }

    private void broadcastLobby(RoomState room) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "lobby");
        payload.put("count", room.studentSessions.size());
        payload.put("participants", lobbyParticipants(room));
        sendTo(room.hostSession, payload);
    }

    /** Lobby rows for the host's big screen: {userId, name, avatar}. */
    private List<Map<String, Object>> lobbyParticipants(RoomState room) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Long uid : room.studentSessions.keySet()) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("userId", uid);
            p.put("name", room.names.getOrDefault(uid, "O'quvchi #" + uid));
            p.put("avatar", room.avatars.getOrDefault(uid, ""));
            out.add(p);
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
