package uz.olympy.duel.service;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import com.fasterxml.jackson.databind.ObjectMapper;

import uz.olympy.duel.client.DjangoClient;
import uz.olympy.duel.model.MatchState;
import uz.olympy.duel.model.Question;

/**
 * Runs the live duel: starts when both players are connected, broadcasts the 5
 * questions one at a time with a per-question timer, scores answers, and on
 * completion posts the result to Django and broadcasts the final outcome.
 *
 * <p>All state transitions for a given match synchronize on the {@link MatchState}
 * instance, so answers and the auto-advance timer can't race.
 */
@Service
public class DuelService {

    private static final Logger log = LoggerFactory.getLogger(DuelService.class);

    private final DjangoClient djangoClient;
    private final MatchmakingService matchmaking;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    private final int questionTimeoutSeconds;

    public DuelService(DjangoClient djangoClient, MatchmakingService matchmaking,
                       @Value("${duel.question-timeout-seconds}") int questionTimeoutSeconds) {
        this.djangoClient = djangoClient;
        this.matchmaking = matchmaking;
        this.questionTimeoutSeconds = questionTimeoutSeconds;
    }

    /** Register a player's socket; start the duel once both are present. */
    public void onConnect(MatchState match, long userId, WebSocketSession session) {
        synchronized (match) {
            match.sessions.put(userId, session);
            sendTo(session, Map.of(
                    "type", "connected",
                    "matchId", match.matchId,
                    "userId", userId,
                    "totalQuestions", match.questions.size()));
            if (match.bothConnected() && !match.started) {
                startDuel(match);
            }
        }
    }

    private void startDuel(MatchState match) {
        match.started = true;
        match.currentIndex = -1;
        broadcast(match, Map.of(
                "type", "match_start",
                "matchId", match.matchId,
                "player1Id", match.player1Id,
                "player2Id", match.player2Id,
                "totalQuestions", match.questions.size()));
        advance(match);
    }

    /** Handle an incoming answer. Ignores stale/duplicate answers safely. */
    public void onAnswer(MatchState match, long userId, int questionIndex, int answerIndex) {
        synchronized (match) {
            if (match.finished || !match.started) {
                return;
            }
            if (questionIndex != match.currentIndex) {
                return; // stale answer for a past/future question
            }
            if (!match.answeredThisRound.add(userId)) {
                return; // already answered this round
            }
            Question q = match.questions.get(match.currentIndex);
            boolean correct = (answerIndex == q.correctIndex());
            long elapsed = System.currentTimeMillis() - match.questionStartMillis;
            match.totalAnswerMillis.merge(userId, elapsed, Long::sum);
            if (correct) {
                match.scores.merge(userId, 1, Integer::sum);
            }
            sendTo(match.sessions.get(userId), Map.of(
                    "type", "answer_ack",
                    "index", questionIndex,
                    "correct", correct,
                    "correctIndex", q.correctIndex(),
                    "myScore", match.scores.getOrDefault(userId, 0)));

            if (match.answeredThisRound.size() >= 2) {
                if (match.questionTimer != null) {
                    match.questionTimer.cancel(false);
                }
                advance(match);
            }
        }
    }

    /** Move to the next question, or finish if the last one is done. Caller holds the lock. */
    private void advance(MatchState match) {
        if (match.finished) {
            return;
        }
        match.currentIndex++;
        if (match.currentIndex >= match.questions.size()) {
            finish(match);
            return;
        }
        match.answeredThisRound.clear();
        match.questionStartMillis = System.currentTimeMillis();
        Question q = match.questions.get(match.currentIndex);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "question");
        payload.put("index", match.currentIndex);
        payload.put("questionId", q.id());
        payload.put("text", q.text());
        payload.put("options", q.options());
        payload.put("timeoutSeconds", questionTimeoutSeconds);
        broadcast(match, payload);

        final int scheduledIndex = match.currentIndex;
        match.questionTimer = scheduler.schedule(() -> {
            synchronized (match) {
                // Only advance if we're still on the question this timer was for.
                if (!match.finished && match.currentIndex == scheduledIndex) {
                    advance(match);
                }
            }
        }, questionTimeoutSeconds, TimeUnit.SECONDS);
    }

    private void finish(MatchState match) {
        match.finished = true;
        if (match.questionTimer != null) {
            match.questionTimer.cancel(false);
        }
        int s1 = match.scores.getOrDefault(match.player1Id, 0);
        int s2 = match.scores.getOrDefault(match.player2Id, 0);
        Long winnerId;
        if (s1 > s2) {
            winnerId = match.player1Id;
        } else if (s2 > s1) {
            winnerId = match.player2Id;
        } else {
            // Tie on score -> faster total answer time wins; else true draw.
            long t1 = match.totalAnswerMillis.getOrDefault(match.player1Id, 0L);
            long t2 = match.totalAnswerMillis.getOrDefault(match.player2Id, 0L);
            if (t1 < t2) {
                winnerId = match.player1Id;
            } else if (t2 < t1) {
                winnerId = match.player2Id;
            } else {
                winnerId = null;
            }
        }

        djangoClient.postDuelResult(
                match.matchId, match.player1Id, match.player2Id, s1, s2, winnerId, match.subject);

        Map<String, Object> scores = new LinkedHashMap<>();
        scores.put(String.valueOf(match.player1Id), s1);
        scores.put(String.valueOf(match.player2Id), s2);
        broadcast(match, Map.of(
                "type", "duel_end",
                "matchId", match.matchId,
                "scores", scores,
                "winnerId", winnerId == null ? "" : winnerId,
                "isDraw", winnerId == null));

        matchmaking.removeMatch(match);
        log.info("Duel {} finished: {} vs {} (winner {})", match.matchId, s1, s2, winnerId);
    }

    private void broadcast(MatchState match, Map<String, Object> message) {
        for (WebSocketSession s : match.sessions.values()) {
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
