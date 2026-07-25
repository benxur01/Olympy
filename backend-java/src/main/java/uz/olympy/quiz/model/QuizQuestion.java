package uz.olympy.quiz.model;

import java.util.List;

/**
 * One Kahoot-style question in a live classroom quiz.
 *
 * <p>Unlike the duel's {@link uz.olympy.duel.model.Question}, the per-question
 * answer window ({@code timeLimitSeconds}) is chosen by the host and carried
 * with the question. The correct answer (whichever field holds it for this
 * {@code type}) is never sent to clients while a question is live — only
 * revealed once the round ends.
 *
 * <p>{@code type} is the discriminator; the type-specific fields are null/empty
 * for the types that don't use them (bitta record — {@code RoomService} va
 * {@code QuizController} da bitta joyda `switch (type)` qilish yetarli, alohida
 * sealed ierarxiya kod hajmini oshirar edi):
 * <ul>
 *   <li>{@link #TYPE_MCQ} — {@code options} (4 ta) + {@code correctIndex}</li>
 *   <li>{@link #TYPE_TRUE_FALSE} — {@code options} (2 ta) + {@code correctIndex}</li>
 *   <li>{@link #TYPE_TYPE_ANSWER} — {@code acceptableAnswers} (normalizatsiyadan
 *       keyin solishtiriladigan variantlar)</li>
 *   <li>{@link #TYPE_SLIDER} — {@code sliderMin/sliderMax/sliderStep} +
 *       {@code correctValue} va {@code tolerance}</li>
 * </ul>
 */
public record QuizQuestion(
        String type,
        String text,
        List<String> options,
        int correctIndex,
        List<String> acceptableAnswers,
        Integer sliderMin,
        Integer sliderMax,
        Integer sliderStep,
        Integer correctValue,
        Integer tolerance,
        int timeLimitSeconds
) {

    public static final String TYPE_MCQ = "mcq";
    public static final String TYPE_TRUE_FALSE = "true_false";
    public static final String TYPE_TYPE_ANSWER = "type_answer";
    public static final String TYPE_SLIDER = "slider";

    /** Default true/false labels when the host doesn't send its own. */
    public static final List<String> TRUE_FALSE_OPTIONS = List.of("To'g'ri", "Noto'g'ri");

    public QuizQuestion {
        // Eski klientlar `type` yubormaydi — ular faqat 4 variantli MCQ
        // yaratardi, shuning uchun default `mcq` (orqaga moslik).
        if (type == null || type.isBlank()) {
            type = TYPE_MCQ;
        }
        if (options == null) {
            options = List.of();
        }
    }

    /** 4-option classic MCQ (the only type that existed before phase 1). */
    public static QuizQuestion mcq(String text, List<String> options, int correctIndex, int timeLimitSeconds) {
        return new QuizQuestion(TYPE_MCQ, text, options, correctIndex, null,
                null, null, null, null, null, timeLimitSeconds);
    }

    /** Two-option question; index-scored exactly like {@link #mcq}. */
    public static QuizQuestion trueFalse(String text, List<String> options, int correctIndex, int timeLimitSeconds) {
        return new QuizQuestion(TYPE_TRUE_FALSE, text, options, correctIndex, null,
                null, null, null, null, null, timeLimitSeconds);
    }

    /** Free-text answer; scored by normalized comparison against the candidates. */
    public static QuizQuestion typeAnswer(String text, List<String> acceptableAnswers, int timeLimitSeconds) {
        return new QuizQuestion(TYPE_TYPE_ANSWER, text, List.of(), -1, acceptableAnswers,
                null, null, null, null, null, timeLimitSeconds);
    }

    /** Numeric range; scored correct when the submitted value is within tolerance. */
    public static QuizQuestion slider(String text, int min, int max, int step,
                                      int correctValue, int tolerance, int timeLimitSeconds) {
        return new QuizQuestion(TYPE_SLIDER, text, List.of(), -1, null,
                min, max, step, correctValue, tolerance, timeLimitSeconds);
    }

    /** True for the types whose answer is an option index (mcq / true_false). */
    public boolean isIndexBased() {
        return TYPE_MCQ.equals(type) || TYPE_TRUE_FALSE.equals(type);
    }
}
