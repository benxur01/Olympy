package uz.olympy.quiz.model;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

import org.springframework.web.socket.WebSocketSession;

/**
 * State for one live "Kahoot-style" classroom quiz room. Served entirely from
 * memory; every mutation is additionally mirrored to Redis as a
 * {@link RoomSnapshot} (see {@link uz.olympy.quiz.service.RoomStore}) so a
 * crash or redeploy of the service no longer wipes rooms mid-lesson — on
 * startup {@link uz.olympy.quiz.service.RoomService} reloads them and the
 * clients reconnect into their running quiz.
 *
 * <p>Still single-instance: Redis is a durability tier here, not a coordination
 * one. Fanning out across several instances (Pub/Sub, distributed locks) is out
 * of scope, so exactly one instance may own these rooms at a time.
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

    /**
     * Last time anyone touched this room (created / connected / answered /
     * host command). Drives the abandoned-room sweep in
     * {@link uz.olympy.quiz.service.RoomService}: a host who closes the tab
     * without ending the quiz otherwise leaves the room — and its code —
     * alive forever.
     */
    public long lastActivityMillis = System.currentTimeMillis();
    /** When {@link #finished} was set; 0 while the quiz is still running. */
    public long finishedAtMillis = 0L;

    public RoomState(String roomCode, long hostUserId, String title, List<QuizQuestion> questions) {
        this.roomCode = roomCode;
        this.hostUserId = hostUserId;
        this.title = title;
        this.questions = questions;
    }

    /** Mark the room as still in use (see {@link #lastActivityMillis}). */
    public void touch() {
        this.lastActivityMillis = System.currentTimeMillis();
    }

    /** Persistent half of this room, for Redis. Call with the lock held. */
    public RoomSnapshot toSnapshot() {
        return RoomSnapshot.from(this);
    }

    /**
     * Rebuild a room from Redis after a restart. Sessions start empty and the
     * auto-reveal timer starts null — both are re-established by the caller
     * ({@code RoomService} reschedules the timer; the clients reconnect their
     * own sockets).
     */
    public static RoomState fromSnapshot(RoomSnapshot snapshot) {
        RoomState room = new RoomState(
                snapshot.roomCode(),
                snapshot.hostUserId(),
                snapshot.title(),
                snapshot.questions() == null ? List.of() : snapshot.questions());
        putAllIfPresent(room.names, snapshot.names());
        putAllIfPresent(room.avatars, snapshot.avatars());
        putAllIfPresent(room.totalScores, snapshot.totalScores());
        putAllIfPresent(room.roundPoints, snapshot.roundPoints());
        putAllIfPresent(room.roundCorrect, snapshot.roundCorrect());
        if (snapshot.answeredThisRound() != null) {
            room.answeredThisRound.addAll(snapshot.answeredThisRound());
        }
        room.currentIndex = snapshot.currentIndex();
        room.started = snapshot.started();
        room.finished = snapshot.finished();
        room.revealed = snapshot.revealed();
        room.questionStartMillis = snapshot.questionStartMillis();
        room.lastActivityMillis = snapshot.lastActivityMillis();
        room.finishedAtMillis = snapshot.finishedAtMillis();
        return room;
    }

    private static <V> void putAllIfPresent(Map<Long, V> target, Map<Long, V> source) {
        if (source != null) {
            target.putAll(source);
        }
    }

    public boolean isHost(long userId) {
        return userId == hostUserId;
    }
}
