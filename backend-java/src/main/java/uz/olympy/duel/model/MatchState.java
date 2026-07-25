package uz.olympy.duel.model;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

import org.springframework.web.socket.WebSocketSession;

/**
 * In-memory state for one duel. v1: single instance, no persistence — a match
 * lives only for the duration of the game. Guard mutations by synchronizing on
 * the instance (the DuelService does this).
 */
public class MatchState {

    public final String matchId;
    public final long player1Id;
    public final long player2Id;
    public final String subject;
    public final List<Question> questions;

    /** userId -> live socket. */
    public final Map<Long, WebSocketSession> sessions = new ConcurrentHashMap<>();
    /** userId -> correct-answer count. */
    public final Map<Long, Integer> scores = new ConcurrentHashMap<>();
    /** userId -> accumulated response time (ms) across answered questions (tiebreak). */
    public final Map<Long, Long> totalAnswerMillis = new ConcurrentHashMap<>();

    /** -1 = not started; otherwise index into {@link #questions}. */
    public int currentIndex = -1;
    public boolean started = false;
    public boolean finished = false;
    public long questionStartMillis = 0L;

    /** userIds that already answered the current question. */
    public final Set<Long> answeredThisRound = ConcurrentHashMap.newKeySet();
    /** Timer for the current question's auto-advance; cancelled if both answer early. */
    public ScheduledFuture<?> questionTimer;

    public MatchState(String matchId, long player1Id, long player2Id,
                      String subject, List<Question> questions) {
        this.matchId = matchId;
        this.player1Id = player1Id;
        this.player2Id = player2Id;
        this.subject = subject;
        this.questions = questions;
        scores.put(player1Id, 0);
        scores.put(player2Id, 0);
        totalAnswerMillis.put(player1Id, 0L);
        totalAnswerMillis.put(player2Id, 0L);
    }

    public boolean bothConnected() {
        return sessions.containsKey(player1Id) && sessions.containsKey(player2Id);
    }

    public boolean isParticipant(long userId) {
        return userId == player1Id || userId == player2Id;
    }
}
