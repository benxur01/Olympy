package uz.olympy.duel.service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import uz.olympy.duel.model.MatchState;

/**
 * Dead-simple v1 pairing: one waiting slot. First caller waits; the second
 * caller pairs with them, a match is created, and both are told the matchId.
 * The first caller learns its matchId by polling {@code /api/duel/queue} again.
 *
 * <p>All state is in-memory. Redis-backed matchmaking/scaling is deferred.
 */
@Service
public class MatchmakingService {

    private final QuestionBank questionBank;

    /** matchId -> live match state. */
    private final Map<String, MatchState> matches = new ConcurrentHashMap<>();
    /** userId -> matchId once paired (so the waiting player can discover it). */
    private final Map<Long, String> matchedByUser = new ConcurrentHashMap<>();

    /** The single user currently waiting for an opponent, or null. */
    private Long waitingUserId = null;

    public MatchmakingService(QuestionBank questionBank) {
        this.questionBank = questionBank;
    }

    public record QueueResult(String status, String matchId) {
        static QueueResult waiting() {
            return new QueueResult("waiting", null);
        }
        static QueueResult matched(String matchId) {
            return new QueueResult("matched", matchId);
        }
    }

    /**
     * Enqueue a user for matchmaking.
     * <ul>
     *   <li>Already paired -> {@code matched} with their matchId.</li>
     *   <li>Someone else waiting -> pair now, create match -> {@code matched}.</li>
     *   <li>Nobody waiting -> become the waiter -> {@code waiting}.</li>
     * </ul>
     */
    public synchronized QueueResult enqueue(long userId, String subject) {
        String existing = matchedByUser.get(userId);
        if (existing != null) {
            return QueueResult.matched(existing);
        }
        if (waitingUserId != null && waitingUserId != userId) {
            long opponentId = waitingUserId;
            waitingUserId = null;
            String matchId = UUID.randomUUID().toString();
            MatchState match = new MatchState(
                    matchId, opponentId, userId, subject, questionBank.forSubject(subject));
            matches.put(matchId, match);
            matchedByUser.put(opponentId, matchId);
            matchedByUser.put(userId, matchId);
            return QueueResult.matched(matchId);
        }
        // Nobody waiting (or the same user re-polling before an opponent arrives).
        waitingUserId = userId;
        return QueueResult.waiting();
    }

    public MatchState getMatch(String matchId) {
        return matches.get(matchId);
    }

    /** Remove a finished match and its user->match bindings. */
    public synchronized void removeMatch(MatchState match) {
        matches.remove(match.matchId);
        matchedByUser.remove(match.player1Id);
        matchedByUser.remove(match.player2Id);
    }
}
