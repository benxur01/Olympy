package uz.olympy.duel;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * "Brain Battles" — real-time 1v1 duel service.
 *
 * <p>Two students face off live over a WebSocket, answering 5 quick questions
 * head-to-head; whoever scores more (ties broken by total answer time) wins.
 *
 * <p>This service does NOT independently trust JWTs — it calls Django's
 * introspection endpoint to validate tokens, and POSTs finished results back to
 * Django so Django remains the source of truth. Match state is held in-memory
 * (single instance, v1); Redis-backed scaling is a deliberate follow-up.
 */
// scanBasePackages widened to "uz.olympy" so the sibling live-quiz module
// (uz.olympy.quiz) is component-scanned alongside the duel module. Without this
// only uz.olympy.duel.* would be picked up and the quiz controller/handler/beans
// would be invisible.
@SpringBootApplication(scanBasePackages = "uz.olympy")
public class DuelApplication {
    public static void main(String[] args) {
        SpringApplication.run(DuelApplication.class, args);
    }
}
