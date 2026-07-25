package uz.olympy.quiz.model;

import java.util.List;

/**
 * One Kahoot-style question in a live classroom quiz.
 *
 * <p>Unlike the duel's {@link uz.olympy.duel.model.Question}, the per-question
 * answer window ({@code timeLimitSeconds}) is chosen by the host and carried
 * with the question. {@code correctIndex} is never sent to clients while a
 * question is live — only revealed once the round ends.
 */
public record QuizQuestion(String text, List<String> options, int correctIndex, int timeLimitSeconds) {
}
