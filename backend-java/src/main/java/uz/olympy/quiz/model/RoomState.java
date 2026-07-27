package uz.olympy.quiz.model;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

import org.springframework.web.socket.WebSocketSession;

/**
 * In-memory state for one live "Kahoot-style" classroom quiz room. v1: single
 * instance, no persistence — a room lives only for the duration of the game
 * (Redis-backed scaling is a deliberate follow-up, matching the duel module).
 *
 * <p>Guard all mutations by synchronizing on the instance (the
 * {@link uz.olympy.quiz.service.RoomService} does this) so incoming answers and
 * the per-question auto-reveal timer can't race.
 */
public class RoomState {

    public final String roomCode;
    public final long hostUserId;
    public final String title;
    public final List<QuizQuestion> questions;

    /** The host's big-screen socket (may reconnect; last one wins). */
    public WebSocketSession hostSession;
    /** studentUserId -> live socket. */
    public final Map<Long, WebSocketSession> studentSessions = new ConcurrentHashMap<>();
    /** studentUserId -> display name / nickname (client-provided, display only). */
    public final Map<Long, String> names = new ConcurrentHashMap<>();
    /** studentUserId -> avatar emoji picked on the join screen (display only, may be empty). */
    public final Map<Long, String> avatars = new ConcurrentHashMap<>();
    /** studentUserId -> cumulative score across all answered questions. */
    public final Map<Long, Integer> totalScores = new ConcurrentHashMap<>();

    /** Per-round bookkeeping (reset each question): points earned this round. */
    public final Map<Long, Integer> roundPoints = new ConcurrentHashMap<>();
    /** Per-round bookkeeping: whether the student answered correctly this round. */
    public final Map<Long, Boolean> roundCorrect = new ConcurrentHashMap<>();
    /** studentUserIds that already answered the current question. */
    public final Set<Long> answeredThisRound = ConcurrentHashMap.newKeySet();

    /** -1 = not started; otherwise index into {@link #questions}. */
    public int currentIndex = -1;
    public boolean started = false;
    public boolean finished = false;
    /** True once the current question's results have been revealed to everyone. */
    public boolean revealed = false;
    public long questionStartMillis = 0L;

    /** Timer that auto-reveals the current question when its window elapses. */
    public ScheduledFuture<?> questionTimer;

    public RoomState(String roomCode, long hostUserId, String title, List<QuizQuestion> questions) {
        this.roomCode = roomCode;
        this.hostUserId = hostUserId;
        this.title = title;
        this.questions = questions;
    }

    public boolean isHost(long userId) {
        return userId == hostUserId;
    }
}
