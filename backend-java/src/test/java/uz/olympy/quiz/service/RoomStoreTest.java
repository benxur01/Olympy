package uz.olympy.quiz.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import uz.olympy.quiz.model.QuizQuestion;
import uz.olympy.quiz.model.RoomState;

/**
 * {@link RoomStore} against a fake Redis (a map behind a mocked
 * {@link StringRedisTemplate}) — no Redis server, no Testcontainers, so it runs
 * anywhere the rest of the suite does.
 */
class RoomStoreTest {

    /** Stand-in for the Redis keyspace. */
    private final Map<String, String> keyspace = new LinkedHashMap<>();

    private StringRedisTemplate redis;
    private ValueOperations<String, String> valueOps;
    private RoomStore store;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        valueOps = mock(ValueOperations.class);

        when(redis.opsForValue()).thenReturn(valueOps);
        doAnswer(invocation -> keyspace.put(invocation.getArgument(0), invocation.getArgument(1)))
                .when(valueOps).set(anyString(), anyString(), any(Duration.class));
        when(valueOps.get(anyString())).thenAnswer(invocation -> keyspace.get(invocation.getArgument(0)));
        when(redis.delete(anyString()))
                .thenAnswer(invocation -> keyspace.remove(invocation.getArgument(0)) != null);
        when(redis.scan(any(ScanOptions.class))).thenAnswer(invocation -> {
            ScanOptions options = invocation.getArgument(0);
            String prefix = options.getPattern().replace("*", "");
            List<String> matches = new ArrayList<>();
            for (String key : keyspace.keySet()) {
                if (key.startsWith(prefix)) {
                    matches.add(key);
                }
            }
            return cursorOver(matches);
        });

        store = new RoomStore(redis, true);
    }

    @Test
    void savedRoomLoadsBackWithEveryPersistedField() {
        RoomState original = populatedRoom("100001");

        store.save(original);
        RoomState loaded = store.load("100001").orElseThrow();

        assertThat(loaded.roomCode).isEqualTo("100001");
        assertThat(loaded.hostUserId).isEqualTo(42L);
        assertThat(loaded.title).isEqualTo("Matematika");
        assertThat(loaded.questions).isEqualTo(original.questions);
        assertThat(loaded.names).containsExactlyInAnyOrderEntriesOf(original.names);
        assertThat(loaded.avatars).containsExactlyInAnyOrderEntriesOf(original.avatars);
        assertThat(loaded.totalScores).containsExactlyInAnyOrderEntriesOf(original.totalScores);
        assertThat(loaded.roundPoints).containsExactlyInAnyOrderEntriesOf(original.roundPoints);
        assertThat(loaded.roundCorrect).containsExactlyInAnyOrderEntriesOf(original.roundCorrect);
        assertThat(loaded.answeredThisRound).containsExactlyInAnyOrderElementsOf(original.answeredThisRound);
        assertThat(loaded.currentIndex).isEqualTo(original.currentIndex);
        assertThat(loaded.started).isTrue();
        assertThat(loaded.finished).isFalse();
        assertThat(loaded.revealed).isFalse();
        assertThat(loaded.questionStartMillis).isEqualTo(original.questionStartMillis);
        assertThat(loaded.lastActivityMillis).isEqualTo(original.lastActivityMillis);
        assertThat(loaded.finishedAtMillis).isEqualTo(original.finishedAtMillis);

        // Live-only state is deliberately not carried across a restart.
        assertThat(loaded.hostSession).isNull();
        assertThat(loaded.studentSessions).isEmpty();
        // Cast: ScheduledFuture matches both assertThat(T) and assertThat(Future).
        assertThat((Object) loaded.questionTimer).isNull();
    }

    @Test
    void saveStoresJsonUnderThePrefixedKeyWithAnExpiry() {
        store.save(populatedRoom("100001"));

        assertThat(keyspace).containsOnlyKeys("quiz:room:100001");
        assertThat(keyspace.get("quiz:room:100001")).contains("\"roomCode\":\"100001\"");
        // Stale rooms must fall out of Redis on their own if the service dies.
        verify(valueOps).set(eq("quiz:room:100001"), anyString(),
                eq(Duration.ofMillis(RoomService.IDLE_ROOM_TTL_MS)));
    }

    @Test
    void loadAllRehydratesEveryStoredRoomWithoutUsingKeys() {
        store.save(populatedRoom("100001"));
        store.save(populatedRoom("200002"));
        store.save(populatedRoom("300003"));
        keyspace.put("duel:match:900009", "{\"unrelated\":true}");

        List<RoomState> loaded = store.loadAll();

        assertThat(loaded).extracting(room -> room.roomCode)
                .containsExactlyInAnyOrder("100001", "200002", "300003");
        assertThat(loaded).allSatisfy(room -> assertThat(room.questions).hasSize(2));
        // Hard rule: SCAN only — KEYS blocks the whole (shared) Redis server.
        verify(redis, never()).keys(anyString());
        verify(redis).scan(any(ScanOptions.class));
    }

    @Test
    void unknownRoomLoadsAsEmpty() {
        assertThat(store.load("999999")).isEmpty();
        assertThat(store.loadAll()).isEmpty();
    }

    @Test
    void deleteRemovesTheStoredRoom() {
        store.save(populatedRoom("100001"));

        store.delete("100001");

        assertThat(keyspace).isEmpty();
        assertThat(store.load("100001")).isEmpty();
    }

    @Test
    void disabledStoreIssuesNoRedisCommandsAtAll() {
        StringRedisTemplate untouched = mock(StringRedisTemplate.class);
        RoomStore disabled = new RoomStore(untouched, false);

        disabled.save(populatedRoom("100001"));

        assertThat(disabled.load("100001")).isEmpty();
        assertThat(disabled.loadAll()).isEmpty();
        disabled.delete("100001");
        verifyNoInteractions(untouched);
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    /** A room mid-quiz, with at least one value in every persisted collection. */
    private RoomState populatedRoom(String roomCode) {
        List<QuizQuestion> questions = List.of(
                QuizQuestion.mcq("2 + 2 = ?", List.of("3", "4", "5", "6"), 1, 20),
                QuizQuestion.slider("Yer radiusi (km)?", 1000, 10000, 100, 6371, 50, 30));
        RoomState room = new RoomState(roomCode, 42L, "Matematika", questions);
        room.names.put(7L, "Ali");
        room.names.put(8L, "Vali");
        room.avatars.put(7L, "🦊");
        room.avatars.put(8L, "");
        room.totalScores.put(7L, 1500);
        room.totalScores.put(8L, 900);
        room.roundPoints.put(7L, 800);
        room.roundCorrect.put(7L, true);
        room.roundCorrect.put(8L, false);
        room.answeredThisRound.add(7L);
        room.answeredThisRound.add(8L);
        room.currentIndex = 1;
        room.started = true;
        room.questionStartMillis = 1_700_000_000_000L;
        room.lastActivityMillis = 1_700_000_005_000L;
        return room;
    }

    @SuppressWarnings("unchecked")
    private Cursor<String> cursorOver(List<String> keys) {
        Iterator<String> iterator = keys.iterator();
        Cursor<String> cursor = mock(Cursor.class);
        when(cursor.hasNext()).thenAnswer(invocation -> iterator.hasNext());
        when(cursor.next()).thenAnswer(invocation -> iterator.next());
        return cursor;
    }
}
