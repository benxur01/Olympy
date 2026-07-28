package uz.olympy.quiz.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import uz.olympy.quiz.model.RoomSnapshot;
import uz.olympy.quiz.model.RoomState;

/**
 * Redis mirror of the live quiz rooms: one JSON {@link RoomSnapshot} per room
 * under {@code quiz:room:<roomCode>}. {@link RoomService} keeps serving rooms
 * from memory — this only exists so a crash or redeploy doesn't throw every
 * classroom out of its running quiz.
 *
 * <p>Everything here is best-effort: Redis being slow or down must never break
 * a lesson, so failures are logged and swallowed rather than propagated into
 * the WebSocket path.
 *
 * <p>Rollout is gated by {@code quiz.redis-persistence.enabled}
 * (env {@code QUIZ_REDIS_PERSISTENCE_ENABLED}), OFF by default: the service is
 * live, so the code ships dark and is switched on deliberately. While it is off
 * no Redis command is issued at all.
 */
@Service
public class RoomStore {

    private static final Logger log = LoggerFactory.getLogger(RoomStore.class);

    private static final String KEY_PREFIX = "quiz:room:";
    private static final String KEY_PATTERN = KEY_PREFIX + "*";
    /** SCAN batch hint — keeps each round trip small. */
    private static final int SCAN_COUNT = 100;

    /**
     * Key lifetime. Reuses {@link RoomService#IDLE_ROOM_TTL_MS} — the longest a
     * room can survive in memory — so Redis expires a room no earlier than the
     * in-process sweep would, and still cleans up by itself if the service dies
     * before sweeping (every save pushes the expiry out again, mirroring the way
     * the sweep measures from {@code lastActivityMillis}).
     */
    private static final Duration KEY_TTL = Duration.ofMillis(RoomService.IDLE_ROOM_TTL_MS);

    private final StringRedisTemplate redis;
    private final boolean enabled;

    /**
     * Unknown properties are ignored on read for two reasons: derived getters
     * are written but cannot be read back into a record ({@code QuizQuestion}
     * has {@code isIndexBased()}, which Jackson emits as {@code indexBased} and
     * the canonical constructor has no slot for), and a snapshot written by a
     * newer build must still be readable if a deploy rolls back.
     */
    private final ObjectMapper mapper = new ObjectMapper()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    public RoomStore(StringRedisTemplate redis,
                     @Value("${quiz.redis-persistence.enabled:false}") boolean enabled) {
        this.redis = redis;
        this.enabled = enabled;
        log.info("Quiz room Redis persistence {}", enabled ? "ENABLED" : "disabled");
    }

    /** Write the room's persistent state. Call with the room's lock held. */
    public void save(RoomState room) {
        if (!enabled) {
            return;
        }
        try {
            String json = mapper.writeValueAsString(room.toSnapshot());
            redis.opsForValue().set(key(room.roomCode), json, KEY_TTL);
        } catch (Exception e) {
            log.warn("Quiz room {} could not be saved to Redis: {}", room.roomCode, e.toString());
        }
    }

    public Optional<RoomState> load(String roomCode) {
        if (!enabled || roomCode == null) {
            return Optional.empty();
        }
        try {
            return Optional.ofNullable(redis.opsForValue().get(key(roomCode))).map(this::deserialize);
        } catch (Exception e) {
            log.warn("Quiz room {} could not be loaded from Redis: {}", roomCode, e.toString());
            return Optional.empty();
        }
    }

    /**
     * Every stored room. Iterates with SCAN (never {@code KEYS}, which blocks
     * the whole Redis server for the duration of the scan) — this Redis instance
     * is shared with Django and Celery.
     */
    public List<RoomState> loadAll() {
        if (!enabled) {
            return List.of();
        }
        List<RoomState> rooms = new ArrayList<>();
        try {
            ScanOptions options = ScanOptions.scanOptions().match(KEY_PATTERN).count(SCAN_COUNT).build();
            List<String> keys = new ArrayList<>();
            try (Cursor<String> cursor = redis.scan(options)) {
                while (cursor.hasNext()) {
                    keys.add(cursor.next());
                }
            }
            for (String key : keys) {
                String json = redis.opsForValue().get(key);
                if (json == null) {
                    continue; // expired between the scan and the read
                }
                RoomState room = deserialize(json);
                if (room != null) {
                    rooms.add(room);
                }
            }
        } catch (Exception e) {
            log.warn("Quiz rooms could not be listed from Redis: {}", e.toString());
        }
        return rooms;
    }

    public void delete(String roomCode) {
        if (!enabled || roomCode == null) {
            return;
        }
        try {
            redis.delete(key(roomCode));
        } catch (Exception e) {
            log.warn("Quiz room {} could not be deleted from Redis: {}", roomCode, e.toString());
        }
    }

    /** A single unreadable value must not abort the whole rehydration. */
    private RoomState deserialize(String json) {
        try {
            return RoomState.fromSnapshot(mapper.readValue(json, RoomSnapshot.class));
        } catch (Exception e) {
            log.warn("Skipping unreadable quiz room snapshot: {}", e.toString());
            return null;
        }
    }

    private static String key(String roomCode) {
        return KEY_PREFIX + roomCode;
    }
}
