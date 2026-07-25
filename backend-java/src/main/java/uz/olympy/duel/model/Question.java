package uz.olympy.duel.model;

import java.util.List;

/**
 * A single duel question. {@code correctIndex} is never sent to clients.
 */
public record Question(int id, String text, List<String> options, int correctIndex) {
}
