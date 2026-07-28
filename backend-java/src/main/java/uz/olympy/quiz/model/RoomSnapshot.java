package uz.olympy.quiz.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Serializable projection of a {@link RoomState} — everything a room needs to
 * come back to life after the process restarts, and nothing else.
 *
 * <p>Deliberately omitted: {@code hostSession} / {@code studentSessions} (live
 * TCP sockets — meaningless in another process; the clients reconnect on their
 * own) and {@code questionTimer} (a {@link java.util.concurrent.ScheduledFuture}
 * belonging to a scheduler that no longer exists — {@code RoomService}
 * reschedules it from {@code questionStartMillis} on rehydration).
 *
 * <p>Written to / read from Redis as JSON by
 * {@link uz.olympy.quiz.service.RoomStore}. Snapshots are taken while the
 * room's lock is held, so the copies below are internally consistent.
 */
public record RoomSnapshot(
        String roomCode,
        long hostUserId,
        String title,
        List<QuizQuestion> questions,
        Map<Long, String> names,
        Map<Long, String> avatars,
        Map<Long, Integer> totalScores,
        Map<Long, Integer> roundPoints,
        Map<Long, Boolean> roundCorrect,
        Set<Long> answeredThisRound,
        int currentIndex,
        boolean started,
        boolean finished,
        boolean revealed,
        long questionStartMillis,
        long lastActivityMillis,
        long finishedAtMillis
) {

    /** Copy the persistent half of {@code room}. Call with the room's lock held. */
    public static RoomSnapshot from(RoomState room) {
        return new RoomSnapshot(
                room.roomCode,
                room.hostUserId,
                room.title,
                new ArrayList<>(room.questions),
                new LinkedHashMap<>(room.names),
                new LinkedHashMap<>(room.avatars),
                new LinkedHashMap<>(room.totalScores),
                new LinkedHashMap<>(room.roundPoints),
                new LinkedHashMap<>(room.roundCorrect),
                new LinkedHashSet<>(room.answeredThisRound),
                room.currentIndex,
                room.started,
                room.finished,
                room.revealed,
                room.questionStartMillis,
                room.lastActivityMillis,
                room.finishedAtMillis);
    }
}
